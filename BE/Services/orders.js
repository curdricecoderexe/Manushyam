const crypto = require("crypto");
const mongoose = require("mongoose");
const { Order, IdempotencyKey } = require("../Models/Order");
const { Cart } = require("../Models/Cart");
const { Address } = require("../Models/Address");
const { User } = require("../Models/User");
const { priceCart } = require("./pricing");
const { quoteDelivery } = require("./delivery");
const { takeStock, returnStock } = require("./inventory");
const { reserveCoupon, confirmRedemption, releaseRedemption } = require("./coupons");
const { assertTransition, canTransition, SHIPPING_LINE } = require("./orderState");
const { razorpayConfigured, createRazorpayOrder, refundPayment } = require("./razorpay");
const { shiprocketConfigured, createShipment, mapShipmentStatus } = require("./shiprocket");
const { nextInvoiceNumber } = require("./invoice");
const otp = require("./otp");
const { sendOtpEmail } = require("./mailer");
const { enqueue } = require("./mailQueue");
// Email + in-app notification for each order change.
const emails = require("./orderEvents");
const { getEnv } = require("../Config/runtime");
const { AppError } = require("../Utils/AppError");
const { logger } = require("../Utils/logger");

// Stock is held this long for an unpaid online order, and for a COD order awaiting its OTP.
const PREPAID_HOLD_MS = 10 * 60 * 1000;
const COD_HOLD_MS = 20 * 60 * 1000;
const IDEMPOTENCY_TTL_MS = 24 * 3600 * 1000;
const AWAITING = ["payment_pending", "cod_pending_confirmation"];

const rupees = (paise) => `₹${(paise / 100).toLocaleString("en-IN")}`;

async function withTransaction(fn) {
  const session = await mongoose.startSession();
  try {
    let out;
    await session.withTransaction(async () => {
      out = await fn(session);
    });
    return out;
  } finally {
    await session.endSession();
  }
}

// Short, unambiguous and hard to guess: MM261004-7KQ2X.
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
function newOrderNumber(now = new Date()) {
  const ymd = now.toISOString().slice(2, 10).replace(/-/g, "");
  const tail = Array.from(crypto.randomBytes(5), (b) => ALPHABET[b % ALPHABET.length]).join("");
  return `MM${ymd}-${tail}`;
}

function maskEmail(email) {
  const [name, domain] = String(email).split("@");
  return `${name.slice(0, 2)}${"•".repeat(Math.max(1, name.length - 2))}@${domain}`;
}

// --- Checkout quote (shared by the review step and order placement) ---------------------------

async function prepareCheckout({ userId, addressId, pincode, deliveryMethod = "standard", paymentMethod }) {
  const cart = await Cart.findOne({ user: userId });
  if (!cart?.items.length) throw new AppError(400, "CART_EMPTY", "Your cart is empty.");
  const priced = await priceCart({ items: cart.items, couponCode: cart.couponCode, userId });

  let address = null;
  if (addressId) {
    address = await Address.findOne({ _id: addressId, user: userId });
    if (!address) throw AppError.notFound("Address not found");
  }
  const pin = address?.pincode ?? pincode;
  const payable = priced.subtotal - priced.discount;
  const weightGrams = priced.lines.reduce((g, l) => g + (l.weightGrams || 300) * l.qty, 0);
  const delivery = pin ? await quoteDelivery({ pincode: pin, subtotal: payable, weightGrams }) : null;
  const method = delivery?.methods.find((m) => m.id === deliveryMethod) ?? delivery?.methods[0] ?? null;
  const shipping = method?.fee ?? 0;

  const codFee = delivery?.cod.fee ?? 0;
  let codReason = null;
  if (!delivery) codReason = "Add a delivery address to see payment options.";
  else if (!delivery.serviceable) codReason = delivery.message;
  else if (!delivery.codAvailable) codReason = "Cash on Delivery isn’t available for this PIN code.";
  else if (payable + shipping + codFee > delivery.cod.maxOrder) codReason = `Cash on Delivery is available on orders up to ${rupees(delivery.cod.maxOrder)}.`;

  const appliedCodFee = paymentMethod === "cod" ? codFee : 0;
  return {
    cart,
    priced,
    address,
    delivery,
    method,
    selection: { deliveryMethod: method?.id ?? null, shipping, codFee: appliedCodFee, total: payable + shipping + appliedCodFee },
    payment: {
      razorpay: { available: razorpayConfigured() },
      cod: { available: !codReason, fee: codFee, reason: codReason },
    },
  };
}

