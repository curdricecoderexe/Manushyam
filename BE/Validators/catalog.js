const { z } = require("zod");
const { AUDIENCES, PRODUCT_TYPES, CONCERNS, FREE_FROM, STATUSES } = require("../Models/Product");
const { FAQ_TOPICS } = require("../Models/Content");
const { SORTS } = require("../Services/search");

const slug = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Use lowercase letters, numbers and hyphens")
  .max(80);
const objectId = z.string().regex(/^[a-f\d]{24}$/i, "Invalid id");
const text = (max) => z.string().trim().max(max);
const paise = z.number().int("Use whole paise").min(0).max(10_000_000);

// Images must be https (Cloudinary/CDN) or a site-relative /images/ path. Blocks javascript:/data: URLs.
const imageUrl = z
  .string()
  .trim()
  .max(500)
  .refine((u) => /^\/images\/[\w\-./]+$/.test(u) || /^https:\/\/[^\s"'<>]+$/.test(u), "Use an https image URL");
const image = z.object({ url: imageUrl, alt: text(160).default("") }).strict();
// Internal links (/solutions?for=men) or https URLs only.
const href = z
  .string()
  .trim()
  .max(200)
  .refine((u) => /^\/(?!\/)[^\s]*$/.test(u) || /^https:\/\/[^\s"'<>]+$/.test(u), "Use a site path like /solutions or an https URL");

// Comma-separated query values: ?type=therapy,combo
const csvEnum = (values) =>
  z
    .string()
    .max(200)
    .transform((s) => [...new Set(s.split(",").map((v) => v.trim()).filter(Boolean))])
    .pipe(z.array(z.enum(values)).max(values.length));

const variant = z
  .object({
    sku: z.string().trim().toUpperCase().regex(/^[A-Z0-9-]{3,40}$/, "SKU: 3–40 letters, numbers or hyphens"),
    label: text(80).min(1),
    price: paise,
    mrp: paise.optional(),
    stock: z.number().int().min(0).max(1_000_000),
    isDefault: z.boolean().optional(),
    weightGrams: z.number().min(0).max(50_000).optional(),
  })
  .strict()
  .refine((v) => v.mrp === undefined || v.mrp >= v.price, { message: "MRP can’t be below the price", path: ["mrp"] });

const productFields = {
  slug,
  name: text(120).min(2),
  tagline: text(120).optional(),
  summary: text(240).optional(),
  description: z.array(text(2000)).max(12).optional(),
  audience: z.enum(AUDIENCES),
  type: z.enum(PRODUCT_TYPES),
  concerns: z.array(z.enum(CONCERNS)).max(CONCERNS.length).optional(),
  badges: z.array(text(24).min(1)).max(4).optional(),
  images: z.array(image).max(10).optional(),
  variants: z
    .array(variant)
    .min(1, "Add at least one variant")
    .max(20)
    .refine((vs) => new Set(vs.map((v) => v.sku)).size === vs.length, "SKUs must be unique")
    .refine((vs) => vs.filter((v) => v.isDefault).length <= 1, "Only one default variant"),
  benefits: z.array(text(120).min(1)).max(10).optional(),
  ingredients: z
    .object({ extracts: z.array(text(60)).max(20).optional(), oils: z.array(text(60)).max(20).optional(), support: z.array(text(60)).max(30).optional() })
    .strict()
    .optional(),
  howToUse: z.array(text(400)).max(10).optional(),
  freeFrom: z.array(z.enum(FREE_FROM)).max(FREE_FROM.length).optional(),
  faqs: z.array(z.object({ q: text(200).min(3), a: text(1000).min(1) }).strict()).max(20).optional(),
  related: z.array(objectId).max(8).optional(),
  keywords: z.array(text(40).min(1)).max(20).optional(),
  seo: z.object({ title: text(70).optional(), description: text(160).optional() }).strict().optional(),
  status: z.enum(STATUSES).optional(),
  sortOrder: z.number().int().min(-1000).max(1000).optional(),
  internal: z.object({ costPrice: paise.optional(), supplier: text(120).optional(), notes: text(2000).optional() }).strict().optional(),
};

const heroSlide = z
  .object({
    eyebrow: text(80).optional(),
    title: text(80).min(2),
    subtitle: text(200).optional(),
    image,
    imagePosition: z.enum(["center", "center top", "center bottom", "left", "right"]).optional(),
    cta: z.object({ label: text(40).min(1), href }).strict().optional(),
    secondaryCta: z.object({ label: text(40).min(1), href }).strict().optional(),
    sortOrder: z.number().int().min(-1000).max(1000).optional(),
    isActive: z.boolean().optional(),
    startsAt: z.coerce.date().optional(),
    endsAt: z.coerce.date().optional(),
  })
  .strict();

const faq = z
  .object({
    question: text(200).min(5),
    answer: text(2000).min(2),
    topic: z.enum(FAQ_TOPICS),
    sortOrder: z.number().int().min(-1000).max(1000).optional(),
    isPublished: z.boolean().optional(),
  })
  .strict();

const page = z
  .object({
    slug,
    title: text(100).min(2),
    summary: text(300).optional(),
    sections: z.array(z.object({ heading: text(120).min(1), body: text(5000).min(1) }).strict()).max(40),
    kind: z.enum(["policy", "page"]).optional(),
    sortOrder: z.number().int().min(-1000).max(1000).optional(),
    isPublished: z.boolean().optional(),
  })
  .strict();

const settings = z
  .object({
    announcements: z.array(text(60).min(1)).max(6).optional(),
    heroSubline: text(120).optional(),
    rating: z.object({ value: z.number().min(0).max(5), source: text(60) }).strict().optional(),
    trustedBy: text(120).optional(),
  })
  .strict();

const schemas = {
  listQuery: z
    .object({
      q: text(80).optional(),
      for: z.enum(AUDIENCES).optional(),
      type: csvEnum(PRODUCT_TYPES).optional(),
      concern: csvEnum(CONCERNS).optional(),
      slugs: z
        .string()
        .max(800)
        .transform((s) => s.split(",").map((v) => v.trim()).filter(Boolean))
        .pipe(z.array(slug).max(12))
        .optional(),
      minPrice: z.coerce.number().int().min(0).optional(),
      maxPrice: z.coerce.number().int().min(0).optional(),
      inStock: z.enum(["true", "false"]).transform((v) => v === "true").optional(),
      sort: z.enum(Object.keys(SORTS)).default("recommended"),
      page: z.coerce.number().int().min(1).max(500).default(1),
      limit: z.coerce.number().int().min(1).max(48).default(24),
    })
    .strict(),
  suggestQuery: z.object({ q: text(60).min(2) }).strict(),
  slugParam: z.object({ slug }).strict(),
  idParam: z.object({ id: objectId }).strict(),
  adminListQuery: z
    .object({
      status: z.enum(STATUSES).optional(),
      q: text(80).optional(),
      page: z.coerce.number().int().min(1).max(500).default(1),
      limit: z.coerce.number().int().min(1).max(100).default(50),
    })
    .strict(),
  productCreate: z.object(productFields).strict(),
  productUpdate: z
    .object(productFields)
    .partial()
    .strict()
    .refine((b) => Object.keys(b).length > 0, "Nothing to update"),
  stockUpdate: z.object({ sku: variant.innerType().shape.sku, stock: z.number().int().min(0).max(1_000_000) }).strict(),
  heroSlide,
  heroSlideUpdate: heroSlide.partial().strict(),
  faq,
  faqUpdate: faq.partial().strict(),
  page,
  pageUpdate: page.partial().strict(),
  settings,
};

module.exports = { schemas };
