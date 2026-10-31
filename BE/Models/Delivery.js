const mongoose = require("mongoose");

const paise = { type: Number, min: 0, max: 500000, validate: { validator: Number.isInteger, message: "must be whole paise" } };
const eta = { _id: false, min: { type: Number, min: 0, max: 30 }, max: { type: Number, min: 0, max: 30 } };

// One document (`_id: "delivery"`) of store-wide delivery and COD rules, editable by admins.
const deliverySettingsSchema = new mongoose.Schema(
  {
    _id: { type: String, default: "delivery" },
    standard: { _id: false, fee: paise, eta },
    // Free standard delivery at or above this order value (0 = no threshold; the standard fee applies, which is 0 at launch).
    freeShippingThreshold: { ...paise, max: 10_000_000 },
    express: { _id: false, enabled: Boolean, fee: paise, eta },
    cod: { _id: false, enabled: Boolean, fee: paise, maxOrder: { ...paise, max: 10_000_000 } },
    minOrder: { ...paise, max: 10_000_000 },
    // Deliver to PIN codes without an explicit rule (Shiprocket still has to cover them when configured).
    serviceByDefault: Boolean,
  },
  { timestamps: true }
);

// Per-PIN overrides. A 6-digit `pincode` matches exactly; a 3-digit one covers a whole postal region.
const pincodeRuleSchema = new mongoose.Schema(
  {
    pincode: { type: String, required: true, unique: true, match: /^[1-9][0-9]{2}([0-9]{3})?$/ },
    city: { type: String, trim: true, maxlength: 60 },
    state: { type: String, trim: true, maxlength: 60 },
    serviceable: { type: Boolean, default: true },
    codAvailable: { type: Boolean, default: true },
    standardFee: paise, // empty = use the store-wide fee
    eta,
    expressAvailable: { type: Boolean, default: true },
    note: { type: String, trim: true, maxlength: 140 },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

pincodeRuleSchema.methods.toAdmin = function toAdmin() {
  const { _id, __v, ...rest } = this.toObject();
  return { id: String(_id), ...rest };
};

const DeliverySettings = mongoose.models.DeliverySettings || mongoose.model("DeliverySettings", deliverySettingsSchema);
const PincodeRule = mongoose.models.PincodeRule || mongoose.model("PincodeRule", pincodeRuleSchema);

// Launch policy: free shipping everywhere, COD up to ₹5,000 with no fee (open item: confirm fee/limit).
const DELIVERY_DEFAULTS = {
  standard: { fee: 0, eta: { min: 3, max: 7 } },
  freeShippingThreshold: 0,
  express: { enabled: false, fee: 9900, eta: { min: 1, max: 3 } },
  cod: { enabled: true, fee: 0, maxOrder: 500000 },
  minOrder: 0,
  serviceByDefault: true,
};

async function getDeliverySettings() {
  const doc = await DeliverySettings.findById("delivery").lean();
  const { _id, __v, createdAt, updatedAt, ...rest } = doc ?? {};
  const merged = { ...DELIVERY_DEFAULTS };
  for (const [k, v] of Object.entries(rest)) {
    if (v === undefined || v === null) continue;
    merged[k] = typeof v === "object" && !Array.isArray(v) ? { ...DELIVERY_DEFAULTS[k], ...v } : v;
  }
  return merged;
}

module.exports = { DeliverySettings, PincodeRule, DELIVERY_DEFAULTS, getDeliverySettings };
