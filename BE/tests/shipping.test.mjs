import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from "vitest";
import request from "supertest";
import crypto from "crypto";
import { createRequire } from "module";
import { buildApp, startDb, stopDb, clearDb, registerUser, registerAs, bearer, lastCode } from "./helpers.mjs";

const require = createRequire(import.meta.url);
const { Order, WebhookEvent } = require("../Models/Order.js");
const { BoxSize, ProviderToken } = require("../Models/Shipping.js");
const { Notification } = require("../Models/Notification.js");
const { seedCatalog } = require("../Services/seed.js");
const { drainMailQueue } = require("../Services/mailQueue.js");
const { resetShiprocketCache, mapShipmentStatus, shipmentAlert, istStamp, mobile } = require("../Services/shiprocket.js");
const { pickBox, parcel, contentsOf, FALLBACK_BOX } = require("../Services/packaging.js");

const SR = { SHIPROCKET_EMAIL: "ops@example.com", SHIPROCKET_PASSWORD: "pw", SHIPROCKET_WEBHOOK_TOKEN: "sr-webhook-token-0123" };
const app = buildApp(SR);
const MEN = "MM-MEN-THERAPY"; // ₹499
const realFetch = globalThis.fetch;
let calls = [];
let replies = {};

const OK_FLOW = {
  "/auth/login": { body: { token: "sr-jwt" } },
  "/courier/serviceability": { body: { data: { available_courier_companies: [{ courier_name: "Delhivery", estimated_delivery_days: "3", cod: 1 }] } } },
  "/orders/create/adhoc": { body: { order_id: 9001, shipment_id: 7001 } },
  "/courier/assign/awb": { body: { awb_assign_status: 1, response: { data: { awb_code: "SR123456789", courier_name: "Delhivery", courier_company_id: 14 } } } },
  "/courier/generate/pickup": { body: { pickup_status: 1, response: { pickup_scheduled_date: "2026-11-14 10:00:00" } } },
  "/courier/generate/label": { body: { label_created: 1, label_url: "https://labels.example.com/7001.pdf" } },
};

beforeAll(async () => {
  await startDb();
  await Promise.all([Order, WebhookEvent, BoxSize].map((m) => m.syncIndexes()));
});
afterAll(stopDb);
beforeEach(async () => {
  buildApp(SR);
  await clearDb();
  await seedCatalog();
  resetShiprocketCache();
  calls = [];
  replies = { ...OK_FLOW };
  vi.spyOn(globalThis, "fetch").mockImplementation(async (url, init = {}) => {
    const u = String(url);
    if (!u.includes("shiprocket.in")) return realFetch(url, init);
    const body = init.body ? JSON.parse(init.body) : null;
    calls.push({ url: u, method: init.method, body, auth: init.headers?.Authorization });
    const k = Object.keys(replies).find((x) => u.includes(x));
    let reply = k ? replies[k] : { status: 500, body: { message: "unexpected call" } };
    if (typeof reply === "function") reply = await reply(body, u);
    return new Response(JSON.stringify(reply.body), { status: reply.status ?? 200, headers: { "content-type": "application/json" } });
  });
});
afterEach(async () => {
  await drainMailQueue();
  vi.restoreAllMocks();
});

const called = (part) => calls.filter((c) => c.url.includes(part));

// A confirmed COD order for `qty` units, ready to pack.
async function confirmedOrder({ qty = 1, phone = "+91 98765 43210" } = {}) {
  const session = await registerUser(app);
  const h = bearer(session.accessToken);
  const addr = await request(app).post("/api/addresses").set(h).send({ fullName: "Ravi Kumar Das", phone: phone.replace(/\D/g, "").slice(-10), line1: "1 Park St", city: "Kolkata", state: "West Bengal", pincode: "700016" });
  await request(app).put("/api/cart/items").set(h).send({ sku: MEN, qty });
  const placed = await request(app)
    .post("/api/orders")
    .set(h)
    .set("Idempotency-Key", crypto.randomUUID())
    .send({ addressId: addr.body.address.id, deliveryMethod: "standard", paymentMethod: "cod", expectedTotal: 49900 * qty });
  expect(placed.status).toBe(201);
  await drainMailQueue();
  await request(app).post(`/api/orders/${placed.body.order.orderNumber}/cod/confirm`).set(h).send({ code: lastCode(session.email) });
  return Order.findOne({ orderNumber: placed.body.order.orderNumber });
}

const box = (over = {}) => ({ name: "Small", lengthCm: 18, breadthCm: 12, heightCm: 8, emptyWeightGrams: 60, maxWeightGrams: 700, maxUnits: 2, ...over });

