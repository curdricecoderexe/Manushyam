const mongoose = require("mongoose");

const ORDER_STATUSES = [
  "payment_pending",
  "cod_pending_confirmation",
  "paid",
  "cod_confirmed",
  "processing",
  "packed",
  "shipped",
  "out_for_delivery",
  "delivered",
  "cancelled",
  "rto",
  "refunded",
];
const PAYMENT_METHODS = ["razorpay", "cod"];
const DELIVERY_METHODS = ["standard", "express"];
const HISTORY_SOURCES = ["customer", "staff", "admin", "system", "razorpay", "shiprocket"];

// Customers can cancel up to (not including) packing.
const CUSTOMER_CANCELLABLE = ["payment_pending", "cod_pending_confirmation", "paid", "cod_confirmed", "processing"];

const paise = { type: Number, min: 0, validate: { validator: Number.isInteger, message: "must be whole paise" } };

const itemSchema = new mongoose.Schema(
  {
    product: { type: mongoose.Schema.Types.ObjectId, ref: "Product", required: true },
    slug: String,
    sku: { type: String, required: true },
    name: { type: String, required: true },
    variantLabel: String,
    image: { _id: false, url: String, alt: String },
    price: { ...paise, required: true },
    mrp: paise,
    qty: { type: Number, required: true, min: 1 },
    lineTotal: { ...paise, required: true },
    weightGrams: Number,
  },
  { _id: false }
);

const addressSnapshot = {
  _id: false,
  fullName: String,
  phone: String,
  line1: String,
  line2: String,
  landmark: String,
  city: String,
  state: String,
  pincode: String,
};