function quoteView(ctx) {
  return { cart: ctx.priced, delivery: ctx.delivery, selection: ctx.selection, payment: ctx.payment };
}

// --- Placing an order ------------------------------------------------------------------------

function requestHashOf(body) {
  return crypto.createHash("sha256").update(JSON.stringify([body.addressId, body.deliveryMethod, body.paymentMethod, body.expectedTotal])).digest("hex");
}

async function checkoutResponse(order, { replayed = false } = {}) {
  const next = { type: "none" };
  if (order.status === "payment_pending") {
    if (!order.payment?.razorpayOrderId) throw new AppError(409, "ORDER_IN_PROGRESS", "Your order is still being set up. Please try again in a moment.");
    const env = getEnv();
    Object.assign(next, {
      type: "razorpay",
      keyId: env.RAZORPAY_KEY_ID,
      razorpayOrderId: order.payment.razorpayOrderId,
      amount: order.amounts.total,
      currency: "INR",
      prefill: { name: order.address.fullName, email: order.email, contact: order.address.phone },
    });
  } else if (order.status === "cod_pending_confirmation") {
    Object.assign(next, { type: "cod_otp", challengeId: order.cod?.challengeId ?? null, sentTo: maskEmail(order.email) });
  }
  return { order: order.toCustomer(), next, replayed };
}

async function replay(prior, requestHash) {
  if (prior.requestHash !== requestHash) {
    throw new AppError(422, "IDEMPOTENCY_KEY_REUSED", "This checkout was already submitted with different details. Please refresh and try again.");
  }
  const order = await Order.findById(prior.order);
  if (!order) throw new AppError(409, "ORDER_IN_PROGRESS", "Your order is still being set up. Please try again in a moment.");
  return checkoutResponse(order, { replayed: true });
}

