const mongoose = require("mongoose");

const NOTIFICATION_TYPES = ["order", "payment", "refund", "chat", "review", "system"];

// An in-app notification for one user (the bell). Old ones expire after 90 days.
const notificationSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    type: { type: String, enum: NOTIFICATION_TYPES, required: true },
    title: { type: String, required: true, maxlength: 120 },
    body: { type: String, maxlength: 300 },
    // Site-relative path only (e.g. /account/orders/MM…); never an external URL.
    link: { type: String, maxlength: 200, match: /^\/[\w\-./?=&#%]*$/ },
    readAt: Date,
    createdAt: { type: Date, default: Date.now },
  },
  { versionKey: false }
);
notificationSchema.index({ user: 1, createdAt: -1 });
notificationSchema.index({ user: 1, readAt: 1 });
notificationSchema.index({ createdAt: 1 }, { expireAfterSeconds: 90 * 24 * 3600 });

notificationSchema.methods.toPublic = function toPublic() {
  return { id: String(this._id), type: this.type, title: this.title, body: this.body ?? "", link: this.link ?? null, read: Boolean(this.readAt), createdAt: this.createdAt };
};

const Notification = mongoose.models.Notification || mongoose.model("Notification", notificationSchema);

module.exports = { Notification, NOTIFICATION_TYPES };