// Everything about the order is copied in at checkout (items, prices, address) so later catalogue
// or address edits never change what the customer bought.
const orderSchema = new mongoose.Schema(
  {
    orderNumber: { type: String, required: true, unique: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    email: { type: String, required: true, lowercase: true },
    customerName: String,
    items: { type: [itemSchema], validate: (v) => v.length > 0 },
    address: addressSnapshot,
    delivery: {
      _id: false,
      method: { type: String, enum: DELIVERY_METHODS, default: "standard" },
      etaMinDays: Number,
      etaMaxDays: Number,
      courier: String,
    },
    amounts: {
      _id: false,
      subtotal: { ...paise, required: true },
      discount: { ...paise, default: 0 },
      shipping: { ...paise, default: 0 },
      codFee: { ...paise, default: 0 },
      total: { ...paise, required: true },
    },
    coupon: { _id: false, code: String, discount: paise, redemption: { type: mongoose.Schema.Types.ObjectId, ref: "CouponRedemption" } },
    paymentMethod: { type: String, enum: PAYMENT_METHODS, required: true },
    status: { type: String, enum: ORDER_STATUSES, required: true, index: true },
    history: {
      type: [
        {
          _id: false,
          status: { type: String, enum: ORDER_STATUSES },
          at: { type: Date, default: Date.now },
          source: { type: String, enum: HISTORY_SOURCES },
          by: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
          note: { type: String, maxlength: 300 },
        },
      ],
      default: [],
    },
    // True while this order's quantities are taken out of stock; cleared when they are put back.
    holdsStock: { type: Boolean, default: true },
    // An unpaid / unconfirmed order is cancelled (and its stock released) after this.
    reservedUntil: { type: Date, index: true },
    payment: {
      _id: false,
      razorpayOrderId: { type: String, index: { unique: true, sparse: true } },
      razorpayPaymentId: String,
      method: String,
      capturedAt: Date,
      failedAttempts: { type: Number, default: 0 },
      lastError: String,
    },
    cod: { _id: false, challengeId: String, confirmedAt: Date },
    refund: {
      _id: false,
      status: { type: String, enum: ["none", "requested", "pending", "processed", "failed"], default: "none" },
      amount: paise,
      razorpayRefundId: String,
      // COD refunds are paid out manually; the bank/UPI reference is recorded here.
      reference: { type: String, maxlength: 120 },
      note: { type: String, maxlength: 300 },
      processedAt: Date,
    },
    shipment: {
      _id: false,
      shiprocketOrderId: String,
      shipmentId: String,
      awb: { type: String, index: { sparse: true } },
      courier: String,
      trackingUrl: String,
      labelUrl: String,
      error: String,
      events: { type: [{ _id: false, at: Date, status: String, location: String, activity: String }], default: [] },
      lastSyncedAt: Date,
    },
    cancelReason: { type: String, maxlength: 300 },
    invoiceNumber: { type: String, index: { unique: true, sparse: true } },
    invoiceDate: Date,
    deliveredAt: Date,
  },
  { timestamps: true }
);
orderSchema.index({ user: 1, createdAt: -1 });
orderSchema.index({ status: 1, reservedUntil: 1 });

function publicItem(i) {
  return { sku: i.sku, slug: i.slug, name: i.name, variantLabel: i.variantLabel, image: i.image?.url ? { url: i.image.url, alt: i.image.alt || "" } : null, price: i.price, mrp: i.mrp ?? null, qty: i.qty, lineTotal: i.lineTotal };
}

function publicShipment(s) {
  if (!s?.awb && !s?.trackingUrl && !s?.events?.length) return null;
  return { awb: s.awb ?? null, courier: s.courier ?? null, trackingUrl: s.trackingUrl ?? null, events: (s.events || []).map((e) => ({ at: e.at, status: e.status, location: e.location, activity: e.activity })) };
}

// What the customer sees on their order pages.
orderSchema.methods.toCustomer = function toCustomer() {
  return {
    id: String(this._id),
    orderNumber: this.orderNumber,
    status: this.status,
    paymentMethod: this.paymentMethod,
    items: this.items.map(publicItem),
    address: this.address,
    delivery: this.delivery,
    amounts: this.amounts,
    coupon: this.coupon?.code ? { code: this.coupon.code, discount: this.coupon.discount } : null,
    history: this.history.map((h) => ({ status: h.status, at: h.at, note: h.note ?? null })),
    shipment: publicShipment(this.shipment),
    refund: this.refund?.status && this.refund.status !== "none" ? { status: this.refund.status, amount: this.refund.amount ?? null, processedAt: this.refund.processedAt ?? null } : null,
    reservedUntil: ["payment_pending", "cod_pending_confirmation"].includes(this.status) ? this.reservedUntil : null,
    razorpayOrderId: this.status === "payment_pending" ? this.payment?.razorpayOrderId ?? null : null,
    canCancel: CUSTOMER_CANCELLABLE.includes(this.status),
    hasInvoice: Boolean(this.invoiceNumber),
    cancelReason: this.cancelReason ?? null,
    createdAt: this.createdAt,
    deliveredAt: this.deliveredAt ?? null,
  };
};

// Public "track order" lookup: no street address, phone or payment details.
orderSchema.methods.toTracking = function toTracking() {
  return {
    orderNumber: this.orderNumber,
    status: this.status,
    paymentMethod: this.paymentMethod,
    items: this.items.map((i) => ({ name: i.name, qty: i.qty, image: i.image?.url ? { url: i.image.url, alt: i.image.alt || "" } : null })),
    destination: { city: this.address?.city, state: this.address?.state },
    delivery: this.delivery,
    total: this.amounts.total,
    history: this.history.map((h) => ({ status: h.status, at: h.at })),
    shipment: publicShipment(this.shipment),
    createdAt: this.createdAt,
  };
};

orderSchema.methods.toAdmin = function toAdmin() {
  const obj = this.toObject({ versionKey: false });
  const { _id, ...rest } = obj;
  return { id: String(_id), ...rest, user: String(rest.user) };
};

// Order submissions are keyed per customer so a double click or retry returns the same order.
const idempotencyKeySchema = new mongoose.Schema(
  {
    key: { type: String, required: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    requestHash: { type: String, required: true },
    order: { type: mongoose.Schema.Types.ObjectId, ref: "Order" },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true }
);
idempotencyKeySchema.index({ user: 1, key: 1 }, { unique: true });
idempotencyKeySchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

// Every processed webhook delivery, so a retried or replayed event is applied only once.
const webhookEventSchema = new mongoose.Schema(
  {
    provider: { type: String, enum: ["razorpay", "shiprocket"], required: true },
    eventId: { type: String, required: true },
    type: String,
    order: { type: mongoose.Schema.Types.ObjectId, ref: "Order" },
    receivedAt: { type: Date, default: Date.now },
  },
  { timestamps: false }
);
webhookEventSchema.index({ provider: 1, eventId: 1 }, { unique: true });
webhookEventSchema.index({ receivedAt: 1 }, { expireAfterSeconds: 90 * 24 * 3600 });

// Gapless-enough sequences (GST invoice numbers per financial year).
const counterSchema = new mongoose.Schema({ _id: String, seq: { type: Number, default: 0 } });

const Order = mongoose.models.Order || mongoose.model("Order", orderSchema);
const IdempotencyKey = mongoose.models.IdempotencyKey || mongoose.model("IdempotencyKey", idempotencyKeySchema);
const WebhookEvent = mongoose.models.WebhookEvent || mongoose.model("WebhookEvent", webhookEventSchema);
const Counter = mongoose.models.Counter || mongoose.model("Counter", counterSchema);

module.exports = { Order, IdempotencyKey, WebhookEvent, Counter, ORDER_STATUSES, PAYMENT_METHODS, DELIVERY_METHODS, CUSTOMER_CANCELLABLE };