// Builds every price from the database, takes stock, claims the coupon and writes the order in one
// transaction keyed by the client's idempotency key — a retried or double-clicked submit returns
// the same order instead of creating a second one.
async function placeOrder({ userId, body, idempotencyKey }) {
  const requestHash = requestHashOf(body);
  const prior = await IdempotencyKey.findOne({ user: userId, key: idempotencyKey });
  if (prior) return replay(prior, requestHash);

  const { addressId, deliveryMethod, paymentMethod, expectedTotal } = body;
  const ctx = await prepareCheckout({ userId, addressId, deliveryMethod, paymentMethod });
  const { priced, delivery, method, cart } = ctx;

  if (!priced.canCheckout || priced.issues.length) {
    throw new AppError(409, "CART_CHANGED", priced.issues[0]?.message ?? "Some items in your cart changed. Please review it.", priced.issues);
  }
  if (cart.couponCode && !priced.coupon?.applied) throw new AppError(409, `COUPON_${priced.coupon?.reason ?? "INVALID"}`, priced.coupon?.message ?? "This code can’t be used.");
  if (!delivery.serviceable) throw new AppError(409, "NOT_SERVICEABLE", delivery.message);
  if (delivery.belowMinOrder) throw new AppError(409, "BELOW_MIN_ORDER", delivery.message);
  if (method?.id !== deliveryMethod) throw new AppError(409, "DELIVERY_UNAVAILABLE", "That delivery option isn’t available for this address.");
  if (paymentMethod === "cod" && !ctx.payment.cod.available) throw new AppError(409, "COD_UNAVAILABLE", ctx.payment.cod.reason);
  if (paymentMethod === "razorpay" && !ctx.payment.razorpay.available) throw new AppError(503, "PAYMENTS_UNAVAILABLE", "Online payments aren’t available right now. Please choose Cash on Delivery.");
  if (expectedTotal !== ctx.selection.total) {
    throw new AppError(409, "PRICE_CHANGED", `Your total changed to ${rupees(ctx.selection.total)}. Please review your order.`, [{ path: "total", message: String(ctx.selection.total) }]);
  }

  const account = await User.findById(userId).select("name email");
  const now = new Date();
  const orderId = new mongoose.Types.ObjectId();
  const a = ctx.address;
  const doc = {
    _id: orderId,
    orderNumber: newOrderNumber(now),
    user: userId,
    email: account.email,
    customerName: account.name,
    items: priced.lines.map((l) => ({ product: l.productId, slug: l.slug, sku: l.sku, name: l.name, variantLabel: l.variantLabel, image: l.image ?? undefined, price: l.price, mrp: l.mrp ?? undefined, qty: l.qty, lineTotal: l.lineTotal, weightGrams: l.weightGrams ?? undefined })),
    address: { fullName: a.fullName, phone: a.phone, line1: a.line1, line2: a.line2, landmark: a.landmark, city: a.city, state: a.state, pincode: a.pincode },
    delivery: { method: method.id, etaMinDays: method.etaMinDays, etaMaxDays: method.etaMaxDays, courier: delivery.courier ?? undefined },
    amounts: { subtotal: priced.subtotal, discount: priced.discount, shipping: ctx.selection.shipping, codFee: ctx.selection.codFee, total: ctx.selection.total },
    paymentMethod,
    status: paymentMethod === "cod" ? "cod_pending_confirmation" : "payment_pending",
    history: [{ status: paymentMethod === "cod" ? "cod_pending_confirmation" : "payment_pending", at: now, source: "customer", by: userId }],
    holdsStock: true,
    reservedUntil: new Date(now.getTime() + (paymentMethod === "cod" ? COD_HOLD_MS : PREPAID_HOLD_MS)),
  };

  try {
    await withTransaction(async (session) => {
      await IdempotencyKey.create([{ key: idempotencyKey, user: userId, requestHash, order: orderId, expiresAt: new Date(now.getTime() + IDEMPOTENCY_TTL_MS) }], { session });
      await takeStock(priced.lines, session);
      if (cart.couponCode) {
        const redemption = await reserveCoupon({ code: cart.couponCode, userId, subtotal: priced.subtotal, orderId, session });
        if (redemption.discount !== priced.discount) throw new AppError(409, "PRICE_CHANGED", "Your discount changed. Please review your order.");
        doc.coupon = { code: priced.coupon.code, discount: redemption.discount, redemption: redemption._id };
      }
      await Order.create([doc], { session });
    });
  } catch (err) {
    // A concurrent submit with the same key won the race: return its order.
    if (err?.code === 11000 && err.keyPattern?.key) {
      const winner = await IdempotencyKey.findOne({ user: userId, key: idempotencyKey });
      if (winner) return replay(winner, requestHash);
    }
    throw err;
  }

  const order = await Order.findById(orderId);
  if (paymentMethod === "razorpay") {
    try {
      const rz = await createRazorpayOrder({ amount: order.amounts.total, receipt: order.orderNumber, notes: { orderId: String(order._id), orderNumber: order.orderNumber } });
      order.payment.razorpayOrderId = rz.id;
      await order.save();
    } catch (err) {
      await cancelOrder(order, { source: "system", reason: "Payment could not be started" });
      throw err;
    }
  } else {
    await startCodChallenge(order);
  }
  return checkoutResponse(order);
}

// --- COD confirmation ------------------------------------------------------------------------

async function startCodChallenge(order) {
  const { challenge, code } = await otp.createChallenge({ purpose: "cod", email: order.email, user: order.user });
  order.cod.challengeId = challenge.challengeId;
  await order.save();
  enqueue("cod-otp", () => sendOtpEmail({ to: order.email, code, purpose: "cod" }));
  return challenge.challengeId;
}

