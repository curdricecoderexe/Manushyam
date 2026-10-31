const mongoose = require("mongoose");

// Double opt-in: an address is only mailed newsletters after the owner clicks the confirmation link.
const subscriberSchema = new mongoose.Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true, maxlength: 254 },
    status: { type: String, enum: ["pending", "subscribed", "unsubscribed"], default: "pending", index: true },
    // Only a hash of the emailed confirmation token is kept.
    confirmTokenHash: { type: String, index: { sparse: true } },
    confirmExpiresAt: Date,
    lastSentAt: Date,
    confirmedAt: Date,
    unsubscribedAt: Date,
    source: { type: String, enum: ["footer", "blog", "article", "other"], default: "other" },
  },
  { timestamps: true }
);

const CONTACT_SUBJECTS = ["orders", "payments", "products", "returns", "account", "collaboration", "other"];

const contactMessageSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 80 },
    email: { type: String, required: true, lowercase: true, trim: true, maxlength: 254 },
    phone: { type: String, trim: true, maxlength: 15 },
    subject: { type: String, enum: CONTACT_SUBJECTS, required: true },
    message: { type: String, required: true, trim: true, maxlength: 2000 },
    status: { type: String, enum: ["new", "read", "replied", "closed"], default: "new", index: true },
    userAgent: { type: String, maxlength: 200 },
  },
  { timestamps: true }
);
contactMessageSchema.index({ createdAt: -1 });

contactMessageSchema.methods.toAdmin = function toAdmin() {
  const { _id, __v, ...rest } = this.toObject();
  return { id: String(_id), ...rest };
};

const NewsletterSubscriber = mongoose.models.NewsletterSubscriber || mongoose.model("NewsletterSubscriber", subscriberSchema);
const ContactMessage = mongoose.models.ContactMessage || mongoose.model("ContactMessage", contactMessageSchema);

module.exports = { NewsletterSubscriber, ContactMessage, CONTACT_SUBJECTS };
