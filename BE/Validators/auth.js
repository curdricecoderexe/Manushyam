const { z } = require("zod");
const { INDIA_STATES } = require("../Data/indiaStates");

const email = z.string().trim().toLowerCase().email("Enter a valid email address").max(254);
const password = z
  .string()
  .min(8, "Use at least 8 characters")
  .max(128, "Use at most 128 characters")
  .regex(/[A-Za-z]/, "Include at least one letter")
  .regex(/[0-9]/, "Include at least one number");
const name = z.string().trim().min(2, "Enter your name").max(80);
const code = z.string().trim().regex(/^\d{6}$/, "Enter the 6-digit code");
const challengeId = z.string().uuid();
// Indian mobile numbers, stored as 10 digits.
const phone = z
  .string()
  .trim()
  .transform((v) => v.replace(/[\s-]/g, "").replace(/^(\+91|91|0)(?=\d{10}$)/, ""))
  .pipe(z.string().regex(/^[6-9]\d{9}$/, "Enter a valid 10-digit mobile number"));

const schemas = {
  registerStart: z.object({ name, email, password }).strict(),
  verify: z.object({ challengeId, code }).strict(),
  login: z.object({ email, password: z.string().min(1).max(128) }).strict(),
  resend: z.object({ challengeId }).strict(),
  forgot: z.object({ email }).strict(),
  reset: z.object({ email, code, password }).strict(),
  updateMe: z.object({ name: name.optional(), phone: phone.optional() }).strict(),
  changePassword: z.object({ currentPassword: z.string().min(1).max(128), newPassword: password }).strict(),
  deleteAccount: z.object({ password: z.string().min(1, "Enter your password").max(128), confirm: z.literal("DELETE", { errorMap: () => ({ message: "Type DELETE to confirm" }) }) }).strict(),
  address: z
    .object({
      label: z.string().trim().max(20).optional(),
      fullName: name,
      phone,
      line1: z.string().trim().min(3, "Enter house / street").max(120),
      line2: z.string().trim().max(120).optional(),
      landmark: z.string().trim().max(80).optional(),
      city: z.string().trim().min(2, "Enter a city").max(60),
      state: z.enum(INDIA_STATES, { errorMap: () => ({ message: "Choose a state" }) }),
      pincode: z.string().trim().regex(/^[1-9][0-9]{5}$/, "Enter a valid 6-digit PIN code"),
      isDefault: z.boolean().optional(),
    })
    .strict(),
  idParam: z.object({ id: z.string().regex(/^[a-f\d]{24}$/i, "Not found") }).strict(),
};

module.exports = { schemas };
