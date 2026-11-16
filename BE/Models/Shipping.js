const mongoose = require("mongoose");

const cm = { type: Number, required: true, min: 0.5, max: 300 };
const grams = { type: Number, min: 0, max: 100000, validate: { validator: Number.isInteger, message: "must be whole grams" } };

// A shipping carton the warehouse keeps in stock. Shiprocket bills the higher of the actual weight
// (items + the empty box) and the volumetric weight (L × B × H / 5000), so the box choice matters.
const boxSizeSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 60 },
    code: { type: String, trim: true, uppercase: true, maxlength: 20 },
    lengthCm: cm,
    breadthCm: cm,
    heightCm: cm,
    // Weight of the empty box plus filler/tape, added to the item weight.
    emptyWeightGrams: { ...grams, default: 0 },
    // Fits orders up to this item weight / number of units (empty = no limit).
    maxWeightGrams: grams,
    maxUnits: { type: Number, min: 1, max: 500, validate: { validator: Number.isInteger, message: "must be a whole number" } },
    isActive: { type: Boolean, default: true },
    // Used when no active box fits by weight/units. At most one.
    isDefault: { type: Boolean, default: false },
    notes: { type: String, trim: true, maxlength: 200 },
  },
  { timestamps: true }
);
boxSizeSchema.index({ isDefault: 1 }, { unique: true, partialFilterExpression: { isDefault: true } });
boxSizeSchema.index({ code: 1 }, { unique: true, partialFilterExpression: { code: { $type: "string" } } });

boxSizeSchema.virtual("volumeCm3").get(function volume() {
  return this.lengthCm * this.breadthCm * this.heightCm;
});

boxSizeSchema.methods.toPublic = function toPublic() {
  return {
    id: String(this._id),
    name: this.name,
    code: this.code ?? null,
    lengthCm: this.lengthCm,
    breadthCm: this.breadthCm,
    heightCm: this.heightCm,
    emptyWeightGrams: this.emptyWeightGrams ?? 0,
    maxWeightGrams: this.maxWeightGrams ?? null,
    maxUnits: this.maxUnits ?? null,
    isActive: this.isActive,
    isDefault: this.isDefault,
    notes: this.notes ?? "",
    volumetricWeightGrams: Math.round((this.lengthCm * this.breadthCm * this.heightCm) / 5),
    createdAt: this.createdAt,
    updatedAt: this.updatedAt,
  };
};

// Provider auth tokens shared by every API instance (Shiprocket rate-limits logins).
const providerTokenSchema = new mongoose.Schema({ _id: String, value: { type: String, required: true }, expiresAt: { type: Date, required: true } }, { timestamps: true });

const BoxSize = mongoose.models.BoxSize || mongoose.model("BoxSize", boxSizeSchema);
const ProviderToken = mongoose.models.ProviderToken || mongoose.model("ProviderToken", providerTokenSchema);

module.exports = { BoxSize, ProviderToken };
