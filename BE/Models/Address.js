const mongoose = require("mongoose");

const addressSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    label: { type: String, trim: true, maxlength: 20, default: "Home" },
    fullName: { type: String, required: true, trim: true, maxlength: 80 },
    phone: { type: String, required: true, trim: true },
    line1: { type: String, required: true, trim: true, maxlength: 120 },
    line2: { type: String, trim: true, maxlength: 120 },
    landmark: { type: String, trim: true, maxlength: 80 },
    city: { type: String, required: true, trim: true, maxlength: 60 },
    state: { type: String, required: true, trim: true },
    pincode: { type: String, required: true, match: /^[1-9][0-9]{5}$/ },
    isDefault: { type: Boolean, default: false },
  },
  { timestamps: true }
);

addressSchema.methods.toPublic = function toPublic() {
  const { _id, user, __v, ...rest } = this.toObject();
  return { id: _id.toString(), ...rest };
};

const Address = mongoose.models.Address || mongoose.model("Address", addressSchema);

module.exports = { Address, MAX_ADDRESSES: 10 };
