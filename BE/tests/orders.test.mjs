import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from "vitest";
import request from "supertest";
import crypto from "crypto";
import { createRequire } from "module";
import { buildApp, startDb, stopDb, clearDb, registerUser, registerAs, bearer, outbox, lastCode } from "./helpers.mjs";

const require = createRequire(import.meta.url);
const { Product } = require("../Models/Product.js");
const { Cart } = require("../Models/Cart.js");
const { Coupon, CouponRedemption } = require("../Models/Coupon.js");
const { Order, IdempotencyKey, WebhookEvent } = require("../Models/Order.js");
const { PincodeRule, DeliverySettings } = require("../Models/Delivery.js");
const { seedCatalog } = require("../Services/seed.js");
const { drainMailQueue } = require("../Services/mailQueue.js");
const { resetShiprocketCache } = require("../Services/shiprocket.js");
const { canTransition } = require("../Services/orderState.js");
const { splitTax, financialYear } = require("../Services/invoice.js");

const RZ = { RAZORPAY_KEY_ID: "rzp_test_abc123", RAZORPAY_KEY_SECRET: "rz-key-secret-for-tests", RAZORPAY_WEBHOOK_SECRET: "rz-webhook-secret-for-tests" };
const CRON_SECRET = "cron-secret-for-tests-0123456789";
const app = buildApp({ ...RZ, CRON_SECRET });
const MEN = "MM-MEN-THERAPY"; // ₹499
const COMBO = "MM-MEN-COMBO"; // ₹799

const realFetch = globalThis.fetch;
let providerCalls;
let providerReplies;

// Routes outgoing Razorpay/Shiprocket calls to canned replies; everything else goes out normally.
function mockProviders(replies = {}) {
  providerReplies = replies;
}

beforeAll(async () => {
  await startDb();
  await Promise.all([Product, CouponRedemption, Coupon, Order, IdempotencyKey, WebhookEvent, PincodeRule].map((m) => m.syncIndexes()));
});
afterAll(stopDb);
beforeEach(async () => {
  buildApp({ ...RZ, CRON_SECRET }); // some tests build apps with other settings; reset the shared runtime env
  await clearDb();
  await seedCatalog();
  resetShiprocketCache();
  providerCalls = [];
  providerReplies = {};
  let rzSeq = 0;
  vi.spyOn(globalThis, "fetch").mockImplementation(async (url, init = {}) => {
    const u = String(url);
    if (!u.includes("razorpay.com") && !u.includes("shiprocket.in")) return realFetch(url, init);
    const body = init.body ? JSON.parse(init.body) : null;
    providerCalls.push({ url: u, method: init.method, body });
    const key = Object.keys(providerReplies).find((k) => u.includes(k));
    let reply = key ? providerReplies[key] : null;
    if (typeof reply === "function") reply = reply(body, u);
    if (!reply && u.endsWith("/v1/orders")) {
      rzSeq += 1;
      reply = { status: 200, body: { id: `order_TEST${String(rzSeq).padStart(6, "0")}`, amount: body.amount, status: "created" } };
    }
    reply ??= { status: 500, body: { error: { description: "unexpected call" } } };
    return new Response(JSON.stringify(reply.body), { status: reply.status ?? 200, headers: { "content-type": "application/json" } });
  });
});
afterEach(async () => {
  await drainMailQueue();
  vi.restoreAllMocks();
});

const stockOf = async (sku) => (await Product.findOne({ "variants.sku": sku })).variants.find((v) => v.sku === sku).stock;
const setStock = async (sku, stock) => {
  await Product.updateOne({ "variants.sku": sku }, { $set: { "variants.$.stock": stock } });
  await (await Product.findOne({ "variants.sku": sku })).save();
};
const key = () => crypto.randomUUID();
const sign = (secret, payload) => crypto.createHmac("sha256", secret).update(payload).digest("hex");

async function shopper({ items = [{ sku: MEN, qty: 2 }], coupon, pincode = "560001", state = "Karnataka" } = {}) {
  const session = await registerUser(app);
  const h = bearer(session.accessToken);
  const addr = await request(app).post("/api/addresses").set(h).send({ fullName: "Ananya Sharma", phone: "9876543210", line1: "12 MG Road", city: "Bengaluru", state, pincode });
  for (const i of items) await request(app).put("/api/cart/items").set(h).send(i);
  if (coupon) expect((await request(app).post("/api/cart/coupon").set(h).send({ code: coupon })).status).toBe(200);
  return { ...session, h, addressId: addr.body.address.id };
}