async function resendCodCode(order) {
  if (order.status !== "cod_pending_confirmation") throw new AppError(409, "ORDER_NOT_AWAITING_CONFIRMATION", "This order doesn’t need confirming.");
  try {
    const { challenge, code } = await otp.resendChallenge(order.cod.challengeId);
    enqueue("cod-otp", () => sendOtpEmail({ to: order.email, code, purpose: "cod" }));
    return challenge.challengeId;
  } catch (err) {
    // The old code expired or was replaced by a newer order's code: issue a fresh one.
    if (err.code === "BAD_REQUEST") return startCodChallenge(order);
    throw err;
  }
}

async function confirmCod(order, code) {
  if (order.status === "cod_confirmed") return order;
  if (order.status !== "cod_pending_confirmation") throw new AppError(409, "ORDER_NOT_AWAITING_CONFIRMATION", "This order can no longer be confirmed.");
  if (order.reservedUntil && order.reservedUntil <= new Date()) throw new AppError(409, "ORDER_EXPIRED", "This order expired before it was confirmed. Please place it again.");
  await otp.verifyChallenge({ challengeId: order.cod.challengeId, purpose: "cod", code });

  const confirmed = await withTransaction(async (session) => {
    const o = await Order.findOneAndUpdate(
      { _id: order._id, status: "cod_pending_confirmation" },
      { $set: { status: "cod_confirmed", "cod.confirmedAt": new Date() }, $unset: { reservedUntil: "" }, $push: { history: { status: "cod_confirmed", at: new Date(), source: "customer", by: order.user } } },
      { new: true, session }
    );
    if (!o) return null;
    await finaliseConfirmation(o, session);
    return o;
  });
  if (!confirmed) throw new AppError(409, "ORDER_NOT_AWAITING_CONFIRMATION", "This order can no longer be confirmed.");
  emails.orderConfirmed(confirmed);
  return confirmed;
}

// Paid / COD-confirmed: the coupon use becomes permanent, a GST invoice number is assigned and the cart is emptied.
async function finaliseConfirmation(order, session) {
  if (order.coupon?.redemption) await confirmRedemption(order.coupon.redemption, { session });
  order.invoiceNumber = await nextInvoiceNumber(session);
  order.invoiceDate = new Date();
  await Order.updateOne({ _id: order._id }, { $set: { invoiceNumber: order.invoiceNumber, invoiceDate: order.invoiceDate } }, { session });
  await Cart.updateOne({ user: order.user }, { $set: { items: [] }, $unset: { couponCode: "" } }, { session });
}

// --- Online payment --------------------------------------------------------------------------

// Called by the checkout callback (signature verified) and by the payment.captured webhook,
// in either order and any number of times; only the first call changes anything.
async function markPaid({ razorpayOrderId, paymentId, method, amount, source }) {
  const order = await Order.findOne({ "payment.razorpayOrderId": razorpayOrderId });
  if (!order) {
    logger.warn({ razorpayOrderId }, "Payment for an unknown Razorpay order");
    return null;
  }
  if (order.payment.capturedAt) {
    if (order.payment.razorpayPaymentId !== paymentId) {
      logger.error({ orderNumber: order.orderNumber, paymentId }, "Second payment captured for an already-paid order — refund it from the Razorpay dashboard");
      await Order.updateOne({ _id: order._id }, { $set: { "payment.lastError": `Duplicate payment ${paymentId} — refund manually` } });
    }
    return order;
  }
  if (amount !== undefined && amount !== null && amount !== order.amounts.total) {
    logger.error({ orderNumber: order.orderNumber, amount, expected: order.amounts.total }, "Captured amount doesn't match the order total");
    await Order.updateOne({ _id: order._id }, { $set: { "payment.lastError": `Amount mismatch: received ${amount}` } });
    return order;
  }

  const now = new Date();
  const paymentFields = { "payment.razorpayPaymentId": paymentId, "payment.method": method ?? null, "payment.capturedAt": now };

  if (order.status === "payment_pending") {
    const paid = await withTransaction(async (session) => {
      const o = await Order.findOneAndUpdate(
        { _id: order._id, status: "payment_pending" },
        { $set: { status: "paid", ...paymentFields }, $unset: { reservedUntil: "" }, $push: { history: { status: "paid", at: now, source } } },
        { new: true, session }
      );
      if (!o) return null;
      await finaliseConfirmation(o, session);
      return o;
    });
    if (paid) emails.orderConfirmed(paid);
    return paid ?? Order.findById(order._id);
  }

  if (order.status === "cancelled") return reviveLatePayment(order, { paymentFields, source });
  logger.error({ orderNumber: order.orderNumber, status: order.status }, "Payment captured for an order in an unexpected state");
  return order;
}

