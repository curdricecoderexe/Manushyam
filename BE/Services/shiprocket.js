const { getEnv } = require("../Config/runtime");
const { ProviderToken } = require("../Models/Shipping");
const { AppError } = require("../Utils/AppError");
const { logger } = require("../Utils/logger");

const API = "https://apiv2.shiprocket.in/v1/external";
const TIMEOUT_MS = 20000;
// Shiprocket tokens last 10 days; renew a day early. Kept in memory and in Mongo so every API
// instance (and a restarted one) reuses the same token instead of logging in again.
const TOKEN_TTL_MS = 9 * 24 * 3600 * 1000;
const TOKEN_ID = "shiprocket";
const SERVICEABILITY_TTL_MS = 60 * 60 * 1000;
const SERVICEABILITY_MAX_ENTRIES = 5000;
// Reads are retried on network errors / 5xx / 429; writes (order create, AWB, pickup) are not.
const RETRY_DELAYS_MS = [400, 1500];

let token = null;
let loggingIn = null;
const serviceabilityCache = new Map();

function shiprocketConfigured(env = getEnv()) {
  return Boolean(env.SHIPROCKET_EMAIL && env.SHIPROCKET_PASSWORD);
}

function resetShiprocketCache() {
  token = null;
  loggingIn = null;
  serviceabilityCache.clear();
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Shiprocket reports errors as { message } or { errors: { field: [msg] } }.
function providerMessage(data) {
  if (data?.errors && typeof data.errors === "object") {
    const first = Object.values(data.errors).flat()[0];
    if (first) return String(first);
  }
  return data?.message ? String(data.message) : null;
}

async function call(method, path, { body, auth = true } = {}) {
  const headers = { "Content-Type": "application/json", Accept: "application/json" };
  if (auth) headers.Authorization = `Bearer ${await getToken()}`;
  let res;
  try {
    res = await fetch(`${API}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(TIMEOUT_MS) });
  } catch (err) {
    return { res: null, data: null, networkError: err };
  }
  const data = await res.json().catch(() => ({}));
  return { res, data };
}

async function login() {
  const env = getEnv();
  const { res, data, networkError } = await call("POST", "/auth/login", { auth: false, body: { email: env.SHIPROCKET_EMAIL, password: env.SHIPROCKET_PASSWORD } });
  if (networkError) {
    logger.error({ err: networkError.message }, "Shiprocket unreachable (login)");
    throw new AppError(502, "SHIPPING_PROVIDER_ERROR", "The shipping service didn’t respond. Please try again.");
  }
  if (!res.ok || !data?.token) {
    logger.error({ status: res.status }, "Shiprocket login failed");
    throw new AppError(502, "SHIPPING_PROVIDER_ERROR", "The shipping service rejected our credentials. Check SHIPROCKET_EMAIL / SHIPROCKET_PASSWORD (use an API user).");
  }
  const expiresAt = new Date(Date.now() + TOKEN_TTL_MS);
  token = { value: data.token, expiresAt: expiresAt.getTime() };
  await ProviderToken.updateOne({ _id: TOKEN_ID }, { $set: { value: data.token, expiresAt } }, { upsert: true }).catch((err) => logger.warn({ err: err.message }, "Couldn't store the Shiprocket token"));
  return token.value;
}

// One login at a time: concurrent requests wait for the same one.
async function getToken() {
  if (token && token.expiresAt > Date.now()) return token.value;
  const stored = await ProviderToken.findById(TOKEN_ID)
    .lean()
    .catch(() => null);
  if (stored && stored.expiresAt.getTime() > Date.now()) {
    token = { value: stored.value, expiresAt: stored.expiresAt.getTime() };
    return token.value;
  }
  loggingIn ??= login().finally(() => {
    loggingIn = null;
  });
  return loggingIn;
}

async function invalidateToken(stale) {
  if (token?.value === stale) token = null;
  await ProviderToken.deleteOne({ _id: TOKEN_ID, value: stale }).catch(() => {});
}

async function request(method, path, body) {
  const retries = method === "GET" ? RETRY_DELAYS_MS.length : 0;
  let refreshed = false;
  for (let attempt = 0; ; attempt += 1) {
    const used = token?.value;
    const out = await call(method, path, { body });
    if (out.res?.status === 401 && !refreshed) {
      // Our token expired early or was revoked: log in again once.
      refreshed = true;
      await invalidateToken(used ?? token?.value);
      attempt -= 1;
      continue;
    }
    const retriable = out.networkError || out.res.status === 429 || out.res.status >= 500;
    if (retriable && attempt < retries) {
      await sleep(RETRY_DELAYS_MS[attempt]);
      continue;
    }
    if (out.networkError) {
      logger.error({ err: out.networkError.message, method, path }, "Shiprocket unreachable");
      throw new AppError(502, "SHIPPING_PROVIDER_ERROR", "The shipping service didn’t respond. Please try again.");
    }
    if (!out.res.ok) {
      const message = providerMessage(out.data);
      logger.error({ status: out.res.status, method, path, message }, "Shiprocket request failed");
      const err = new AppError(502, "SHIPPING_PROVIDER_ERROR", message || "The shipping service returned an error.");
      err.providerStatus = out.res.status;
      throw err;
    }
    return out.data;
  }
}

// Couriers that can deliver to a PIN, summarised: fastest ETA, whether any courier offers COD.
async function checkServiceability({ pincode, weightGrams = 500, cod = true }) {
  const env = getEnv();
  const key = `${pincode}:${Math.ceil(weightGrams / 500)}:${cod ? 1 : 0}`;
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
    const recommendedId = data?.data?.recommended_courier_company_id;
    const best = couriers.find((c) => recommendedId && c.courier_company_id === recommendedId) ?? [...couriers].sort((a, b) => Number(a.estimated_delivery_days || 99) - Number(b.estimated_delivery_days || 99))[0];
    value = {
      serviceable: true,
      codAvailable: couriers.some((c) => Number(c.cod) === 1),
      etaDays: days.length ? { min: Math.min(...days), max: Math.max(...days) } : null,
      courier: best?.courier_name ?? null,
    };
  }
  if (serviceabilityCache.size >= SERVICEABILITY_MAX_ENTRIES) serviceabilityCache.delete(serviceabilityCache.keys().next().value);
  serviceabilityCache.set(key, { value, expiresAt: Date.now() + SERVICEABILITY_TTL_MS });
  return value;
}

const rupees = (paise) => Math.round(paise) / 100;

// Links from Shiprocket end up as <a href> on customer and staff pages: only plain https URLs are kept,
// so a compromised or spoofed upstream can't plant a javascript: link.
function httpsUrl(u) {
  const s = String(u ?? "").trim();
  return /^https:\/\/[^\s"'<>\\]{1,500}$/.test(s) ? s : null;
}

// "YYYY-MM-DD HH:mm" in India time, as Shiprocket expects.
function istStamp(date) {
  const d = new Date(new Date(date).getTime() + 5.5 * 3600 * 1000);
  return d.toISOString().slice(0, 16).replace("T", " ");
}

// Couriers want a bare 10-digit Indian mobile number.
function mobile(phone) {
  const digits = String(phone ?? "").replace(/\D/g, "");
  return digits.length > 10 ? digits.slice(-10) : digits;
}

function orderPayload(order, packaging) {
  const env = getEnv();
  const a = order.address;
  const [first, ...rest] = String(a.fullName || "Customer")
    .trim()
    .split(/\s+/);
  return {
    order_id: order.orderNumber,
    order_date: istStamp(order.createdAt),
    pickup_location: env.SHIPROCKET_PICKUP_LOCATION,
    ...(env.SHIPROCKET_CHANNEL_ID ? { channel_id: Number(env.SHIPROCKET_CHANNEL_ID) } : {}),
    billing_customer_name: first,
    billing_last_name: rest.join(" "),
    billing_address: a.line1,
    billing_address_2: [a.line2, a.landmark].filter(Boolean).join(", "),
    billing_city: a.city,
    billing_pincode: a.pincode,
    billing_state: a.state,
    billing_country: "India",
    billing_email: order.email,
    billing_phone: mobile(a.phone),
    shipping_is_billing: true,
    order_items: order.items.map((i) => ({ name: i.variantLabel ? `${i.name} (${i.variantLabel})`.slice(0, 200) : i.name, sku: i.sku, units: i.qty, selling_price: rupees(i.price), tax: env.GST_RATE_PERCENT })),
    payment_method: order.paymentMethod === "cod" ? "COD" : "Prepaid",
    // Shiprocket's order total (and the COD amount the courier collects) is
    // sub_total + shipping + transaction charges − discount, which equals our order total.
    sub_total: rupees(order.amounts.subtotal),
    shipping_charges: rupees(order.amounts.shipping),
    transaction_charges: rupees(order.amounts.codFee),
    total_discount: rupees(order.amounts.discount),
    length: packaging.box.lengthCm,
    breadth: packaging.box.breadthCm,
    height: packaging.box.heightCm,
    weight: Math.max(0.1, Math.round(packaging.weightGrams) / 1000),
  };
}

const alreadyDone = (err) => /already/i.test(String(err?.message ?? ""));

// On "packed": create the Shiprocket order, assign an AWB, schedule the pickup and fetch the label.
// Each finished step is handed to `save` straight away, so a failure (or a crash) part-way never
// repeats a step that already happened at Shiprocket — a retry carries on from where it stopped.
// Pickup and label problems don't fail the booking; they're reported as `warning` and retried later.
async function createShipment(order, { packaging, save = async () => {} }) {
  const env = getEnv();
  const result = { ...(order.toObject().shipment ?? {}) };
  const step = async (fields) => {
    Object.assign(result, fields);
    await save(fields);
  };

  if (!result.shipmentId) {
    const created = await request("POST", "/orders/create/adhoc", orderPayload(order, packaging));
    if (!created?.shipment_id) throw new AppError(502, "SHIPPING_PROVIDER_ERROR", providerMessage(created) || "Shiprocket didn’t create the shipment.");
    await step({
      shiprocketOrderId: String(created.order_id),
      shipmentId: String(created.shipment_id),
      box: packaging.box,
      weightGrams: packaging.weightGrams,
      volumetricWeightGrams: packaging.volumetricWeightGrams,
      bookedAt: new Date(),
      ...(created.awb_code ? { awb: String(created.awb_code), courier: created.courier_name ?? null } : {}),
    });
  }

  if (!result.awb) {
    const assigned = await request("POST", "/courier/assign/awb", { shipment_id: result.shipmentId, ...(env.SHIPROCKET_COURIER_ID ? { courier_id: Number(env.SHIPROCKET_COURIER_ID) } : {}) });
    const data = assigned?.response?.data ?? {};
    if (!data.awb_code) {
      const reason = data.awb_assign_error || providerMessage(assigned) || "No courier could be assigned yet.";
      throw new AppError(502, "SHIPPING_PROVIDER_ERROR", String(reason));
    }
    await step({ awb: String(data.awb_code), courier: data.courier_name ?? null, courierId: data.courier_company_id ? String(data.courier_company_id) : null, trackingUrl: `https://shiprocket.co/tracking/${encodeURIComponent(data.awb_code)}` });
  }

  const warnings = [];
  if (env.SHIPROCKET_AUTO_PICKUP && !result.pickupScheduledAt) {
    try {
      const pickup = await request("POST", "/courier/generate/pickup", { shipment_id: [result.shipmentId] });
      const when = pickup?.response?.pickup_scheduled_date;
      await step({ pickupScheduledAt: new Date(), pickupDate: when ? String(when) : null });
    } catch (err) {
      if (alreadyDone(err)) await step({ pickupScheduledAt: new Date() });
      else warnings.push(`Pickup not scheduled: ${err.message}`);
    }
  }
  if (!result.labelUrl) {
    try {
      const label = await request("POST", "/courier/generate/label", { shipment_id: [result.shipmentId] });
      if (httpsUrl(label?.label_url)) await step({ labelUrl: httpsUrl(label.label_url) });
      else warnings.push(`Label not ready: ${providerMessage(label) || "try again in a minute"}`);
    } catch (err) {
      warnings.push(`Label not ready: ${err.message}`);
    }
  }
  await step({ warning: warnings.length ? warnings.join(" · ").slice(0, 300) : null });
  return result;
}

// Cancels the Shiprocket order (and its AWB) — only possible before the courier picks it up.
async function cancelShipment(shiprocketOrderId) {
  await request("POST", "/orders/cancel", { ids: [Number(shiprocketOrderId)] });
}

// Manifest PDF for one or more shipments handed to the courier together.
// Generated once per shipment; after that Shiprocket only re-prints it.
async function generateManifest({ shipmentId, shiprocketOrderId }) {
  try {
    const data = await request("POST", "/manifests/generate", { shipment_id: [shipmentId] });
    if (httpsUrl(data?.manifest_url)) return httpsUrl(data.manifest_url);
  } catch (err) {
    if (!alreadyDone(err)) throw err;
  }
  const printed = await request("POST", "/manifests/print", { order_ids: [shiprocketOrderId] });
  return httpsUrl(printed?.manifest_url);
}

async function trackAwb(awb) {
  const data = await request("GET", `/courier/track/awb/${encodeURIComponent(awb)}`);
  const t = data?.tracking_data ?? {};
  return {
    currentStatus: t.shipment_track?.[0]?.current_status ?? null,
    trackingUrl: httpsUrl(t.track_url),
    events: (t.shipment_track_activities ?? []).map((a) => ({ at: parseDate(a.date), status: a["sr-status-label"] || a.status, location: a.location, activity: a.activity })),
  };
}

function parseDate(s) {
  const d = new Date(String(s ?? "").replace(" ", "T") + "+05:30");
  return Number.isNaN(d.getTime()) ? new Date() : d;
}

const norm = (status) =>
  String(status ?? "")
    .toUpperCase()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const IN_TRANSIT = new Set(["PICKED UP", "SHIPPED", "IN TRANSIT", "IN FLIGHT", "REACHED AT DESTINATION HUB", "REACHED DESTINATION HUB", "DELAYED", "MISROUTED", "CUSTODY", "DESTINATION HUB"]);

// Shiprocket's free-text status → our order status (null = no change).
function mapShipmentStatus(status) {
  const s = norm(status);
  if (!s) return null;
  if (s.startsWith("RTO")) return "rto";
  if (s === "DELIVERED") return "delivered";
  if (s === "OUT FOR DELIVERY") return "out_for_delivery";
  if (IN_TRANSIT.has(s)) return "shipped";
  return null;
}

// Statuses a person has to act on: a failed delivery attempt (NDR), a lost/damaged parcel, a
// pickup problem, or a cancellation made at Shiprocket.
function shipmentAlert(status) {
  const s = norm(status);
  if (["UNDELIVERED", "NDR"].includes(s) || s.startsWith("UNDELIVERED")) return { kind: "ndr", title: "Delivery attempt failed" };
  if (["LOST", "DAMAGED", "DESTROYED", "DISPOSED OFF"].includes(s)) return { kind: "lost", title: `Shipment ${s.toLowerCase()}` };
  if (s === "PICKUP EXCEPTION" || s === "PICKUP ERROR") return { kind: "pickup", title: "Pickup problem" };
  if (s === "CANCELED" || s === "CANCELLED") return { kind: "cancelled", title: "Shipment cancelled at Shiprocket" };
  return null;
}

module.exports = {
  shiprocketConfigured,
  resetShiprocketCache,
  checkServiceability,
  createShipment,
  cancelShipment,
  generateManifest,
  trackAwb,
  mapShipmentStatus,
  shipmentAlert,
  parseDate,
  orderPayload,
  httpsUrl,
  istStamp,
  mobile,
};