function place(s, body = {}, idem = key()) {
  return request(app)
    .post("/api/orders")
    .set(s.h)
    .set("Idempotency-Key", idem)
    .send({ addressId: s.addressId, deliveryMethod: "standard", paymentMethod: "cod", expectedTotal: 99800, ...body });
}

function razorpayWebhook(event, { eventId = key(), secret = RZ.RAZORPAY_WEBHOOK_SECRET } = {}) {
  const raw = JSON.stringify(event);
  return request(app).post("/api/webhooks/razorpay").set("Content-Type", "application/json").set("X-Razorpay-Signature", sign(secret, raw)).set("X-Razorpay-Event-Id", eventId).send(raw);
}

const captured = (order, paymentId = "pay_TEST000001", amount = order.amounts.total) => ({
  event: "payment.captured",
  payload: { payment: { entity: { id: paymentId, order_id: order.payment.razorpayOrderId, amount, method: "upi" } } },
});

async function paidOrder(s, items) {
  const res = await place(s, { paymentMethod: "razorpay", expectedTotal: items ?? 99800 });
  expect(res.status).toBe(201);
  const order = await Order.findOne({ orderNumber: res.body.order.orderNumber });
  expect((await razorpayWebhook(captured(order))).status).toBe(200);
  return Order.findById(order._id);
}

describe("delivery check", () => {
  it("quotes free standard delivery with COD by default", async () => {
    const res = await request(app).get("/api/delivery/check?pincode=560001&subtotal=49900");
    expect(res.status).toBe(200);
    expect(res.body.delivery).toMatchObject({ serviceable: true, codAvailable: true, methods: [{ id: "standard", fee: 0, etaMinDays: 3, etaMaxDays: 7 }] });
    expect((await request(app).get("/api/delivery/check?pincode=012345")).status).toBe(400);
  });

  it("applies PIN rules (exact beats region) and store settings", async () => {
    await PincodeRule.create({ pincode: "110", codAvailable: false, eta: { min: 4, max: 6 } });
    await PincodeRule.create({ pincode: "110099", serviceable: false, note: "Restricted area" });
    await DeliverySettings.create({ _id: "delivery", standard: { fee: 4900 }, freeShippingThreshold: 99900, express: { enabled: true } });

    const region = (await request(app).get("/api/delivery/check?pincode=110001&subtotal=50000")).body.delivery;
    expect(region).toMatchObject({ serviceable: true, codAvailable: false });
    expect(region.methods.map((m) => [m.id, m.fee, m.etaMinDays])).toEqual([
      ["standard", 4900, 4],
      ["express", 9900, 1],
    ]);
    expect((await request(app).get("/api/delivery/check?pincode=110001&subtotal=99900")).body.delivery.methods[0].fee).toBe(0);
    expect((await request(app).get("/api/delivery/check?pincode=110099")).body.delivery).toMatchObject({ serviceable: false, message: "Restricted area" });
  });

  it("uses Shiprocket serviceability when configured, and falls back to store rules if it is down", async () => {
    const srApp = buildApp({ ...RZ, SHIPROCKET_EMAIL: "ops@example.com", SHIPROCKET_PASSWORD: "pw", SHIPROCKET_WEBHOOK_TOKEN: "sr-token" });
    mockProviders({
      "/auth/login": { body: { token: "sr-jwt" } },
      "delivery_postcode=560001": { body: { data: { available_courier_companies: [{ courier_name: "Delhivery", estimated_delivery_days: "2", cod: 1 }, { courier_name: "Xpress", estimated_delivery_days: "4", cod: 0 }] } } },
      "delivery_postcode=790001": { body: { data: { available_courier_companies: [] } } },
      "delivery_postcode=403001": { status: 500, body: {} },
    });
    const ok = (await request(srApp).get("/api/delivery/check?pincode=560001")).body.delivery;
    expect(ok).toMatchObject({ serviceable: true, codAvailable: true, courier: "Delhivery", methods: [{ etaMinDays: 2, etaMaxDays: 4 }] });
    expect((await request(srApp).get("/api/delivery/check?pincode=790001")).body.delivery.serviceable).toBe(false);
    expect((await request(srApp).get("/api/delivery/check?pincode=403001")).body.delivery).toMatchObject({ serviceable: true, methods: [{ etaMinDays: 3 }] });
    // token fetched once and reused; serviceability is cached
    await request(srApp).get("/api/delivery/check?pincode=560001");
    expect(providerCalls.filter((c) => c.url.includes("/auth/login"))).toHaveLength(1);
    expect(providerCalls.filter((c) => c.url.includes("delivery_postcode=560001"))).toHaveLength(1);
  });
});

