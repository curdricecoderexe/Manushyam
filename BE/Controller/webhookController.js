const crypto = require("crypto");
const { Order, WebhookEvent } = require("../Models/Order");
const orders = require("../Services/orders");
const { verifyWebhookSignature } = require("../Services/razorpay");
const { parseDate } = require("../Services/shiprocket");
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
  const eventId = req.get("x-razorpay-event-id") || crypto.createHash("sha256").update(req.body).digest("hex");

  const result = await once("razorpay", eventId, event.event, async () => {
    const payment = event.payload?.payment?.entity;
    switch (event.event) {
      case "payment.captured":
        await orders.markPaid({ razorpayOrderId: payment.order_id, paymentId: payment.id, method: payment.method, amount: payment.amount, source: "razorpay" });
        break;
      case "payment.failed":
        await orders.recordPaymentFailure({ razorpayOrderId: payment.order_id, reason: payment.error_description });
        break;
      case "refund.processed": {
        const refund = event.payload?.refund?.entity;
        const order = await Order.findOne({ "payment.razorpayPaymentId": refund?.payment_id });
        if (order) await orders.finaliseRefund(order, { refundId: refund.id, amount: refund.amount });
        break;
      }
      default:
        break; // other events are acknowledged and ignored
    }
  });
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

module.exports = { razorpay, shiprocket, safeEqualText };
