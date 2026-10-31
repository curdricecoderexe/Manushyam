const { z } = require("zod");
const { ROLES } = require("../Models/User");
const { APPEARANCE_SLOTS } = require("../Models/Content");

const objectId = z.string().regex(/^[a-f\d]{24}$/i, "Invalid id");
const page = z.coerce.number().int().min(1).max(1000).default(1);
// "YYYY-MM-DD", read as a day in India time.
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD");
const phone = z.string().trim().regex(/^[6-9]\d{9}$/, "Enter a 10-digit Indian mobile number");

const schemas = {
  idParam: z.object({ id: objectId }).strict(),

  // --- users ---
  usersQuery: z
    .object({
      q: z.string().trim().max(80).optional(),
      role: z.enum(ROLES).optional(),
      status: z.enum(["active", "inactive", "deleted"]).optional(),
      page,
      limit: z.coerce.number().int().min(1).max(100).default(25),
    })
    .strict(),
  userCreate: z
    .object({
      name: z.string().trim().min(2).max(80),
      email: z.string().trim().toLowerCase().email("Enter a valid email").max(254),
      phone: phone.optional(),
      role: z.enum(ROLES).default("customer"),
    })
    .strict(),
  userUpdate: z
    .object({
      name: z.string().trim().min(2).max(80).optional(),
      phone: phone.nullable().optional(),
      role: z.enum(ROLES).optional(),
      isActive: z.boolean().optional(),
    })
    .strict()
    .refine((b) => Object.keys(b).length > 0, "Nothing to update"),
  userDeleteQuery: z.object({ mode: z.enum(["soft", "hard"]).default("soft") }).strict(),

  // --- appearance ---
  slotParam: z.object({ key: z.enum(APPEARANCE_SLOTS) }).strict(),
  slotUpdate: z
    .object({
      url: z
        .string()
        .trim()
        .max(500)
        .refine((u) => /^\/images\/[\w\-./]+$/.test(u) || /^https:\/\/[^\s"'<>]+$/.test(u), "Use an https image URL"),
      alt: z.string().trim().max(160).default(""),
    })
    .strict(),

  // --- PIN rules bulk ---
  pincodeBulk: z
    .object({ ids: z.array(objectId).min(1).max(1000), action: z.enum(["activate", "deactivate", "delete"]) })
    .strict(),

  // --- analytics & exports ---
  rangeQuery: z
    .object({ from: day.optional(), to: day.optional() })
    .strict()
    .refine((r) => !r.from || !r.to || r.from <= r.to, { message: "Start must be on or before the end", path: ["from"] }),
  ordersExportQuery: z
    .object({ from: day.optional(), to: day.optional(), status: z.string().max(40).optional(), paymentMethod: z.enum(["razorpay", "cod"]).optional() })
    .strict(),

  // --- audit log ---
  auditQuery: z
    .object({
      actor: objectId.optional(),
      resource: z.string().trim().max(40).regex(/^[\w-]+$/).optional(),
      resourceId: z.string().trim().max(40).regex(/^[\w-]+$/).optional(),
      action: z.string().trim().max(60).regex(/^[\w.-]+$/).optional(),
      from: day.optional(),
      to: day.optional(),
      page,
    })
    .strict(),
};

module.exports = { schemas };