describe("checkout quote", () => {
  it("prices the server cart with delivery and payment options", async () => {
    const s = await shopper();
    const res = await request(app).post("/api/checkout/quote").set(s.h).send({ addressId: s.addressId, paymentMethod: "cod" });
    expect(res.status).toBe(200);
    expect(res.body.selection).toEqual({ deliveryMethod: "standard", shipping: 0, codFee: 0, total: 99800 });
    expect(res.body.payment).toEqual({ razorpay: { available: true }, cod: { available: true, fee: 0, reason: null } });
    expect(res.body.cart.subtotal).toBe(99800);
  });

  it("explains when COD is over the limit and adds the COD fee", async () => {
    await DeliverySettings.create({ _id: "delivery", cod: { fee: 4000, maxOrder: 100000 } });
    const s = await shopper({ items: [{ sku: COMBO, qty: 2 }] });
    const res = await request(app).post("/api/checkout/quote").set(s.h).send({ addressId: s.addressId, paymentMethod: "cod" });
    expect(res.body.payment.cod).toEqual({ available: false, fee: 4000, reason: "Cash on Delivery is available on orders up to ₹1,000." });
    const small = await shopper();
    const q = await request(app).post("/api/checkout/quote").set(small.h).send({ addressId: small.addressId, paymentMethod: "cod" });
    expect(q.body.selection).toMatchObject({ codFee: 4000, total: 99800 + 4000 });
  });

  it("needs a signed-in customer with items and their own address", async () => {
    expect((await request(app).post("/api/checkout/quote").send({})).status).toBe(401);
    const empty = await shopper({ items: [] });
    expect((await request(app).post("/api/checkout/quote").set(empty.h).send({})).body.error.code).toBe("CART_EMPTY");
    const s = await shopper();
    expect((await request(app).post("/api/checkout/quote").set(s.h).send({ addressId: empty.addressId })).status).toBe(404);
  });
});

describe("placing a COD order", () => {
  it("takes stock, holds the coupon and asks for an emailed code; the code confirms it", async () => {
    await Coupon.create({ code: "RITUAL10", type: "percent", value: 10 });
    const s = await shopper({ coupon: "RITUAL10" });
    const res = await place(s, { expectedTotal: 99800 - 9980 });
    expect(res.status).toBe(201);
    expect(res.body.order).toMatchObject({ status: "cod_pending_confirmation", paymentMethod: "cod", amounts: { subtotal: 99800, discount: 9980, shipping: 0, codFee: 0, total: 89820 }, coupon: { code: "RITUAL10" } });
    expect(res.body.order.orderNumber).toMatch(/^MM\d{6}-[A-Z0-9]{5}$/);
    expect(res.body.next).toMatchObject({ type: "cod_otp", sentTo: expect.stringContaining("@example.com") });
    expect(await stockOf(MEN)).toBe(118);
    expect(await CouponRedemption.findOne({ status: "pending" })).toBeTruthy();

    await drainMailQueue();
    const code = lastCode(s.email);
    const n = res.body.order.orderNumber;
    const wrong = await request(app).post(`/api/orders/${n}/cod/confirm`).set(s.h).send({ code: code === "000000" ? "111111" : "000000" });
    expect(wrong.status).toBe(400);
    const ok = await request(app).post(`/api/orders/${n}/cod/confirm`).set(s.h).send({ code });
    expect(ok.status).toBe(200);
    expect(ok.body.order).toMatchObject({ status: "cod_confirmed", hasInvoice: true, reservedUntil: null });

    const order = await Order.findOne({ orderNumber: n });
    expect(order.invoiceNumber).toMatch(/^MM\/\d{2}-\d{2}\/000001$/);
    expect((await Cart.findOne({ user: s.user.id })).items).toHaveLength(0);
    expect((await CouponRedemption.findOne()).status).toBe("confirmed");
    await drainMailQueue();
    expect(outbox.some((m) => m.to === s.email && m.meta?.purpose === "order-confirmed")).toBe(true);
  });

  it("is idempotent: the same key returns the same order; a different body with it is refused", async () => {
    const s = await shopper();
    const idem = key();
    const [a, b] = await Promise.all([place(s, {}, idem), place(s, {}, idem)]);
    expect([a.status, b.status].sort()).toEqual([200, 201]);
    expect(a.body.order.orderNumber).toBe(b.body.order.orderNumber);
    expect(await Order.countDocuments()).toBe(1);
    expect(await stockOf(MEN)).toBe(118);
    expect((await place(s, { deliveryMethod: "standard", paymentMethod: "razorpay" }, idem)).status).toBe(422);
    expect((await request(app).post("/api/orders").set(s.h).send({ addressId: s.addressId, deliveryMethod: "standard", paymentMethod: "cod", expectedTotal: 99800 })).status).toBe(400);
  });

  it("refuses a stale total, an over-limit COD order and client-sent prices", async () => {
    const s = await shopper();
    const stale = await place(s, { expectedTotal: 49900 });
    expect(stale.status).toBe(409);
    expect(stale.body.error.code).toBe("PRICE_CHANGED");
    expect((await place(s, { price: 1 })).status).toBe(400);
    await DeliverySettings.create({ _id: "delivery", cod: { maxOrder: 50000 } });
    expect((await place(s)).body.error.code).toBe("COD_UNAVAILABLE");
    expect(await Order.countDocuments()).toBe(0);
    expect(await stockOf(MEN)).toBe(120);
  });

  it("never oversells: two buyers racing for the last unit get one order between them", async () => {
    await setStock(MEN, 1);
    const [a, b] = await Promise.all([shopper({ items: [{ sku: MEN, qty: 1 }] }), shopper({ items: [{ sku: MEN, qty: 1 }] })]);
    const results = await Promise.all([place(a, { expectedTotal: 49900 }), place(b, { expectedTotal: 49900 })]);
    expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
    expect(results.find((r) => r.status === 409).body.error.code).toBe("OUT_OF_STOCK");
    expect(await stockOf(MEN)).toBe(0);
    expect((await Product.findOne({ "variants.sku": MEN })).inStock).toBe(false);
    expect(await Order.countDocuments()).toBe(1);
  });
});

