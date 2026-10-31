const mongoose = require("mongoose");

// CMS content for the storefront. Everything here is plain text — never HTML — so it is
// rendered escaped by React and cannot carry stored XSS.

const FAQ_TOPICS = ["product", "orders", "payments", "returns", "account"];

const link = { _id: false, label: { type: String, maxlength: 40 }, href: { type: String, maxlength: 200 } };

const heroSlideSchema = new mongoose.Schema(
  {
    eyebrow: { type: String, trim: true, maxlength: 80 },
    title: { type: String, required: true, trim: true, maxlength: 80 },
    subtitle: { type: String, trim: true, maxlength: 200 },
    image: { _id: false, url: { type: String, required: true }, alt: { type: String, default: "" } },
    imagePosition: { type: String, default: "center", maxlength: 30 },
    cta: link,
    secondaryCta: link,
    sortOrder: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
    startsAt: Date,
    endsAt: Date,
  },
  { timestamps: true }
);

const faqSchema = new mongoose.Schema(
  {
    question: { type: String, required: true, trim: true, maxlength: 200 },
    answer: { type: String, required: true, trim: true, maxlength: 2000 },
    topic: { type: String, enum: FAQ_TOPICS, required: true, index: true },
    sortOrder: { type: Number, default: 0 },
    isPublished: { type: Boolean, default: true },
  },
  { timestamps: true }
);

// Policy and other long-form pages (privacy, terms, shipping, returns, cancellation).
const pageSchema = new mongoose.Schema(
  {
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true, maxlength: 60 },
    title: { type: String, required: true, trim: true, maxlength: 100 },
    summary: { type: String, trim: true, maxlength: 300 },
    sections: { type: [{ _id: false, heading: { type: String, maxlength: 120 }, body: { type: String, maxlength: 5000 } }], default: [] },
    kind: { type: String, enum: ["policy", "page"], default: "policy" },
    sortOrder: { type: Number, default: 0 },
    isPublished: { type: Boolean, default: true },
  },
  { timestamps: true }
);

// One document (`_id: "site"`) of storefront settings editable by admins.
const settingsSchema = new mongoose.Schema(
  {
    _id: { type: String, default: "site" },
    announcements: { type: [String], default: [] },
    heroSubline: { type: String, maxlength: 120, default: "" },
    rating: { value: { type: Number, min: 0, max: 5, default: 4.8 }, source: { type: String, maxlength: 60, default: "on Amazon & Flipkart" } },
    trustedBy: { type: String, maxlength: 120, default: "" },
  },
  { timestamps: true }
);

// Admin-replaceable storefront images. Keys are a fixed list; the storefront falls back to its
// bundled image for any slot without an override.
const APPEARANCE_SLOTS = ["authPanel", "homeBestseller", "homeRitual", "aboutHero", "aboutPouch", "aboutLineup", "solutionsKit", "blogHero", "contactHero", "contactPouch"];

const appearanceSchema = new mongoose.Schema(
  {
    _id: { type: String, default: "appearance" },
    slots: {
      type: Map,
      of: new mongoose.Schema({ url: { type: String, required: true, maxlength: 500 }, alt: { type: String, maxlength: 160, default: "" } }, { _id: false }),
      default: {},
    },
  },
  { timestamps: true }
);

function toPublic(doc) {
  const { _id, __v, createdAt, ...rest } = doc.toObject();
  return { id: String(_id), ...rest };
}

const HeroSlide = mongoose.models.HeroSlide || mongoose.model("HeroSlide", heroSlideSchema);
const Faq = mongoose.models.Faq || mongoose.model("Faq", faqSchema);
const Page = mongoose.models.Page || mongoose.model("Page", pageSchema);
const Settings = mongoose.models.Settings || mongoose.model("Settings", settingsSchema);
const Appearance = mongoose.models.Appearance || mongoose.model("Appearance", appearanceSchema);

async function getAppearance() {
  const doc = await Appearance.findById("appearance").lean();
  const slots = {};
  for (const key of APPEARANCE_SLOTS) {
    const v = doc?.slots?.[key];
    if (v?.url) slots[key] = { url: v.url, alt: v.alt ?? "" };
  }
  return slots;
}

const SETTINGS_DEFAULTS = {
  announcements: ["Free Shipping on all orders", "COD Available", "Razorpay Secure Payments", "Shiprocket Shipping"],
  heroSubline: "Fix falling hairs after 3rd application",
  rating: { value: 4.8, source: "on Amazon & Flipkart" },
  trustedBy: "Trusted by 10,000+ customers across India",
};

async function getSettings() {
  const doc = await Settings.findById("site").lean();
  const { _id, __v, createdAt, ...rest } = doc ?? {};
  return { ...SETTINGS_DEFAULTS, ...rest };
}

module.exports = { HeroSlide, Faq, Page, Settings, Appearance, FAQ_TOPICS, APPEARANCE_SLOTS, SETTINGS_DEFAULTS, getSettings, getAppearance, toPublic };