// The payment arrived after the hold expired (or after the customer closed the window). If the stock
// is still there the order goes ahead; otherwise the money goes straight back.
async function reviveLatePayment(order, { paymentFields, source }) {
  const now = new Date();
  try {
    const revived = await withTransaction(async (session) => {
      const o = await Order.findOneAndUpdate(
        { _id: order._id, status: "cancelled", "payment.capturedAt": { $exists: false } },
        { $set: { status: "paid", holdsStock: true, ...paymentFields }, $unset: { cancelReason: "", reservedUntil: "" }, $push: { history: { status: "paid", at: now, source, note: "Payment arrived after the order had expired" } } },
        { new: true, session }
      );
      if (!o) return null;
      if (!order.holdsStock) await takeStock(o.items, session);
      await finaliseConfirmation(o, session);
      return o;
    });
    if (revived) emails.orderConfirmed(revived);
    return revived ?? Order.findById(order._id);
  } catch (err) {
    if (err.code !== "OUT_OF_STOCK") throw err;
  }
  await Order.updateOne(
    { _id: order._id },
    { $set: { ...paymentFields, refund: { status: "pending", amount: order.amounts.total, note: "Automatic refund: the items sold out before the payment arrived" } }, $push: { history: { status: "cancelled", at: now, source: "system", note: "Paid after expiry but sold out — refunding" } } }
  );
  try {
    const rz = await refundPayment({ paymentId: paymentFields["payment.razorpayPaymentId"], amount: order.amounts.total, notes: { orderNumber: order.orderNumber } });
    await Order.updateOne({ _id: order._id }, { $set: { "refund.razorpayRefundId": rz.id } });
  } catch (err) {
    logger.error({ err: err.message, orderNumber: order.orderNumber }, "Automatic refund failed — refund manually");
    await Order.updateOne({ _id: order._id }, { $set: { "refund.status": "failed" } });
  }
  return Order.findById(order._id);
}

async function recordPaymentFailure({ razorpayOrderId, reason }) {
  await Order.updateOne({ "payment.razorpayOrderId": razorpayOrderId, status: "payment_pending" }, { $inc: { "payment.failedAttempts": 1 }, $set: { "payment.lastError": String(reason ?? "Payment failed").slice(0, 200) } });
}

// --- Cancelling / expiring -------------------------------------------------------------------

async function cancelOrder(order, { source, by, reason }) {
  if (order.status === "cancelled") return order;
  assertTransition(order.status, "cancelled");
  const wasAwaiting = AWAITING.includes(order.status);
  const paid = Boolean(order.payment?.capturedAt);
  const cancelled = await withTransaction(async (session) => {
    const o = await Order.findOneAndUpdate(
      { _id: order._id, status: order.status },
      {
        $set: { status: "cancelled", cancelReason: reason, holdsStock: false, ...(paid ? { refund: { status: "requested", amount: order.amounts.total } } : {}) },
        $unset: { reservedUntil: "" },
        $push: { history: { status: "cancelled", at: new Date(), source, by, note: reason } },
      },
      { new: true, session }
    );
    if (!o) throw new AppError(409, "ORDER_CHANGED", "This order was just updated. Please refresh and try again.");
    if (order.holdsStock) await returnStock(o.items, session);
    if (o.coupon?.redemption) await releaseRedemption(o.coupon.redemption, { session });
    return o;
  });
  if (!wasAwaiting) emails.orderCancelled(cancelled);
  return cancelled;
}