describe("packaging rules", () => {
  it("picks the smallest active box that takes the weight and units, else the default", () => {
    const small = { id: "s", ...box(), isActive: true };
    const medium = { id: "m", ...box({ name: "Medium", lengthCm: 25, breadthCm: 20, heightCm: 12, maxWeightGrams: 2000, maxUnits: 6 }), isActive: true, isDefault: true };
    const large = { id: "l", ...box({ name: "Large", lengthCm: 40, breadthCm: 30, heightCm: 20, maxWeightGrams: 5000, maxUnits: null }), isActive: true };
    const off = { id: "x", ...box({ name: "Tiny", lengthCm: 5, breadthCm: 5, heightCm: 5, maxWeightGrams: null, maxUnits: null }), isActive: false };
    const items = (qty, w = 250) => [{ qty, weightGrams: w }];
    expect(pickBox([large, medium, small, off], contentsOf(items(1))).box.id).toBe("s");
    expect(pickBox([large, medium, small], contentsOf(items(3))).box.id).toBe("m");
    expect(pickBox([large, medium, small], contentsOf(items(12))).box.id).toBe("l");
    expect(pickBox([medium, small], contentsOf(items(40)))).toMatchObject({ box: { id: "m" }, fits: false });
    expect(pickBox([], contentsOf(items(1))).box).toBe(FALLBACK_BOX);
  });

  it("declares item weight plus the empty box, and the volumetric weight", () => {
    const p = parcel({ name: "Medium", lengthCm: 25, breadthCm: 20, heightCm: 12, emptyWeightGrams: 120 }, contentsOf([{ qty: 2, weightGrams: 250 }, { qty: 1 }]));
    expect(p).toMatchObject({ units: 3, itemWeightGrams: 800, weightGrams: 920, volumetricWeightGrams: 1200, chargeableWeightGrams: 1200 });
  });

  it("formats Shiprocket fields and maps courier statuses", () => {
    expect(istStamp("2026-11-13T20:00:00Z")).toBe("2026-11-14 01:30");
    expect(mobile("+91 98765-43210")).toBe("9876543210");
    expect(mapShipmentStatus("In Transit")).toBe("shipped");
    expect(mapShipmentStatus("REACHED_AT_DESTINATION_HUB")).toBe("shipped");
    expect(mapShipmentStatus("RTO INITIATED")).toBe("rto");
    expect(mapShipmentStatus("PICKUP SCHEDULED")).toBeNull();
    expect(shipmentAlert("UNDELIVERED")).toMatchObject({ kind: "ndr" });
    expect(shipmentAlert("LOST")).toMatchObject({ kind: "lost" });
    expect(shipmentAlert("DELIVERED")).toBeNull();
  });
});

describe("box sizes (admin)", () => {
  it("lets admins manage boxes (one default, unique codes) and staff only read them", async () => {
    const admin = bearer((await registerAs(app, "admin")).accessToken);
    const staff = bearer((await registerAs(app, "staff")).accessToken);
    expect((await request(app).post("/api/admin/boxes").set(staff).send(box())).status).toBe(403);
    expect((await request(app).post("/api/admin/boxes").set(admin).send(box({ lengthCm: 0 }))).status).toBe(400);

    const first = await request(app).post("/api/admin/boxes").set(admin).send(box({ code: "s-1" }));
    expect(first.status).toBe(201);
    // The first box becomes the default automatically.
    expect(first.body.box).toMatchObject({ name: "Small", code: "S-1", isDefault: true, volumetricWeightGrams: 346 });
    expect((await request(app).post("/api/admin/boxes").set(admin).send(box({ name: "Dup", code: "S-1" }))).status).toBe(409);

    const second = await request(app).post("/api/admin/boxes").set(admin).send(box({ name: "Medium", lengthCm: 25, isDefault: true }));
    expect(second.body.box.isDefault).toBe(true);
    const list = await request(app).get("/api/admin/boxes").set(staff);
    expect(list.body.boxes.filter((b) => b.isDefault).map((b) => b.name)).toEqual(["Medium"]);

    // The default can't be switched off; others can, and limits can be cleared.
    expect((await request(app).patch(`/api/admin/boxes/${second.body.box.id}`).set(admin).send({ isActive: false })).status).toBe(400);
    const edited = await request(app).patch(`/api/admin/boxes/${first.body.box.id}`).set(admin).send({ isActive: false, maxUnits: null });
    expect(edited.body.box).toMatchObject({ isActive: false, maxUnits: null });
    expect((await request(app).delete(`/api/admin/boxes/${first.body.box.id}`).set(staff)).status).toBe(403);
    expect((await request(app).delete(`/api/admin/boxes/${first.body.box.id}`).set(admin)).status).toBe(204);
    expect((await request(app).get("/api/admin/boxes").set(admin)).body.boxes).toHaveLength(1);
  });
});

