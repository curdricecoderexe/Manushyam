const mongoose = require("mongoose");

const blogCategorySchema = new mongoose.Schema(
  {
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true, maxlength: 60 },
    name: { type: String, required: true, trim: true, maxlength: 60 },
    description: { type: String, trim: true, maxlength: 200 },
    sortOrder: { type: Number, default: 0 },
  },
  { timestamps: true }
);

// `contentHtml` is sanitized on every write (Services/blog.js) — the only HTML the storefront renders.
const blogPostSchema = new mongoose.Schema(
  {
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true, maxlength: 100 },
    title: { type: String, required: true, trim: true, maxlength: 140 },
    excerpt: { type: String, trim: true, maxlength: 300 },
    contentHtml: { type: String, default: "", maxlength: 100_000 },
    coverImage: { _id: false, url: String, alt: { type: String, default: "" } },
    category: { type: mongoose.Schema.Types.ObjectId, ref: "BlogCategory" },
    tags: { type: [{ type: String, trim: true, lowercase: true, maxlength: 30 }], default: [] },
    author: { _id: false, name: { type: String, default: "ManushyaM Ayurveda Team", maxlength: 60 }, avatar: String },
    isFeatured: { type: Boolean, default: false },
    status: { type: String, enum: ["draft", "published"], default: "draft" },
    // A published post with a future publishAt is scheduled: hidden until then.
    publishAt: { type: Date },
    readMinutes: { type: Number, default: 1 },
    seo: { _id: false, title: { type: String, maxlength: 70 }, description: { type: String, maxlength: 170 } },
  },
  { timestamps: true }
);
blogPostSchema.index({ status: 1, publishAt: -1 });
blogPostSchema.index({ category: 1, status: 1, publishAt: -1 });

// Filter for posts visible on the storefront right now.
function liveFilter(now = new Date()) {
  return { status: "published", publishAt: { $lte: now } };
}

function categoryView(c) {
  return c && c.slug ? { slug: c.slug, name: c.name } : null;
}

blogPostSchema.methods.toCard = function toCard() {
  return {
    id: String(this._id),
    slug: this.slug,
    title: this.title,
    excerpt: this.excerpt ?? "",
    coverImage: this.coverImage?.url ? { url: this.coverImage.url, alt: this.coverImage.alt || "" } : null,
    category: categoryView(this.category),
    author: { name: this.author?.name ?? "ManushyaM Ayurveda Team", avatar: this.author?.avatar ?? null },
    publishedAt: this.publishAt,
    readMinutes: this.readMinutes,
    isFeatured: this.isFeatured,
  };
};

blogPostSchema.methods.toPublic = function toPublic() {
  return {
    ...this.toCard(),
    contentHtml: this.contentHtml,
    tags: this.tags,
    updatedAt: this.updatedAt,
    seo: { title: this.seo?.title || this.title, description: this.seo?.description || this.excerpt || "" },
  };
};

blogPostSchema.methods.toAdmin = function toAdmin() {
  const { _id, __v, category, ...rest } = this.toObject();
  return { id: String(_id), ...rest, category: category?._id ? String(category._id) : category ? String(category) : null };
};

blogCategorySchema.methods.toAdmin = function toAdmin() {
  const { _id, __v, ...rest } = this.toObject();
  return { id: String(_id), ...rest };
};

const BlogCategory = mongoose.models.BlogCategory || mongoose.model("BlogCategory", blogCategorySchema);
const BlogPost = mongoose.models.BlogPost || mongoose.model("BlogPost", blogPostSchema);

module.exports = { BlogCategory, BlogPost, liveFilter };
