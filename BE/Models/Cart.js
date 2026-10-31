const mongoose = require("mongoose");

const MAX_LINES = 20;
const MAX_QTY = 10;

// Server cart for signed-in customers. It stores only what was chosen (SKU + quantity);
// prices, names and stock are always read fresh from the catalogue when the cart is priced.
const cartSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, unique: true },
    items: {
      type: [
        {
          _id: false,
          sku: { type: String, required: true, uppercase: true, trim: true, maxlength: 40 },
          qty: { type: Number, required: true, min: 1, max: MAX_QTY, validate: Number.isInteger },
          addedAt: { type: Date, default: Date.now },
        },
      ],
      default: [],
      validate: { validator: (v) => v.length <= MAX_LINES, message: `A cart can hold up to ${MAX_LINES} products` },
    },
    couponCode: { type: String, uppercase: true, trim: true, maxlength: 30 },
  },
  { timestamps: true }
);

const wishlistSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, unique: true },
    products: { type: [{ type: mongoose.Schema.Types.ObjectId, ref: "Product" }], default: [] },
  },
  { timestamps: true }
);

const Cart = mongoose.models.Cart || mongoose.model("Cart", cartSchema);
const Wishlist = mongoose.models.Wishlist || mongoose.model("Wishlist", wishlistSchema);

module.exports = { Cart, Wishlist, MAX_LINES, MAX_QTY, MAX_WISHLIST: 50 };
