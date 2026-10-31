const { Order } = require("../Models/Order");
const orders = require("../Services/orders");
const { quoteDelivery } = require("../Services/delivery");
const { verifyPaymentSignature } = require("../Services/razorpay");
const { buildInvoicePdf } = require("../Services/invoice");
const { CUSTOMER_CANCELLABLE } = require("../Models/Order");
const { AppError } = require("../Utils/AppError");

const PAGE_SIZE = 10;

// Every customer lookup is scoped to the signed-in user; someone else's order is simply "not found".
async function loadOwnOrder(req) {
  const order = await Order.findOne({ orderNumber: req.params.orderNumber, user: req.user.id });
  if (!order) throw AppError.notFound("Order not found");
  return order;
}

// Public PIN check (product page, cart, checkout address step).
async function checkDelivery(req, res) {
  const { pincode, subtotal } = req.validatedQuery;
  const quote = await quoteDelivery({ pincode, subtotal: subtotal ?? 0 });
  res.set("Cache-Control", "no-store");
  res.json({ delivery: quote });
}

async function quote(req, res) {
  const ctx = await orders.prepareCheckout({ userId: req.user.id, ...req.body });
  res.set("Cache-Control", "no-store");
  res.json(orders.quoteView(ctx));
}

async function placeOrder(req, res) {
  const result = await orders.placeOrder({ userId: req.user.id, body: req.body, idempotencyKey: req.idempotencyKey });
  res.status(result.replayed ? 200 : 201).json(result);
}

async function listOrders(req, res) {
  const { page } = req.validatedQuery;
  const filter = { user: req.user.id };
  const [list, total] = await Promise.all([
    Order.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * PAGE_SIZE)
      .limit(PAGE_SIZE),
    Order.countDocuments(filter),
  ]);
  res.json({ orders: list.map((o) => o.toCustomer()), page, pages: Math.max(1, Math.ceil(total / PAGE_SIZE)), total });
}

async function getOrder(req, res) {
  res.set("Cache-Control", "no-store");
  res.json({ order: (await loadOwnOrder(req)).toCustomer() });
}

// Razorpay checkout success callback. The signature proves Razorpay authorised this payment for
// this order; the webhook will confirm the same payment independently.
async function verifyPayment(req, res) {
  const order = await loadOwnOrder(req);
  const { razorpay_order_id: rzOrderId, razorpay_payment_id: paymentId, razorpay_signature: signature } = req.body;
  if (order.payment?.razorpayOrderId !== rzOrderId || !verifyPaymentSignature({ orderId: rzOrderId, paymentId, signature })) {
    throw new AppError(400, "PAYMENT_VERIFICATION_FAILED", "We couldn’t verify this payment. If money was deducted, it will be confirmed or refunded automatically.");
  }
  const updated = await orders.markPaid({ razorpayOrderId: rzOrderId, paymentId, source: "customer" });
  res.json({ order: updated.toCustomer() });
}

// The customer closed the payment window or the payment failed: release the stock straight away.
async function abandonPayment(req, res) {
  const order = await loadOwnOrder(req);
  if (order.status !== "payment_pending") return res.json({ order: order.toCustomer() });
  const cancelled = await orders.cancelOrder(order, { source: "customer", by: req.user.id, reason: "Payment not completed" });
  res.json({ order: cancelled.toCustomer() });
}

async function confirmCod(req, res) {
  const order = await orders.confirmCod(await loadOwnOrder(req), req.body.code);
  res.json({ order: order.toCustomer() });
}

async function resendCod(req, res) {
  const challengeId = await orders.resendCodCode(await loadOwnOrder(req));
  res.json({ challengeId });
}

async function cancelOrder(req, res) {
  const order = await loadOwnOrder(req);
  if (!CUSTOMER_CANCELLABLE.includes(order.status)) {
    throw new AppError(409, "CANNOT_CANCEL", "This order has already been packed, so it can’t be cancelled. You can refuse the delivery or contact us for a return.");
  }
  const cancelled = await orders.cancelOrder(order, { source: "customer", by: req.user.id, reason: req.body.reason || "Cancelled by customer" });
  res.json({ order: cancelled.toCustomer() });
}

async function sendInvoice(res, order) {
  if (!order.invoiceNumber) throw AppError.notFound("The invoice is available once the order is confirmed.");
  const pdf = await buildInvoicePdf(order);
  res.set({
    "Content-Type": "application/pdf",
    "Content-Disposition": `attachment; filename="ManushyaM-invoice-${order.orderNumber}.pdf"`,
    "Cache-Control": "private, no-store",
  });
  res.send(pdf);
}

async function downloadInvoice(req, res) {
  await sendInvoice(res, await loadOwnOrder(req));
}

// Public tracking: order number + the email it was placed with (both must match).
async function trackOrder(req, res) {
  const order = await Order.findOne({ orderNumber: req.body.orderNumber, email: req.body.email });
  if (!order || order.status === "payment_pending") throw AppError.notFound("We couldn’t find an order with those details.");
  res.set("Cache-Control", "no-store");
  res.json({ order: order.toTracking() });
}

module.exports = { checkDelivery, quote, placeOrder, listOrders, getOrder, verifyPayment, abandonPayment, confirmCod, resendCod, cancelOrder, downloadInvoice, trackOrder, sendInvoice };