// Cron: unpaid / unconfirmed orders past their hold give their stock and coupon back.
async function expireReservations(now = new Date()) {
  const stale = await Order.find({ status: { $in: AWAITING }, reservedUntil: { $lte: now } }).limit(200);
  let count = 0;
  for (const order of stale) {
    try {
      await cancelOrder(order, { source: "system", reason: order.status === "payment_pending" ? "Payment wasn’t completed in time" : "Order wasn’t confirmed in time" });
      count += 1;
    } catch (err) {
      if (err.code !== "ORDER_CHANGED") logger.error({ err: err.message, orderNumber: order.orderNumber }, "Couldn't expire order");
    }
  }
  return count;
}

// --- Fulfilment (staff/admin and courier updates) --------------------------------------------

async function advanceOrder(order, to, { source, by, note, shipment }) {
  if (to === "cancelled") return cancelOrder(order, { source, by, reason: note || "Cancelled by ManushyaM" });
  if (to === "refunded") throw AppError.badRequest("Use the refund action to refund an order.");
  assertTransition(order.status, to);

  const set = { status: to };
  if (to === "delivered") set.deliveredAt = new Date();
  if (to === "shipped" && shipment) {
    for (const [k, v] of Object.entries(shipment)) if (v) set[`shipment.${k}`] = v;
  }
  const updated = await Order.findOneAndUpdate({ _id: order._id, status: order.status }, { $set: set, $push: { history: { status: to, at: new Date(), source, by, note } } }, { new: true });
  if (!updated) throw new AppError(409, "ORDER_CHANGED", "This order was just updated. Please refresh and try again.");

  if (to === "packed" && shiprocketConfigured()) return bookShipment(updated);
  if (to === "shipped") emails.orderShipped(updated);
  if (to === "out_for_delivery") emails.orderOutForDelivery(updated);
  if (to === "delivered") emails.orderDelivered(updated);
  return updated;
}

// Creates the Shiprocket shipment. A failure is saved on the order (and shown to staff) so it can be retried.
async function bookShipment(order) {
  try {
    const shipment = await createShipment(order);
    const set = { "shipment.error": null };
    for (const [k, v] of Object.entries(shipment)) if (v !== undefined && v !== null && k !== "events" && k !== "error") set[`shipment.${k}`] = v;
    return await Order.findByIdAndUpdate(order._id, { $set: set }, { new: true });
  } catch (err) {
    logger.error({ err: err.message, orderNumber: order.orderNumber }, "Shiprocket booking failed");
    return Order.findByIdAndUpdate(order._id, { $set: { "shipment.error": err.expose ? err.message : "Shipment booking failed" } }, { new: true });
  }
}

// A courier status update (webhook or hourly sync). Events are merged; status only moves forward.
async function applyTracking(order, { status, events = [], trackingUrl }) {
  const known = new Set((order.shipment?.events ?? []).map((e) => `${new Date(e.at).getTime()}|${e.activity}`));
  const fresh = events.filter((e) => !known.has(`${new Date(e.at).getTime()}|${e.activity}`));
  const set = { "shipment.lastSyncedAt": new Date() };
  if (trackingUrl) set["shipment.trackingUrl"] = trackingUrl;
  const update = { $set: set };
  if (fresh.length) update.$push = { "shipment.events": { $each: fresh.sort((a, b) => a.at - b.at) } };

  const target = mapShipmentStatus(status);
  const from = order.status;
  const forward = target && SHIPPING_LINE.indexOf(from) >= 0 && SHIPPING_LINE.indexOf(target) > SHIPPING_LINE.indexOf(from);
  const rto = target === "rto" && ["packed", "shipped", "out_for_delivery"].includes(from);
  if (forward || rto) {
    set.status = target;
    if (target === "delivered") set.deliveredAt = new Date();
    update.$push = { ...update.$push, history: { status: target, at: new Date(), source: "shiprocket", note: status } };
  }
  const updated = await Order.findOneAndUpdate({ _id: order._id, status: from }, update, { new: true });
  if (!updated) return Order.findById(order._id);
  if (forward && target === "shipped") emails.orderShipped(updated);
  if (forward && target === "out_for_delivery") emails.orderOutForDelivery(updated);
  if (forward && target === "delivered") emails.orderDelivered(updated);
  return updated;
}