describe("online payment (Razorpay)", () => {
  it("creates a Razorpay order and confirms the payment from a verified checkout signature", async () => {
    const s = await shopper();
    const res = await place(s, { paymentMethod: "razorpay" });
    expect(res.status).toBe(201);
    expect(res.body.next).toMatchObject({ type: "razorpay", keyId: RZ.RAZORPAY_KEY_ID, amount: 99800, currency: "INR", razorpayOrderId: "order_TEST000001" });
    expect(providerCalls[0].body).toMatchObject({ amount: 99800, currency: "INR", receipt: res.body.order.orderNumber });

    const n = res.body.order.orderNumber;
    const bad = await request(app).post(`/api/orders/${n}/payment/verify`).set(s.h).send({ razorpay_order_id: "order_TEST000001", razorpay_payment_id: "pay_TEST000001", razorpay_signature: "a".repeat(64) });
    expect(bad.status).toBe(400);
    const signature = sign(RZ.RAZORPAY_KEY_SECRET, "order_TEST000001|pay_TEST000001");
    const ok = await request(app).post(`/api/orders/${n}/payment/verify`).set(s.h).send({ razorpay_order_id: "order_TEST000001", razorpay_payment_id: "pay_TEST000001", razorpay_signature: signature });
    expect(ok.status).toBe(200);
    expect(ok.body.order.status).toBe("paid");

    // The webhook for the same payment arrives afterwards and changes nothing.
    const order = await Order.findOne({ orderNumber: n });
    expect((await razorpayWebhook(captured(order))).body.result).toBe("processed");
    const after = await Order.findById(order._id);
    expect(after.history.filter((h) => h.status === "paid")).toHaveLength(1);
  });

  it("verifies webhook signatures and applies each event once", async () => {
    const s = await shopper();
    const res = await place(s, { paymentMethod: "razorpay" });
    const order = await Order.findOne({ orderNumber: res.body.order.orderNumber });
    expect((await razorpayWebhook(captured(order), { secret: "wrong" })).status).toBe(400);
    expect((await Order.findById(order._id)).status).toBe("payment_pending");

    const eventId = "evt_TEST1";
    expect((await razorpayWebhook(captured(order), { eventId })).body.result).toBe("processed");
    expect((await razorpayWebhook(captured(order), { eventId })).body.result).toBe("duplicate");
    expect((await Order.findById(order._id)).status).toBe("paid");
  });

  it("ignores a capture whose amount doesn't match and records failed attempts", async () => {
    const s = await shopper();
    const res = await place(s, { paymentMethod: "razorpay" });
    const order = await Order.findOne({ orderNumber: res.body.order.orderNumber });
    await razorpayWebhook({ event: "payment.failed", payload: { payment: { entity: { id: "pay_F1", order_id: order.payment.razorpayOrderId, error_description: "Card declined" } } } });
    await razorpayWebhook(captured(order, "pay_TEST000009", 100));
    const after = await Order.findById(order._id);
    expect(after.status).toBe("payment_pending");
    expect(after.payment.failedAttempts).toBe(1);
    expect(after.payment.lastError).toMatch(/Amount mismatch/);
  });

  it("releases stock and the coupon when the customer abandons payment", async () => {
    await Coupon.create({ code: "RITUAL10", type: "percent", value: 10, usageLimit: 5 });
    const s = await shopper({ coupon: "RITUAL10" });
    const res = await place(s, { paymentMethod: "razorpay", expectedTotal: 89820 });
    expect(await stockOf(MEN)).toBe(118);
    const ab = await request(app).post(`/api/orders/${res.body.order.orderNumber}/payment/abandon`).set(s.h);
    expect(ab.body.order.status).toBe("cancelled");
    expect(await stockOf(MEN)).toBe(120);
    expect((await CouponRedemption.findOne()).status).toBe("released");
    expect((await Coupon.findOne()).usedCount).toBe(0);
    // The cart is kept so the customer can try again.
    expect((await Cart.findOne({ user: s.user.id })).items).toHaveLength(1);
  });

  it("cancels the order and gives stock back if Razorpay can't create the payment", async () => {
    mockProviders({ "/v1/orders": { status: 500, body: { error: { description: "Server error" } } } });
    const s = await shopper();
    const res = await place(s, { paymentMethod: "razorpay" });
    expect(res.status).toBe(502);
    expect(await stockOf(MEN)).toBe(120);
    expect((await Order.findOne()).status).toBe("cancelled");
  });

  it("offers COD only when Razorpay isn't configured", async () => {
    const codOnly = buildApp({ CRON_SECRET });
    const session = await registerUser(codOnly);
    const h = bearer(session.accessToken);
    await request(codOnly).put("/api/cart/items").set(h).send({ sku: MEN, qty: 1 });
    const q = await request(codOnly).post("/api/checkout/quote").set(h).send({ pincode: "560001" });
    expect(q.body.payment.razorpay.available).toBe(false);
  });
});

