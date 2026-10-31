const mongoose = require("mongoose");

const paise = { type: Number, min: 0, validate: { validator: Number.isInteger, message: "must be whole paise" } };

const couponSchema = new mongoose.Schema(
  {
    code: { type: String, required: true, unique: true, uppercase: true, trim: true, maxlength: 30 },
    description: { type: String, trim: true, maxlength: 140 },
    // percent: value is 1–90 (%); flat: value is paise off.
    type: { type: String, enum: ["percent", "flat"], required: true },
    value: { type: Number, required: true, min: 1, validate: Number.isInteger },
    maxDiscount: paise, // cap for percentage coupons
    minOrder: { ...paise, default: 0 },
    startsAt: Date,
    endsAt: Date,
    usageLimit: { type: Number, min: 1, validate: Number.isInteger }, // total uses; empty = unlimited
    // Counts pending + confirmed redemptions; changed only with atomic $inc so the cap can't be overshot.
    usedCount: { type: Number, default: 0, min: 0 },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

// One use per customer. `active` is true while a redemption is pending or confirmed and removed
// when it is released, so the partial unique index blocks a second concurrent or later use.
const redemptionSchema = new mongoose.Schema(
  {
    coupon: { type: mongoose.Schema.Types.ObjectId, ref: "Coupon", required: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    order: { type: mongoose.Schema.Types.ObjectId, ref: "Order" },
    status: { type: String, enum: ["pending", "confirmed", "released"], default: "pending", index: true },
    active: { type: Boolean, default: true },
    discount: { ...paise, required: true },
    // A pending redemption that is never confirmed (abandoned payment) is released after this.
    expiresAt: { type: Date, index: true },
  },
  { timestamps: true }
);
redemptionSchema.index({ coupon: 1, user: 1 }, { unique: true, partialFilterExpression: { active: true } });

couponSchema.methods.toAdmin = function toAdmin() {
  const { _id, __v, ...rest } = this.toObject();
  return { id: String(_id), ...rest };
};

const Coupon = mongoose.models.Coupon || mongoose.model("Coupon", couponSchema);
const CouponRedemption = mongoose.models.CouponRedemption || mongoose.model("CouponRedemption", redemptionSchema);

module.exports = { Coupon, CouponRedemption };
