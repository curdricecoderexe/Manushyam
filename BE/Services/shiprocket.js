const { getEnv } = require("../Config/runtime");
const { AppError } = require("../Utils/AppError");
const { logger } = require("../Utils/logger");

const API = "https://apiv2.shiprocket.in/v1/external";
// Shiprocket tokens last ~10 days; renew a day early. In-memory for now — moves to Redis with the
// rest of the shared caches when the API runs on more than one instance (PLAN.md §1).
const TOKEN_TTL_MS = 9 * 24 * 3600 * 1000;
const SERVICEABILITY_TTL_MS = 60 * 60 * 1000;

let token = null;
const serviceabilityCache = new Map();

function shiprocketConfigured(env = getEnv()) {
  return Boolean(env.SHIPROCKET_EMAIL && env.SHIPROCKET_PASSWORD);
}

function resetShiprocketCache() {
  token = null;
  serviceabilityCache.clear();
}

async function call(method, path, { body, auth = true } = {}) {
  const headers = { "Content-Type": "application/json" };
  if (auth) headers.Authorization = `Bearer ${await getToken()}`;
  let res;
  try {
    res = await fetch(`${API}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(15000) });
  } catch (err) {
    logger.error({ err: err.message, path }, "Shiprocket unreachable");
    throw new AppError(502, "SHIPPING_PROVIDER_ERROR", "The shipping service didn’t respond. Please try again.");
  }
  const data = await res.json().catch(() => ({}));
  return { res, data };
}

async function getToken() {
  if (token && token.expiresAt > Date.now()) return token.value;
  const env = getEnv();
  const { res, data } = await call("POST", "/auth/login", { auth: false, body: { email: env.SHIPROCKET_EMAIL, password: env.SHIPROCKET_PASSWORD } });
  if (!res.ok || !data.token) {
    logger.error({ status: res.status }, "Shiprocket login failed");
    throw new AppError(502, "SHIPPING_PROVIDER_ERROR", "The shipping service rejected our credentials.");
  }
  token = { value: data.token, expiresAt: Date.now() + TOKEN_TTL_MS };
  return token.value;
}

// One retry with a fresh token if Shiprocket says ours has expired early.
async function request(method, path, body) {
  let out = await call(method, path, { body });
  if (out.res.status === 401) {
    token = null;
    out = await call(method, path, { body });
  }
  if (!out.res.ok) {
    logger.error({ status: out.res.status, path, message: out.data?.message }, "Shiprocket request failed");
    throw new AppError(502, "SHIPPING_PROVIDER_ERROR", out.data?.message || "The shipping service returned an error.");
  }
  return out.data;
}

// Couriers that can deliver to a PIN, summarised: fastest ETA, whether any courier offers COD.
async function checkServiceability({ pincode, weightGrams = 500, cod = true }) {
  const env = getEnv();
  const key = `${pincode}:${Math.ceil(weightGrams / 500)}`;
  const hit = serviceabilityCache.get(key);
  if (hit && hit.expiresAt > Date.now()) return hit.value;

  const qs = new URLSearchParams({ pickup_postcode: env.SHIPROCKET_PICKUP_PIN, delivery_postcode: pincode, weight: String(Math.max(0.1, weightGrams / 1000)), cod: cod ? "1" : "0" });
  const data = await request("GET", `/courier/serviceability/?${qs}`);
  const couriers = data?.data?.available_courier_companies ?? [];
  let value;
  if (!couriers.length) {
    value = { serviceable: false, codAvailable: false, etaDays: null, courier: null };
  } else {
    const days = couriers.map((c) => Number(c.estimated_delivery_days)).filter((n) => Number.isFinite(n) && n > 0);
    const best = [...couriers].sort((a, b) => Number(a.estimated_delivery_days || 99) - Number(b.estimated_delivery_days || 99))[0];
    value = {
      serviceable: true,
      codAvailable: couriers.some((c) => Number(c.cod) === 1),
      etaDays: days.length ? { min: Math.min(...days), max: Math.max(...days) } : null,
      courier: best?.courier_name ?? null,
    };
  }
  serviceabilityCache.set(key, { value, expiresAt: Date.now() + SERVICEABILITY_TTL_MS });
  return value;
}

const rupees = (paise) => Math.round(paise) / 100;

// On "packed": create the Shiprocket order, assign an AWB, schedule pickup and fetch the label.
// Returns whatever was completed so a failure part-way can be retried from the admin panel.
async function createShipment(order) {
  const env = getEnv();
  const result = { ...(order.toObject().shipment ?? {}) };
  const [first, ...rest] = (order.address.fullName || "Customer").split(" ");
  const weight = order.items.reduce((g, i) => g + (i.weightGrams || 300) * i.qty, 0);

  if (!result.shipmentId) {
    const created = await request("POST", "/orders/create/adhoc", {
      order_id: order.orderNumber,
      order_date: new Date(order.createdAt).toISOString().slice(0, 16).replace("T", " "),
      pickup_location: env.SHIPROCKET_PICKUP_LOCATION,
      billing_customer_name: first,
      billing_last_name: rest.join(" "),
      billing_address: order.address.line1,
      billing_address_2: [order.address.line2, order.address.landmark].filter(Boolean).join(", "),
      billing_city: order.address.city,
      billing_pincode: order.address.pincode,
      billing_state: order.address.state,
      billing_country: "India",
      billing_email: order.email,
      billing_phone: order.address.phone,
      shipping_is_billing: true,
      order_items: order.items.map((i) => ({ name: i.name, sku: i.sku, units: i.qty, selling_price: rupees(i.price) })),
      payment_method: order.paymentMethod === "cod" ? "COD" : "Prepaid",
      shipping_charges: rupees(order.amounts.shipping),
      transaction_charges: rupees(order.amounts.codFee),
      total_discount: rupees(order.amounts.discount),
      sub_total: rupees(order.amounts.total),
      length: 20,
      breadth: 15,
      height: 10,
      weight: Math.max(0.1, weight / 1000),
    });
    result.shiprocketOrderId = String(created.order_id);
    result.shipmentId = String(created.shipment_id);
  }
  if (!result.awb) {
    const awb = await request("POST", "/courier/assign/awb", { shipment_id: result.shipmentId });
    const data = awb?.response?.data ?? {};
    if (!data.awb_code) throw new AppError(502, "SHIPPING_PROVIDER_ERROR", "No courier could be assigned yet.");
    result.awb = String(data.awb_code);
    result.courier = data.courier_name ?? null;
    result.trackingUrl = `https://shiprocket.co/tracking/${encodeURIComponent(result.awb)}`;
    await request("POST", "/courier/generate/pickup", { shipment_id: [result.shipmentId] });
  }
  if (!result.labelUrl) {
    const label = await request("POST", "/courier/generate/label", { shipment_id: [result.shipmentId] });
    result.labelUrl = label?.label_url ?? null;
  }
  return result;
}

async function trackAwb(awb) {
  const data = await request("GET", `/courier/track/awb/${encodeURIComponent(awb)}`);
  const t = data?.tracking_data ?? {};
  return {
    currentStatus: t.shipment_track?.[0]?.current_status ?? null,
    trackingUrl: t.track_url ?? null,
    events: (t.shipment_track_activities ?? []).map((a) => ({ at: parseDate(a.date), status: a["sr-status-label"] || a.status, location: a.location, activity: a.activity })),
  };
}

function parseDate(s) {
  const d = new Date(String(s ?? "").replace(" ", "T") + "+05:30");
  return Number.isNaN(d.getTime()) ? new Date() : d;
}

// Shiprocket's free-text status → our order status (null = no change).
function mapShipmentStatus(status) {
  const s = String(status ?? "")
    .toUpperCase()
    .trim();
  if (!s) return null;
  if (s.startsWith("RTO")) return "rto";
  if (s === "DELIVERED") return "delivered";
  if (s === "OUT FOR DELIVERY") return "out_for_delivery";
  if (["PICKED UP", "SHIPPED", "IN TRANSIT", "REACHED AT DESTINATION HUB", "REACHED DESTINATION HUB", "DELAYED", "MISROUTED"].includes(s)) return "shipped";
  return null;
}

module.exports = { shiprocketConfigured, resetShiprocketCache, checkServiceability, createShipment, trackAwb, mapShipmentStatus, parseDate };