describe("reservation expiry (cron)", () => {
  it("requires the cron secret", async () => {
    expect((await request(app).post("/api/cron/cleanup")).status).toBe(401);
    expect((await request(app).post("/api/cron/cleanup").set("x-cron-secret", "nope")).status).toBe(401);
  });

  it("cancels unpaid orders past their hold; a late payment revives the order if stock allows", async () => {
    const s = await shopper();
    const res = await place(s, { paymentMethod: "razorpay" });
    await Order.updateOne({ orderNumber: res.body.order.orderNumber }, { $set: { reservedUntil: new Date(Date.now() - 1000) } });
    const cron = await request(app).post("/api/cron/cleanup").set("x-cron-secret", CRON_SECRET);
    expect(cron.body).toEqual({ expiredOrders: 1, releasedCoupons: 0 });
    expect(await stockOf(MEN)).toBe(120);

    const order = await Order.findOne({ orderNumber: res.body.order.orderNumber });
    expect(order.status).toBe("cancelled");
    await razorpayWebhook(captured(order));
    const revived = await Order.findById(order._id);
    expect(revived.status).toBe("paid");
    expect(revived.holdsStock).toBe(true);
    expect(await stockOf(MEN)).toBe(118);
  });

  it("refunds a late payment automatically when the stock has gone", async () => {
    mockProviders({ "/refund": { body: { id: "rfnd_TEST1", status: "pending" } } });
    const s = await shopper();
    const res = await place(s, { paymentMethod: "razorpay" });
    await Order.updateOne({ orderNumber: res.body.order.orderNumber }, { $set: { reservedUntil: new Date(Date.now() - 1000) } });
    await request(app).post("/api/cron/cleanup").set("x-cron-secret", CRON_SECRET);
    await setStock(MEN, 0);
    const order = await Order.findOne({ orderNumber: res.body.order.orderNumber });
    await razorpayWebhook(captured(order));
    const after = await Order.findById(order._id);
    expect(after.status).toBe("cancelled");
    expect(after.refund).toMatchObject({ status: "pending", amount: 99800, razorpayRefundId: "rfnd_TEST1" });
  });
});