// --- Refunds (admin only) --------------------------------------------------------------------

async function refundOrder(order, { amount, note, reference, by }) {
  if (!canTransition(order.status, "refunded")) throw new AppError(409, "INVALID_TRANSITION", "Only cancelled, delivered or returned orders can be refunded.");
  if (["pending", "processed"].includes(order.refund?.status)) throw new AppError(409, "REFUND_EXISTS", "A refund has already been started for this order.");
  const value = amount ?? order.amounts.total;
  if (value < 1 || value > order.amounts.total) throw AppError.badRequest("The refund can’t be more than the order total.", [{ path: "amount", message: "Too large" }]);

  if (order.paymentMethod === "razorpay") {
    if (!order.payment?.capturedAt) throw new AppError(409, "NOTHING_TO_REFUND", "Nothing was paid for this order.");
    const rz = await refundPayment({ paymentId: order.payment.razorpayPaymentId, amount: value, notes: { orderNumber: order.orderNumber } });
    const updated = await Order.findByIdAndUpdate(
      order._id,
      { $set: { refund: { status: "pending", amount: value, razorpayRefundId: rz.id, note } }, $push: { history: { status: order.status, at: new Date(), source: "admin", by, note: `Refund of ${rupees(value)} started` } } },
      { new: true }
    );
    // Razorpay sometimes processes instantly; otherwise the refund.processed webhook finishes the job.
    return rz.status === "processed" ? finaliseRefund(updated, { refundId: rz.id, amount: value }) : updated;
  }

  // COD: paid in cash on delivery, refunded manually by bank transfer / UPI.
  if (order.status !== "delivered") throw new AppError(409, "NOTHING_TO_REFUND", "Nothing was collected for this Cash on Delivery order.");
  if (!reference) throw AppError.badRequest("Enter the bank transfer or UPI reference.", [{ path: "reference", message: "Required for COD refunds" }]);
  const updated = await Order.findOneAndUpdate(
    { _id: order._id, status: order.status },
    { $set: { status: "refunded", refund: { status: "processed", amount: value, reference, note, processedAt: new Date() } }, $push: { history: { status: "refunded", at: new Date(), source: "admin", by, note } } },
    { new: true }
  );
  if (!updated) throw new AppError(409, "ORDER_CHANGED", "This order was just updated. Please refresh and try again.");
  emails.orderRefunded(updated);
  return updated;
}

// refund.processed webhook (or an instant refund). Partial refunds keep the order's status.
async function finaliseRefund(order, { refundId, amount }) {
  if (order.refund?.status === "processed") return order;
  const full = amount >= order.amounts.total;
  const set = { "refund.status": "processed", "refund.processedAt": new Date(), "refund.amount": amount, "refund.razorpayRefundId": refundId };
  const update = { $set: set };
  if (full && canTransition(order.status, "refunded")) {
    set.status = "refunded";
    update.$push = { history: { status: "refunded", at: new Date(), source: "razorpay" } };
  }
  const updated = await Order.findByIdAndUpdate(order._id, update, { new: true });
  emails.orderRefunded(updated);
  return updated;
}

module.exports = {
  prepareCheckout,
  quoteView,
  placeOrder,
  confirmCod,
  resendCodCode,
  markPaid,
  recordPaymentFailure,
  cancelOrder,
  expireReservations,
  advanceOrder,
  bookShipment,
  applyTracking,
  refundOrder,
  finaliseRefund,
  newOrderNumber,
  PREPAID_HOLD_MS,
  COD_HOLD_MS,
};
