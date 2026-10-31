const { z } = require("zod");
const { MAX_LINES, MAX_QTY } = require("../Models/Cart");

const sku = z.string().trim().toUpperCase().regex(/^[A-Z0-9-]{3,40}$/, "Invalid product");
const qty = z.number().int().min(1).max(MAX_QTY, `You can buy up to ${MAX_QTY} of each product`);
const couponCode = z.string().trim().toUpperCase().regex(/^[A-Z0-9_-]{3,30}$/, "Enter a valid code");
const slug = z.string().trim().toLowerCase().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(80);
const paise = z.number().int().min(0).max(10_000_000);
const items = z.array(z.object({ sku, qty }).strict()).max(MAX_LINES);

const couponFields = {
  code: couponCode,
  description: z.string().trim().max(140).optional(),
  type: z.enum(["percent", "flat"]),
  value: z.number().int().min(1),
  maxDiscount: paise.optional(),
  minOrder: paise.optional(),
  startsAt: z.coerce.date().optional(),
  endsAt: z.coerce.date().optional(),
  usageLimit: z.number().int().min(1).max(1_000_000).optional(),
  isActive: z.boolean().optional(),
};

const couponRules = (c, ctx) => {
  if (c.type === "percent" && c.value !== undefined && c.value > 90) ctx.addIssue({ code: "custom", path: ["value"], message: "Use 1–90 for a percentage" });
  if (c.type === "flat" && c.value !== undefined && c.value > 10_000_000) ctx.addIssue({ code: "custom", path: ["value"], message: "Too large" });
  if (c.startsAt && c.endsAt && c.endsAt <= c.startsAt) ctx.addIssue({ code: "custom", path: ["endsAt"], message: "End must be after start" });
};

const schemas = {
  validate: z.object({ items, couponCode: couponCode.optional() }).strict(),
  setItem: z.object({ sku, qty: z.number().int().min(0).max(MAX_QTY) }).strict(),
  skuParam: z.object({ sku }).strict(),
  merge: z.object({ items, couponCode: couponCode.optional() }).strict(),
  coupon: z.object({ code: couponCode }).strict(),
  wishlistAdd: z.object({ slug }).strict(),
  slugParam: z.object({ slug }).strict(),
  couponCreate: z.object(couponFields).strict().superRefine(couponRules),
  // `type` is required alongside `value` so a percentage cap can always be checked.
  couponUpdate: z
    .object(couponFields)
    .partial()
    .strict()
    .superRefine(couponRules)
    .refine((c) => c.value === undefined || c.type !== undefined, { path: ["type"], message: "Send type with value" }),
};

module.exports = { schemas };