describe("customer order pages", () => {
  it("lists only the customer's own orders and hides others' behind 404", async () => {
    const a = await shopper();
    const b = await shopper();
    const res = await place(a);
    const n = res.body.order.orderNumber;
    expect((await request(app).get("/api/orders").set(a.h)).body).toMatchObject({ total: 1, orders: [{ orderNumber: n }] });
    expect((await request(app).get("/api/orders").set(b.h)).body.total).toBe(0);
    expect((await request(app).get(`/api/orders/${n}`).set(b.h)).status).toBe(404);
    expect((await request(app).post(`/api/orders/${n}/cancel`).set(b.h).send({})).status).toBe(404);
    expect((await request(app).get(`/api/orders/${n}`).set(a.h)).body.order.address.line1).toBe("12 MG Road");
  });

  it("lets a customer cancel a paid order before packing (refund requested), not after", async () => {
    const s = await shopper();
    const order = await paidOrder(s);
    const cancel = await request(app).post(`/api/orders/${order.orderNumber}/cancel`).set(s.h).send({ reason: "Ordered twice" });
    expect(cancel.body.order).toMatchObject({ status: "cancelled", refund: { status: "requested", amount: 99800 }, canCancel: false });
    expect(await stockOf(MEN)).toBe(120);
    await drainMailQueue();
    expect(outbox.some((m) => m.meta?.purpose === "order-cancelled")).toBe(true);

    const other = await shopper();
    const packed = await paidOrder(other);
    await Order.updateOne({ _id: packed._id }, { $set: { status: "packed" } });
    expect((await request(app).post(`/api/orders/${packed.orderNumber}/cancel`).set(other.h).send({})).body.error.code).toBe("CANNOT_CANCEL");
  });

  it("serves the GST invoice PDF to the owner once confirmed", async () => {
    const s = await shopper();
    const pending = await place(s);
    expect((await request(app).get(`/api/orders/${pending.body.order.orderNumber}/invoice`).set(s.h)).status).toBe(404);
    const buyer = await shopper();
    const order = await paidOrder(buyer);
    const pdf = await request(app).get(`/api/orders/${order.orderNumber}/invoice`).set(buyer.h).buffer(true).parse((res, cb) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => cb(null, Buffer.concat(chunks)));
    });
    expect(pdf.status).toBe(200);
    expect(pdf.headers["content-type"]).toBe("application/pdf");
    expect(pdf.headers["content-disposition"]).toContain(order.orderNumber);
    expect(pdf.body.subarray(0, 4).toString()).toBe("%PDF");
    const u = await registerUser(app);
    expect((await request(app).get(`/api/orders/${order.orderNumber}/invoice`).set(bearer(u.accessToken))).status).toBe(404);
  });

  it("tracks an order publicly by number + email without exposing the address", async () => {
    const s = await shopper();
    const order = await paidOrder(s);
    const res = await request(app).post("/api/track-order").send({ orderNumber: order.orderNumber.toLowerCase(), email: s.email.toUpperCase() });
    expect(res.status).toBe(200);
    expect(res.body.order).toMatchObject({ orderNumber: order.orderNumber, status: "paid", destination: { city: "Bengaluru", state: "Karnataka" } });
    expect(JSON.stringify(res.body)).not.toMatch(/MG Road|9876543210|pay_/);
    expect((await request(app).post("/api/track-order").send({ orderNumber: order.orderNumber, email: "someone@example.com" })).status).toBe(404);
  });
});

