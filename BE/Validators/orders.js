const { z } = require("zod");
const { ORDER_STATUSES, PAYMENT_METHODS, DELIVERY_METHODS } = require("../Models/Order");
const { INDIA_STATES } = require("../Data/indiaStates");

const objectId = z.string().regex(/^[a-f\d]{24}$/i, "Not found");
const pincode = z.string().trim().regex(/^[1-9][0-9]{5}$/, "Enter a valid 6-digit PIN code");
const paise = z.number().int().min(0).max(10_000_000);
const orderNumber = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^MM\d{6}-[A-Z0-9]{5}$/, "Enter your order number, e.g. MM261004-7KQ2X");
const note = z.string().trim().max(300).optional();
const eta = z.object({ min: z.number().int().min(0).max(30), max: z.number().int().min(0).max(30) }).strict().refine((e) => e.max >= e.min, { message: "Max days must be at least min days" });
const page = z.coerce.number().int().min(1).max(500).default(1);

const schemas = {
  deliveryCheck: z.object({ pincode, subtotal: z.coerce.number().int().min(0).max(10_000_000).optional() }).strict(),
  quote: z
    .object({
      addressId: objectId.optional(),
      pincode: pincode.optional(),
      deliveryMethod: z.enum(DELIVERY_METHODS).optional(),
      paymentMethod: z.enum(PAYMENT_METHODS).optional(),
    })
    .strict(),
  place: z
    .object({
      addressId: objectId,
      deliveryMethod: z.enum(DELIVERY_METHODS),
      paymentMethod: z.enum(PAYMENT_METHODS),
      // The total the customer reviewed; the order is refused if the server's total differs.
      expectedTotal: paise,
    })
    .strict(),
  idempotencyKey: z.string().regex(/^[A-Za-z0-9_-]{16,64}$/, "Send an Idempotency-Key header (16–64 letters, digits, - or _)"),
  orderParam: z.object({ orderNumber }).strict(),
  listQuery: z.object({ page }).strict(),
  verifyPayment: z
    .object({
      razorpay_order_id: z.string().regex(/^order_[A-Za-z0-9]{6,40}$/),
      razorpay_payment_id: z.string().regex(/^pay_[A-Za-z0-9]{6,40}$/),
      razorpay_signature: z.string().regex(/^[a-f0-9]{64}$/i),
    })
    .strict(),
  codConfirm: z.object({ code: z.string().trim().regex(/^\d{6}$/, "Enter the 6-digit code") }).strict(),
  cancel: z.object({ reason: z.string().trim().max(200).optional() }).strict(),
  track: z.object({ orderNumber, email: z.string().trim().toLowerCase().email("Enter the email used for the order").max(254) }).strict(),

  // --- admin ---
  idParam: z.object({ id: objectId }).strict(),
  adminListQuery: z
    .object({
      status: z.enum(ORDER_STATUSES).optional(),
      paymentMethod: z.enum(PAYMENT_METHODS).optional(),
      q: z.string().trim().max(80).optional(),
      page,
    })
    .strict(),
  statusUpdate: z
    .object({
      status: z.enum(ORDER_STATUSES),
      note,
      // Manual shipping (when Shiprocket isn't used for this order).
      shipment: z
        .object({
          courier: z.string().trim().max(60).optional(),
          awb: z.string().trim().regex(/^[A-Za-z0-9-]{4,40}$/, "Invalid AWB").optional(),
          trackingUrl: z.string().trim().url().max(300).startsWith("https://", "Use an https link").optional(),
        })
        .strict()
        .optional(),
    })
    .strict(),
  refund: z
    .object({
      amount: z.number().int().min(1).max(10_000_000).optional(),
      note,
      reference: z.string().trim().max(120).optional(),
    })
    .strict(),
  deliverySettings: z
    .object({
      standard: z.object({ fee: paise.max(500000), eta }).strict().partial().optional(),
      freeShippingThreshold: paise.optional(),
      express: z.object({ enabled: z.boolean(), fee: paise.max(500000), eta }).strict().partial().optional(),
      cod: z.object({ enabled: z.boolean(), fee: paise.max(500000), maxOrder: paise }).strict().partial().optional(),
      minOrder: paise.optional(),
      serviceByDefault: z.boolean().optional(),
    })
    .strict(),
  pincodeRule: z
    .object({
      pincode: z.string().trim().regex(/^[1-9][0-9]{2}([0-9]{3})?$/, "Use a 6-digit PIN or a 3-digit region"),
      city: z.string().trim().max(60).optional(),
      state: z.enum(INDIA_STATES).optional(),
      serviceable: z.boolean().optional(),
      codAvailable: z.boolean().optional(),
      standardFee: paise.max(500000).optional(),
      eta: eta.optional(),
      expressAvailable: z.boolean().optional(),
      note: z.string().trim().max(140).optional(),
      isActive: z.boolean().optional(),
    })
    .strict(),
};
schemas.pincodeRuleUpdate = schemas.pincodeRule.partial().strict();

module.exports = { schemas };