describe("Shiprocket booking", () => {
  it("suggests a box, books in the chosen one and sends the right amounts and dimensions", async () => {
    const small = await BoxSize.create(box());
    const medium = await BoxSize.create(box({ name: "Medium", lengthCm: 25, breadthCm: 20, heightCm: 12, emptyWeightGrams: 120, maxWeightGrams: 3000, maxUnits: 8, isDefault: true }));
    const staff = bearer((await registerAs(app, "staff")).accessToken);
    const order = await confirmedOrder({ qty: 1 });

    const pack = await request(app).get(`/api/admin/orders/${order._id}/packaging`).set(staff);
    expect(pack.body.packaging.suggested.box.name).toBe("Small");
    expect(pack.body.packaging.boxes).toHaveLength(2);

    const packed = await request(app).post(`/api/admin/orders/${order._id}/status`).set(staff).send({ status: "packed", boxId: String(medium._id) });
    expect(packed.body.order.status).toBe("packed");
    expect(packed.body.order.shipment).toMatchObject({
      shiprocketOrderId: "9001",
      shipmentId: "7001",
      awb: "SR123456789",
      courier: "Delhivery",
      courierId: "14",
      labelUrl: "https://labels.example.com/7001.pdf",
      pickupDate: "2026-11-14 10:00:00",
      box: { name: "Medium", lengthCm: 25, breadthCm: 20, heightCm: 12 },
      weightGrams: 380, // 260 g item + 120 g box
      error: null,
      warning: null,
    });
    const payload = called("/orders/create/adhoc")[0].body;
    expect(payload).toMatchObject({ order_id: order.orderNumber, payment_method: "COD", sub_total: 499, shipping_charges: 0, total_discount: 0, length: 25, breadth: 20, height: 12, weight: 0.38, billing_phone: "9876543210", billing_customer_name: "Ravi", billing_last_name: "Kumar Das" });
    expect(payload.order_date).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/);
    expect(String(small._id)).not.toBe(packed.body.order.shipment.box.id);

    // An unknown box is rejected before the order moves.
    const other = await confirmedOrder();
    expect((await request(app).post(`/api/admin/orders/${other._id}/status`).set(staff).send({ status: "packed", boxId: "a".repeat(24) })).status).toBe(400);
    expect((await Order.findById(other._id)).status).toBe("cod_confirmed");
  });

  it("saves each finished step, so a retry never creates the Shiprocket order twice", async () => {
    replies["/courier/assign/awb"] = { body: { awb_assign_status: 0, response: { data: { awb_assign_error: "No courier serviceable for this weight" } } } };
    const staff = bearer((await registerAs(app, "staff")).accessToken);
    const order = await confirmedOrder();
    const packed = await request(app).post(`/api/admin/orders/${order._id}/status`).set(staff).send({ status: "packed" });
    expect(packed.body.order.shipment).toMatchObject({ shipmentId: "7001", error: "No courier serviceable for this weight", box: { name: "Standard carton" } });
    expect(packed.body.order.shipment.awb).toBeUndefined();

    replies["/courier/assign/awb"] = OK_FLOW["/courier/assign/awb"];
    replies["/courier/generate/pickup"] = { status: 400, body: { message: "Pickup could not be scheduled, try later" } };
    const retry = await request(app).post(`/api/admin/orders/${order._id}/shipment`).set(staff).send({});
    expect(retry.body.order.shipment).toMatchObject({ awb: "SR123456789", error: null, labelUrl: "https://labels.example.com/7001.pdf" });
    expect(retry.body.order.shipment.warning).toMatch(/Pickup not scheduled/);
    expect(called("/orders/create/adhoc")).toHaveLength(1);

    // Finishing the pickup later only calls the pickup endpoint.
    replies["/courier/generate/pickup"] = { status: 400, body: { message: "Already in Pickup Queue." } };
    calls = [];
    const again = await request(app).post(`/api/admin/orders/${order._id}/shipment`).set(staff).send({});
    expect(again.body.order.shipment.warning).toBeNull();
    expect(calls.map((c) => new URL(c.url).pathname)).toEqual(["/v1/external/courier/generate/pickup"]);
  });

  it("logs in once for concurrent requests and reuses the stored token after a restart", async () => {
    let logins = 0;
    replies["/auth/login"] = async () => {
      logins += 1;
      await new Promise((r) => setTimeout(r, 50));
      return { body: { token: `sr-jwt-${logins}` } };
    };
    const pins = ["700016", "560002", "110001"];
    await Promise.all(pins.map((p) => request(app).get(`/api/delivery/check?pincode=${p}`)));
    expect(logins).toBe(1);
    expect(await ProviderToken.findById("shiprocket")).toMatchObject({ value: "sr-jwt-1" });

    resetShiprocketCache(); // a new process
    await request(app).get("/api/delivery/check?pincode=400001");
    expect(logins).toBe(1);
    expect(called("/courier/serviceability").at(-1).auth).toBe("Bearer sr-jwt-1");

    // A revoked token: log in again once and repeat the call.
    resetShiprocketCache();
    let first = true;
    replies["/courier/serviceability"] = () => (first ? ((first = false), { status: 401, body: { message: "Token expired" } }) : OK_FLOW["/courier/serviceability"]);
    const res = await request(app).get("/api/delivery/check?pincode=600001");
    expect(res.body.delivery.serviceable).toBe(true);
    expect(logins).toBe(2);
  });

  it("cancels the Shiprocket order when a packed order is cancelled, and warns if it can't", async () => {
    replies["/orders/cancel"] = { body: { message: "Order cancelled" } };
    const admin = bearer((await registerAs(app, "admin")).accessToken);
    const order = await confirmedOrder();
    await request(app).post(`/api/admin/orders/${order._id}/status`).set(admin).send({ status: "packed" });
    const cancelled = await request(app).post(`/api/admin/orders/${order._id}/status`).set(admin).send({ status: "cancelled", note: "Out of stock" });
    expect(cancelled.body.order.status).toBe("cancelled");
    expect(called("/orders/cancel")[0].body).toEqual({ ids: [9001] });
    expect((await Order.findById(order._id)).shipment.cancelledAt).toBeTruthy();

    replies["/orders/cancel"] = { status: 400, body: { message: "Order is already picked up" } };
    const second = await confirmedOrder();
    await request(app).post(`/api/admin/orders/${second._id}/status`).set(admin).send({ status: "packed" });
    await request(app).post(`/api/admin/orders/${second._id}/status`).set(admin).send({ status: "cancelled" });
    const after = await Order.findById(second._id);
    expect(after.status).toBe("cancelled");
    expect(after.shipment.error).toMatch(/Cancel it in Shiprocket/);
    await drainMailQueue();
    await drainMailQueue();
    expect(await Notification.countDocuments({ title: new RegExp(`Cancel shipment for ${second.orderNumber}`) })).toBeGreaterThan(0);
  });

  it("flags failed delivery attempts and RTO from the tracking webhook and tells the team", async () => {
    const staff = bearer((await registerAs(app, "staff")).accessToken);
    const order = await confirmedOrder();
    await request(app).post(`/api/admin/orders/${order._id}/status`).set(staff).send({ status: "packed" });
    const hook = (body) => request(app).post("/api/webhooks/shipping").set("Content-Type", "application/json").set("x-api-key", SR.SHIPROCKET_WEBHOOK_TOKEN).send(JSON.stringify(body));

    await hook({ awb: "SR123456789", current_status: "IN TRANSIT", current_status_id: 18, current_timestamp: "14 11 2026 10:00:00" });
    await hook({ awb: "SR123456789", current_status: "UNDELIVERED", current_status_id: 21, current_timestamp: "15 11 2026 18:00:00" });
    let now = await Order.findById(order._id);
    expect(now.status).toBe("shipped");
    expect(now.shipment).toMatchObject({ lastStatus: "UNDELIVERED", alert: { kind: "ndr", title: "Delivery attempt failed" } });
    await drainMailQueue();
    await drainMailQueue();
    expect(await Notification.countDocuments({ title: new RegExp(`Delivery attempt failed · ${order.orderNumber}`) })).toBeGreaterThan(0);

    await hook({ awb: "SR123456789", current_status: "RTO INITIATED", current_status_id: 15, current_timestamp: "17 11 2026 09:00:00" });
    now = await Order.findById(order._id);
    expect(now.status).toBe("rto");
    await drainMailQueue();
    await drainMailQueue();
    expect(await Notification.countDocuments({ title: new RegExp(`Return to origin · ${order.orderNumber}`) })).toBeGreaterThan(0);
  });

  it("prints the manifest for a booked shipment", async () => {
    replies["/manifests/generate"] = { status: 400, body: { message: "Manifest already generated" } };
    replies["/manifests/print"] = { body: { manifest_url: "https://labels.example.com/manifest-7001.pdf" } };
    const staff = bearer((await registerAs(app, "staff")).accessToken);
    const order = await confirmedOrder();
    expect((await request(app).post(`/api/admin/orders/${order._id}/manifest`).set(staff)).status).toBe(409);
    await request(app).post(`/api/admin/orders/${order._id}/status`).set(staff).send({ status: "packed" });
    const res = await request(app).post(`/api/admin/orders/${order._id}/manifest`).set(staff);
    expect(res.body.order.shipment.manifestUrl).toBe("https://labels.example.com/manifest-7001.pdf");
    expect(called("/manifests/print")[0].body).toEqual({ order_ids: ["9001"] });
  });
});