describe("fulfilment (staff/admin)", () => {
  it("moves an order through the allowed steps only, with role checks and emails", async () => {
    const s = await shopper();
    const order = await paidOrder(s);
    const staff = bearer((await registerAs(app, "staff")).accessToken);
    const admin = bearer((await registerAs(app, "admin")).accessToken);
    const move = (h, body) => request(app).post(`/api/admin/orders/${order._id}/status`).set(h).send(body);

    expect((await move(s.h, { status: "processing" })).status).toBe(403);
    expect((await move(staff, { status: "delivered" })).body.error.code).toBe("INVALID_TRANSITION");
    expect((await move(staff, { status: "cancelled" })).status).toBe(403);
    expect((await move(staff, { status: "processing" })).body.order.status).toBe("processing");
    expect((await move(staff, { status: "packed" })).body.order.status).toBe("packed");
    const shipped = await move(staff, { status: "shipped", shipment: { courier: "Delhivery", awb: "AWB12345", trackingUrl: "https://track.example.com/AWB12345" } });
    expect(shipped.body.order.shipment).toMatchObject({ courier: "Delhivery", awb: "AWB12345" });
    expect((await move(admin, { status: "delivered" })).body.order.status).toBe("delivered");

    await drainMailQueue();
    const mails = outbox.filter((m) => m.to === s.email).map((m) => m.meta?.purpose);
    expect(mails).toEqual(expect.arrayContaining(["order-confirmed", "order-shipped", "order-delivered"]));
    const delivered = outbox.find((m) => m.meta?.purpose === "order-delivered");
    expect(delivered.attachments[0]).toMatchObject({ contentType: "application/pdf" });
    expect(delivered.attachments[0].content.subarray(0, 4).toString()).toBe("%PDF");

    const list = await request(app).get("/api/admin/orders?status=delivered").set(staff);
    expect(list.body).toMatchObject({ total: 1, counts: { delivered: 1 } });
    const pdf = await request(app).get(`/api/admin/orders/${order._id}/invoice`).set(staff);
    expect(pdf.headers["content-type"]).toBe("application/pdf");
  });

  it("books Shiprocket on packing and applies tracking webhooks (forward only, once)", async () => {
    const env = { ...RZ, CRON_SECRET, SHIPROCKET_EMAIL: "ops@example.com", SHIPROCKET_PASSWORD: "pw", SHIPROCKET_WEBHOOK_TOKEN: "sr-webhook-token" };
    const srApp = buildApp(env);
    mockProviders({
      "/auth/login": { body: { token: "sr-jwt" } },
      "/courier/serviceability": { body: { data: { available_courier_companies: [{ courier_name: "Delhivery", estimated_delivery_days: "3", cod: 1 }] } } },
      "/orders/create/adhoc": { body: { order_id: 9001, shipment_id: 7001 } },
      "/courier/assign/awb": { body: { response: { data: { awb_code: "SR123456789", courier_name: "Delhivery" } } } },
      "/courier/generate/pickup": { body: { pickup_status: 1 } },
      "/courier/generate/label": { body: { label_url: "https://labels.example.com/7001.pdf" } },
    });
    const session = await registerUser(srApp);
    const h = bearer(session.accessToken);
    const addr = await request(srApp).post("/api/addresses").set(h).send({ fullName: "Ravi Kumar", phone: "9876543210", line1: "1 Park St", city: "Kolkata", state: "West Bengal", pincode: "700016" });
    await request(srApp).put("/api/cart/items").set(h).send({ sku: MEN, qty: 1 });
    const placed = await request(srApp).post("/api/orders").set(h).set("Idempotency-Key", key()).send({ addressId: addr.body.address.id, deliveryMethod: "standard", paymentMethod: "cod", expectedTotal: 49900 });
    await drainMailQueue();
    await request(srApp).post(`/api/orders/${placed.body.order.orderNumber}/cod/confirm`).set(h).send({ code: lastCode(session.email) });

    const staff = bearer((await registerAs(srApp, "staff")).accessToken);
    const order = await Order.findOne({ orderNumber: placed.body.order.orderNumber });
    const packed = await request(srApp).post(`/api/admin/orders/${order._id}/status`).set(staff).send({ status: "packed" });
    expect(packed.body.order.shipment).toMatchObject({ shiprocketOrderId: "9001", shipmentId: "7001", awb: "SR123456789", labelUrl: "https://labels.example.com/7001.pdf" });
    expect(providerCalls.find((c) => c.url.includes("/orders/create/adhoc")).body).toMatchObject({ order_id: order.orderNumber, payment_method: "COD", sub_total: 499, billing_pincode: "700016" });

    const hook = (body, token = "sr-webhook-token") => request(srApp).post("/api/webhooks/shipping").set("Content-Type", "application/json").set("x-api-key", token).send(JSON.stringify(body));
    expect((await hook({ awb: "SR123456789", current_status: "DELIVERED" }, "wrong")).status).toBe(401);
    const scan = { date: "2026-10-05 10:15:00", activity: "Shipment picked up", location: "Bengaluru", "sr-status-label": "PICKED UP" };
    const inTransit = { awb: "SR123456789", current_status: "IN TRANSIT", current_status_id: 18, current_timestamp: "05 10 2026 10:20:00", scans: [scan] };
    expect((await hook(inTransit)).body.result).toBe("processed");
    expect((await hook(inTransit)).body.result).toBe("duplicate");
    let now = await Order.findById(order._id);
    expect(now.status).toBe("shipped");
    expect(now.shipment.events).toHaveLength(1);

    await hook({ awb: "SR123456789", current_status: "DELIVERED", current_status_id: 7, current_timestamp: "06 10 2026 12:00:00", scans: [scan, { ...scan, date: "2026-10-06 12:00:00", activity: "Delivered" }] });
    now = await Order.findById(order._id);
    expect(now.status).toBe("delivered");
    expect(now.shipment.events).toHaveLength(2);
    // A late "in transit" never moves a delivered order backwards.
    await hook({ ...inTransit, current_timestamp: "06 10 2026 13:00:00" });
    expect((await Order.findById(order._id)).status).toBe("delivered");
    expect((await hook({ awb: "UNKNOWN", current_status: "DELIVERED" })).status).toBe(200);
  });

  it("refunds through Razorpay (admin only) and finishes on the refund webhook; COD refunds need a reference", async () => {
    mockProviders({ "/refund": { body: { id: "rfnd_TEST9", status: "pending" } } });
    const s = await shopper();
    const order = await paidOrder(s);
    await Order.updateOne({ _id: order._id }, { $set: { status: "delivered" } });
    const staff = bearer((await registerAs(app, "staff")).accessToken);
    const admin = bearer((await registerAs(app, "admin")).accessToken);
    expect((await request(app).post(`/api/admin/orders/${order._id}/refund`).set(staff).send({})).status).toBe(403);
    expect((await request(app).post(`/api/admin/orders/${order._id}/refund`).set(admin).send({ amount: 99801 })).status).toBe(400);
    const started = await request(app).post(`/api/admin/orders/${order._id}/refund`).set(admin).send({ note: "Damaged in transit" });
    expect(started.body.order.refund).toMatchObject({ status: "pending", razorpayRefundId: "rfnd_TEST9", amount: 99800 });
    expect(providerCalls.find((c) => c.url.includes("/payments/pay_TEST000001/refund")).body).toMatchObject({ amount: 99800 });
    expect((await request(app).post(`/api/admin/orders/${order._id}/refund`).set(admin).send({})).body.error.code).toBe("REFUND_EXISTS");

    await razorpayWebhook({ event: "refund.processed", payload: { refund: { entity: { id: "rfnd_TEST9", payment_id: "pay_TEST000001", amount: 99800 } } } });
    expect((await Order.findById(order._id)).status).toBe("refunded");

    const c = await shopper();
    const cod = await place(c);
    await Order.updateOne({ orderNumber: cod.body.order.orderNumber }, { $set: { status: "delivered" } });
    const codOrder = await Order.findOne({ orderNumber: cod.body.order.orderNumber });
    expect((await request(app).post(`/api/admin/orders/${codOrder._id}/refund`).set(admin).send({})).status).toBe(400);
    const done = await request(app).post(`/api/admin/orders/${codOrder._id}/refund`).set(admin).send({ reference: "UPI-REF-778899" });
    expect(done.body.order).toMatchObject({ status: "refunded", refund: { status: "processed", reference: "UPI-REF-778899" } });
  });

  it("lets admins manage delivery settings and PIN rules", async () => {
    const admin = bearer((await registerAs(app, "admin")).accessToken);
    const staff = bearer((await registerAs(app, "staff")).accessToken);
    expect((await request(app).get("/api/admin/delivery").set(staff)).status).toBe(403);
    const put = await request(app).put("/api/admin/delivery").set(admin).send({ cod: { fee: 2900 }, express: { enabled: true, fee: 14900 } });
    expect(put.body.settings).toMatchObject({ cod: { enabled: true, fee: 2900, maxOrder: 500000 }, express: { enabled: true, fee: 14900 } });
    const rule = await request(app).post("/api/admin/pincode-rules").set(admin).send({ pincode: "682001", codAvailable: false, city: "Kochi", state: "Kerala" });
    expect(rule.status).toBe(201);
    expect((await request(app).post("/api/admin/pincode-rules").set(admin).send({ pincode: "682001" })).status).toBe(409);
    expect((await request(app).get("/api/delivery/check?pincode=682001")).body.delivery).toMatchObject({ codAvailable: false, city: "Kochi" });
    expect((await request(app).patch(`/api/admin/pincode-rules/${rule.body.rule.id}`).set(admin).send({ serviceable: false })).body.rule.serviceable).toBe(false);
    expect((await request(app).delete(`/api/admin/pincode-rules/${rule.body.rule.id}`).set(admin)).status).toBe(204);
  });
});

describe("rules", () => {
  it("state machine allows only listed moves", () => {
    expect(canTransition("payment_pending", "paid")).toBe(true);
    expect(canTransition("payment_pending", "shipped")).toBe(false);
    expect(canTransition("delivered", "cancelled")).toBe(false);
    expect(canTransition("refunded", "paid")).toBe(false);
  });

  it("splits GST out of inclusive prices and uses the Indian financial year", () => {
    expect(splitTax(11800, 18)).toEqual({ taxable: 10000, tax: 1800 });
    expect(financialYear(new Date("2026-03-31"))).toBe("25-26");
    expect(financialYear(new Date("2026-04-01"))).toBe("26-27");
  });
});
