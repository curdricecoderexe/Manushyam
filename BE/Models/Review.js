const mongoose = require("mongoose");

// A verified-purchase product review: one per (order, product), written after delivery.
// Text is stored as plain text and always rendered escaped.
const reviewSchema = new mongoose.Schema(
  {
    product: { type: mongoose.Schema.Types.ObjectId, ref: "Product", required: true },
    order: { type: mongoose.Schema.Types.ObjectId, ref: "Order", required: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    // Public display name, e.g. "Priya S." — never the full name or email.
    authorName: { type: String, required: true, trim: true, maxlength: 40 },
    rating: { type: Number, required: true, min: 1, max: 5, validate: Number.isInteger },
    title: { type: String, trim: true, maxlength: 80 },
    body: { type: String, required: true, trim: true, minlength: 10, maxlength: 1000 },
    // Published straight away; admins can hide a review (spam, abuse) or delete it.
    status: { type: String, enum: ["published", "hidden"], default: "published", index: true },
    moderationNote: { type: String, maxlength: 200 },
    moderatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);
reviewSchema.index({ order: 1, product: 1 }, { unique: true });
reviewSchema.index({ product: 1, status: 1, createdAt: -1 });
reviewSchema.index({ status: 1, rating: -1, createdAt: -1 });

reviewSchema.methods.toPublic = function toPublic() {
  return { id: String(this._id), rating: this.rating, title: this.title ?? "", body: this.body, authorName: this.authorName, verified: true, createdAt: this.createdAt };
};

const Review = mongoose.models.Review || mongoose.model("Review", reviewSchema);

module.exports = { Review };
