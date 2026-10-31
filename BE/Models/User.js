const mongoose = require("mongoose");

const ROLES = ["customer", "staff", "admin"];

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 80 },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true, maxlength: 254 },
    phone: { type: String, trim: true, maxlength: 15 },
    passwordHash: { type: String, required: true, select: false },
    role: { type: String, enum: ROLES, default: "customer", index: true },
    isActive: { type: Boolean, default: true },
    emailVerifiedAt: { type: Date },
    // Bumped on password change / "sign out everywhere"; access tokens carrying an older value are rejected.
    tokenVersion: { type: Number, default: 0 },
    failedLoginCount: { type: Number, default: 0, select: false },
    lockUntil: { type: Date, select: false },
    lastLoginAt: { type: Date },
    deletedAt: { type: Date },
    // Set when the customer deleted their own account but GST orders had to be kept (DPDP erasure):
    // name/email/phone are replaced and the account can never be restored.
    anonymizedAt: { type: Date },
  },
  { timestamps: true }
);

userSchema.methods.toPublic = function toPublic() {
  return {
    id: this._id.toString(),
    name: this.name,
    email: this.email,
    phone: this.phone ?? null,
    role: this.role,
    emailVerified: Boolean(this.emailVerifiedAt),
    createdAt: this.createdAt,
  };
};

const User = mongoose.models.User || mongoose.model("User", userSchema);

module.exports = { User, ROLES };
