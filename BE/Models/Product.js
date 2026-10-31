const mongoose = require("mongoose");

const AUDIENCES = ["men", "women", "unisex"];
const PRODUCT_TYPES = ["therapy", "combo", "oil", "shampoo"];
const CONCERNS = ["hair-fall", "weak-roots", "thinning", "dandruff", "dht"];
const FREE_FROM = ["ayurvedic", "paraben", "sulfate", "silicone", "cruelty", "all-hair-types"];
const STATUSES = ["draft", "published", "archived"];

// Money is stored as integer paise everywhere (₹499 → 49900).
const paise = { type: Number, min: 0, validate: { validator: Number.isInteger, message: "must be whole paise" } };

const variantSchema = new mongoose.Schema(
  {
    sku: { type: String, required: true, trim: true, uppercase: true, maxlength: 40 },
    label: { type: String, required: true, trim: true, maxlength: 80 },
    price: { ...paise, required: true },
    mrp: paise,
    stock: { type: Number, required: true, min: 0, default: 0, validate: Number.isInteger },
    isDefault: { type: Boolean, default: false },
    weightGrams: { type: Number, min: 0 },
  },
  { _id: false }
);

const productSchema = new mongoose.Schema(
  {
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true, maxlength: 80 },
    name: { type: String, required: true, trim: true, maxlength: 120 },
    tagline: { type: String, trim: true, maxlength: 120 },
    summary: { type: String, trim: true, maxlength: 240 },
    description: { type: [String], default: [] },
    audience: { type: String, enum: AUDIENCES, required: true },
    type: { type: String, enum: PRODUCT_TYPES, required: true },
    concerns: { type: [{ type: String, enum: CONCERNS }], default: [] },
    badges: { type: [String], default: [] },
    images: { type: [{ _id: false, url: { type: String, required: true }, alt: { type: String, default: "" } }], default: [] },
    variants: {
      type: [variantSchema],
      validate: { validator: (v) => v.length > 0, message: "needs at least one variant" },
    },
    benefits: { type: [String], default: [] },
    ingredients: {
      extracts: { type: [String], default: [] },
      oils: { type: [String], default: [] },
      support: { type: [String], default: [] },
    },
    howToUse: { type: [String], default: [] },
    freeFrom: { type: [{ type: String, enum: FREE_FROM }], default: [] },
    faqs: { type: [{ _id: false, q: String, a: String }], default: [] },
    related: { type: [{ type: mongoose.Schema.Types.ObjectId, ref: "Product" }], default: [] },
    keywords: { type: [String], default: [] },
    seo: { title: String, description: String },
    status: { type: String, enum: STATUSES, default: "draft", index: true },
    sortOrder: { type: Number, default: 0 },
    popularity: { type: Number, default: 0 },
    rating: { average: { type: Number, default: 0 }, count: { type: Number, default: 0 } },
    // Derived from variants on save so listing filters/sorts can use an index.
    priceFrom: { type: Number, default: 0 },
    inStock: { type: Boolean, default: false },
    // Business-only data; never returned by public reads.
    internal: {
      type: new mongoose.Schema({ costPrice: paise, supplier: { type: String, maxlength: 120 }, notes: { type: String, maxlength: 2000 } }, { _id: false }),
      select: false,
    },
  },
  { timestamps: true }
);

productSchema.index({ status: 1, sortOrder: 1 });
productSchema.index({ status: 1, audience: 1, type: 1, priceFrom: 1 });
productSchema.index({ "variants.sku": 1 }, { unique: true });
productSchema.index(
  { name: "text", tagline: "text", summary: "text", keywords: "text", "ingredients.extracts": "text", "ingredients.oils": "text" },
  { name: "product_text", weights: { name: 10, keywords: 6, tagline: 4, summary: 2, "ingredients.extracts": 2, "ingredients.oils": 2 } }
);

productSchema.pre("validate", function deriveListingFields() {
  if (this.variants?.length) {
    if (!this.variants.some((v) => v.isDefault)) this.variants[0].isDefault = true;
    this.priceFrom = Math.min(...this.variants.map((v) => v.price));
    this.inStock = this.variants.some((v) => v.stock > 0);
  }
});

function publicImage(img) {
  return { url: img.url, alt: img.alt || "" };
}

// Card-sized shape for listings, menus and autocomplete.
productSchema.methods.toCard = function toCard() {
  const variant = this.variants.find((v) => v.isDefault) || this.variants[0];
  return {
    id: this._id.toString(),
    slug: this.slug,
    name: this.name,
    tagline: this.tagline ?? "",
    summary: this.summary ?? "",
    audience: this.audience,
    type: this.type,
    badges: this.badges,
    image: this.images[0] ? publicImage(this.images[0]) : null,
    price: this.priceFrom,
    mrp: variant?.mrp ?? null,
    inStock: this.inStock,
    defaultSku: variant?.sku ?? null,
    rating: this.rating,
  };
};

productSchema.methods.toPublic = function toPublic() {
  return {
    ...this.toCard(),
    description: this.description,
    concerns: this.concerns,
    images: this.images.map(publicImage),
    // Stock counts stay private; customers only see whether a variant can be bought.
    variants: this.variants.map((v) => ({ sku: v.sku, label: v.label, price: v.price, mrp: v.mrp ?? null, inStock: v.stock > 0, isDefault: v.isDefault })),
    benefits: this.benefits,
    ingredients: this.ingredients,
    howToUse: this.howToUse,
    freeFrom: this.freeFrom,
    faqs: this.faqs,
    seo: { title: this.seo?.title || this.name, description: this.seo?.description || this.summary || "" },
  };
};

// Staff/admin view: everything except `internal`, which only admins get (added by the controller).
productSchema.methods.toAdmin = function toAdmin({ includeInternal = false } = {}) {
  const obj = this.toObject({ versionKey: false });
  const { _id, internal, ...rest } = obj;
  return {
    id: _id.toString(),
    ...rest,
    related: (rest.related || []).map(String),
    ...(includeInternal ? { internal: internal ?? {} } : {}),
  };
};

const Product = mongoose.models.Product || mongoose.model("Product", productSchema);

module.exports = { Product, AUDIENCES, PRODUCT_TYPES, CONCERNS, FREE_FROM, STATUSES };
