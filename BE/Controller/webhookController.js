const crypto = require("crypto");
const { Order, WebhookEvent } = require("../Models/Order");
const orders = require("../Services/orders");
const { verifyWebhookSignature } = require("../Services/razorpay");
const { parseDate } = require("../Services/shiprocket");
const { notifyStaff } = require("../Services/notifications");
const { getEnv } = require("../Config/runtime");
const { logger } = require("../Utils/logger");

function safeEqualText(a, b) {
  const ha = crypto.createHash("sha256").update(String(a ?? "")).digest();
  const hb = crypto.createHash("sha256").update(String(b ?? "")).digest();
  return crypto.timingSafeEqual(ha, hb) && Boolean(a);
}

// Records the event id first; a repeat delivery hits the unique index and is acknowledged without
// being applied again. If processing fails the record is removed so the provider's retry can run.
async function once(provider, eventId, type, handler) {
  try {
    await WebhookEvent.create({ provider, eventId, type });
  } catch (err) {
    if (err?.code === 11000) return "duplicate";
    throw err;
  }
  try {
    await handler();
    return "processed";
  } catch (err) {
    await WebhookEvent.deleteOne({ provider, eventId });
    throw err;
  }
}

// Events to enable in Dashboard → Settings → Webhooks (see BE/.env.example). Everything else is
// acknowledged and ignored. A handler that throws returns 500, the event record is removed and
// Razorpay retries the delivery (with backoff, for up to 24 hours).
const RAZORPAY_EVENTS = {
  // Authorised but not yet captured (automatic capture off, or a late authorisation): capture it.
  "payment.authorized": (event) => orders.settleRazorpayPayment(event.payload?.payment?.entity, { source: "razorpay" }),
  "payment.captured": (event) => applyCaptured(event.payload?.payment?.entity),
  // Fired once the Razorpay order is fully paid; carries the captured payment too.
  "order.paid": (event) => applyCaptured(event.payload?.payment?.entity),
  "payment.failed": (event) => {
    const payment = event.payload?.payment?.entity;
    if (!payment?.order_id) return null;
    return orders.recordPaymentFailure({ razorpayOrderId: payment.order_id, reason: payment.error_description });
  },
  "refund.processed": async (event) => {
    const refund = event.payload?.refund?.entity;
    const order = await orderForRefund(refund);
    if (order) await orders.finaliseRefund(order, { refundId: refund.id, amount: refund.amount });
  },
  "refund.failed": async (event) => {
    const refund = event.payload?.refund?.entity;
    const order = await orderForRefund(refund);
    if (order) await orders.failRefund(order, { refundId: refund.id, reason: refund.error_description || refund.status_details?.description });
  },
  // Chargebacks need a human: tell the team straight away.
  "payment.dispute.created": async (event) => {
    const dispute = event.payload?.dispute?.entity;
    const order = dispute?.payment_id ? await Order.findOne({ "payment.razorpayPaymentId": dispute.payment_id }) : null;
    notifyStaff({
      type: "payment",
      title: `Payment dispute${order ? ` on ${order.orderNumber}` : ""}`,
      body: `${dispute?.reason_description || dispute?.reason_code || "A customer raised a dispute"} · respond in the Razorpay dashboard${dispute?.respond_by ? " before the deadline" : ""}.`.slice(0, 300),
      link: order ? `/admin/orders?q=${order.orderNumber}` : "/admin/orders",
    });
  },
};

// These events are only sent for a captured payment (the entity may already show a later state, e.g.
// "refunded", when a delivery is retried — markPaid ignores repeats for an already-paid order).
function applyCaptured(payment) {
  if (!payment?.id || !payment.order_id) return null;
  return orders.markPaid({ razorpayOrderId: payment.order_id, paymentId: payment.id, method: payment.method, amount: payment.amount, source: "razorpay" });
}

// Refunds started from our side carry the refund id; ones started in the Razorpay dashboard are
// matched by payment id (the duplicate-payment refund ids are skipped — they're not the order's refund).
async function orderForRefund(refund) {
  if (!refund?.id) return null;
  const byRefund = await Order.findOne({ "refund.razorpayRefundId": refund.id });
  if (byRefund) return byRefund;
  if (!refund.payment_id) return null;
  const dup = await Order.findOne({ "payment.duplicateRefunds.paymentId": refund.payment_id });
  if (dup) {
    const status = refund.status === "failed" ? "failed" : "processed";
    await Order.updateOne({ _id: dup._id, "payment.duplicateRefunds.paymentId": refund.payment_id }, { $set: { "payment.duplicateRefunds.$.status": status, "payment.duplicateRefunds.$.refundId": refund.id } });
    return null;
  }
  return Order.findOne({ "payment.razorpayPaymentId": refund.payment_id });
}

async function razorpay(req, res) {
  if (!verifyWebhookSignature(req.body, req.get("x-razorpay-signature"))) {
    logger.warn({ ip: req.ip }, "Razorpay webhook with a bad signature");
    return res.status(400).json({ error: { code: "BAD_SIGNATURE", message: "Invalid signature", requestId: req.id } });
  }
  let event;
  try {
    event = JSON.parse(req.body.toString("utf8"));
  } catch {
    return res.status(400).json({ error: { code: "INVALID_JSON", message: "Invalid body", requestId: req.id } });
  }
  // A webhook secret shared with another Razorpay account (or a sub-merchant) must not move our orders.
  const accountId = getEnv().RAZORPAY_ACCOUNT_ID;
  if (accountId && event.account_id && event.account_id !== accountId) {
    logger.warn({ accountId: event.account_id }, "Razorpay webhook for another account — ignored");
    return res.json({ ok: true, result: "ignored" });
  }
  const handler = RAZORPAY_EVENTS[event.event];
  if (!handler) return res.json({ ok: true, result: "ignored" });

  const eventId = req.get("x-razorpay-event-id") || crypto.createHash("sha256").update(req.body).digest("hex");
  const result = await once("razorpay", eventId, event.event, () => handler(event));
  res.json({ ok: true, result });
}

// Shiprocket tracking updates. Shiprocket expects a 200 for everything it sends, so unknown AWBs
// and irrelevant statuses are acknowledged rather than rejected.
async function shiprocket(req, res) {
  const token = getEnv().SHIPROCKET_WEBHOOK_TOKEN;
  if (!token || !safeEqualText(req.get("x-api-key"), token)) {
    return res.status(401).json({ error: { code: "UNAUTHORIZED", message: "Invalid token", requestId: req.id } });
  }
  let body;
  try {
    body = JSON.parse(req.body.toString("utf8") || "{}");
  } catch {
    return res.status(400).json({ error: { code: "INVALID_JSON", message: "Invalid body", requestId: req.id } });
  }
  if (!body.awb) return res.json({ ok: true, result: "ignored" });

  const eventId = `${body.awb}:${body.current_status_id ?? body.current_status}:${body.current_timestamp ?? ""}`;
  const result = await once("shiprocket", eventId, body.current_status, async () => {
    const order = await Order.findOne({ "shipment.awb": String(body.awb) });
    if (!order) return;
    const events = (Array.isArray(body.scans) ? body.scans : []).slice(-100).map((s) => ({
      at: parseDate(s.date),
      status: String(s["sr-status-label"] || s.status || "").slice(0, 60),
      location: String(s.location ?? "").slice(0, 120),
      activity: String(s.activity ?? "").slice(0, 200),
    }));
    await orders.applyTracking(order, { status: body.current_status, events });
  });
  res.json({ ok: true, result });
}

module.exports = { razorpay, shiprocket, safeEqualText, RAZORPAY_EVENTS };
