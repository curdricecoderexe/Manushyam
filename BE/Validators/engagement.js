const { z } = require("zod");
const { CONTACT_SUBJECTS } = require("../Models/Engagement");

const objectId = z.string().regex(/^[a-f\d]{24}$/i, "Not found");
const slug = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Use lowercase letters, numbers and hyphens")
  .max(100);
const email = z.string().trim().toLowerCase().email("Enter a valid email address").max(254);
const page = z.coerce.number().int().min(1).max(500).default(1);
// Strip control characters (except newlines/tabs) from free text.
const cleanText = (min, max, message) =>
  z
    .string()
    // eslint-disable-next-line no-control-regex -- deliberately matching control characters to strip them
    .transform((s) => s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").trim())
    .pipe(z.string().min(min, message).max(max, `Keep it under ${max} characters`));
const orderNumber = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^MM\d{6}-[A-Z0-9]{5}$/, "Invalid order");
// Images: https (Cloudinary/CDN) or a site-relative /images/ path.
const imageUrl = z
  .string()
  .trim()
  .max(500)
  .refine((u) => /^https:\/\/[^\s"'<>]+$/.test(u) || /^\/images\/[\w\-./]+$/.test(u), "Use an https image URL or /images/… path");
// Honeypot: real people never see or fill this field.
const honeypot = z.string().max(200).optional();

const rating = z.number().int().min(1, "Choose a rating").max(5);
const reviewTitle = cleanText(0, 80).optional();
const reviewBody = cleanText(10, 1000, "Tell us a little more (at least 10 characters)");

const postFields = {
  slug,
  title: z.string().trim().min(3).max(140),
  excerpt: z.string().trim().max(300).optional(),
  contentHtml: z.string().max(200_000).optional(),
  coverImage: z.object({ url: imageUrl, alt: z.string().trim().max(160).optional() }).strict().optional(),
  category: objectId.nullable().optional(),
  tags: z.array(z.string().trim().toLowerCase().min(1).max(30)).max(10).optional(),
  author: z.object({ name: z.string().trim().min(2).max(60), avatar: imageUrl.optional() }).strict().optional(),
  isFeatured: z.boolean().optional(),
  status: z.enum(["draft", "published"]).optional(),
  publishAt: z.coerce.date().nullable().optional(),
  seo: z.object({ title: z.string().trim().max(70).optional(), description: z.string().trim().max(170).optional() }).strict().optional(),
};

const schemas = {
  idParam: z.object({ id: objectId }).strict(),
  slugParam: z.object({ slug }).strict(),

  // --- reviews ---
  productReviewsQuery: z.object({ page, sort: z.enum(["newest", "highest", "lowest"]).default("newest") }).strict(),
  highlightsQuery: z.object({ limit: z.coerce.number().int().min(1).max(12).default(3) }).strict(),
  reviewCreate: z.object({ orderNumber, productSlug: slug, rating, title: reviewTitle, body: reviewBody }).strict(),
  reviewUpdate: z.object({ rating: rating.optional(), title: reviewTitle, body: reviewBody.optional() }).strict(),
  adminReviewsQuery: z
    .object({ status: z.enum(["published", "hidden"]).optional(), rating: z.coerce.number().int().min(1).max(5).optional(), product: slug.optional(), page })
    .strict(),
  moderate: z.object({ status: z.enum(["published", "hidden"]), note: z.string().trim().max(200).optional() }).strict(),

  // --- blog ---
  postsQuery: z.object({ category: slug.optional(), page, limit: z.coerce.number().int().min(1).max(24).default(8) }).strict(),
  postCreate: z.object(postFields).strict(),
  postUpdate: z.object(postFields).partial().strict(),
  adminPostsQuery: z.object({ status: z.enum(["draft", "published", "scheduled"]).optional(), page }).strict(),
  categoryCreate: z.object({ slug: slug.max(60), name: z.string().trim().min(2).max(60), description: z.string().trim().max(200).optional(), sortOrder: z.number().int().optional() }).strict(),
  categoryUpdate: z
    .object({ slug: slug.max(60), name: z.string().trim().min(2).max(60), description: z.string().trim().max(200).optional(), sortOrder: z.number().int().optional() })
    .partial()
    .strict(),

  // --- newsletter ---
  subscribe: z.object({ email, source: z.enum(["footer", "blog", "article", "other"]).optional(), website: honeypot }).strict(),
  confirm: z.object({ token: z.string().regex(/^[A-Za-z0-9_-]{20,100}$/, "This confirmation link is invalid.") }).strict(),
  unsubscribe: z.object({ e: z.string().regex(/^[A-Za-z0-9_-]{4,400}$/), t: z.string().regex(/^[A-Za-z0-9_-]{20,100}$/) }).strict(),
  subscribersQuery: z.object({ status: z.enum(["pending", "subscribed", "unsubscribed"]).optional(), page }).strict(),

  // --- contact ---
  contact: z
    .object({
      fullName: cleanText(2, 80, "Enter your name"),
      email,
      phone: z
        .string()
        .trim()
        .transform((v) => v.replace(/[\s-]/g, "").replace(/^(\+91|91|0)(?=\d{10}$)/, ""))
        .pipe(z.string().regex(/^[6-9]\d{9}$/, "Enter a valid 10-digit mobile number"))
        .optional(),
      subject: z.enum(CONTACT_SUBJECTS, { errorMap: () => ({ message: "Choose a topic" }) }),
      message: cleanText(10, 2000, "Tell us a little more (at least 10 characters)"),
      website: honeypot,
      turnstileToken: z.string().max(4096).optional(),
    })
    .strict(),
  contactQuery: z.object({ status: z.enum(["new", "read", "replied", "closed"]).optional(), page }).strict(),
  contactUpdate: z.object({ status: z.enum(["new", "read", "replied", "closed"]) }).strict(),
};

module.exports = { schemas };
