const { Cart, Wishlist, MAX_LINES, MAX_QTY, MAX_WISHLIST } = require("../Models/Cart");
const { Product } = require("../Models/Product");
const { Coupon, CouponRedemption } = require("../Models/Coupon");
const { priceCart, normaliseItems } = require("../Services/pricing");
const { audit } = require("../Services/audit");
const { AppError } = require("../Utils/AppError");

// --- Pricing (guests and signed-in) ------------------------------------------------------------

// Guests keep their cart in the browser; this re-prices it and re-checks stock on the server.
async function validateCart(req, res) {
  res.set("Cache-Control", "no-store");
  res.json({ cart: await priceCart({ items: req.body.items, couponCode: req.body.couponCode, userId: req.user?.id }) });
}

// --- Server cart (every query is scoped to req.user) -------------------------------------------

async function loadCart(userId) {
  return (await Cart.findOne({ user: userId })) ?? new Cart({ user: userId, items: [] });
}

// Prices the cart, drops lines that no longer exist, saves adjustments and returns the priced view.
// An invalid coupon is kept out of the cart so it isn't re-checked forever.
async function respond(res, cart, userId, status = 200) {
  const priced = await priceCart({ items: cart.items, couponCode: cart.couponCode, userId });
  const changed = JSON.stringify(priced.items) !== JSON.stringify(cart.items.map((i) => ({ sku: i.sku, qty: i.qty })));
  if (changed) {
    const addedAt = new Map(cart.items.map((i) => [i.sku, i.addedAt]));
    cart.items = priced.items.map((i) => ({ ...i, addedAt: addedAt.get(i.sku) }));
  }
  if (priced.coupon && !priced.coupon.applied && ["INVALID", "EXPIRED", "USED_UP", "ALREADY_USED"].includes(priced.coupon.reason)) cart.couponCode = undefined;
  if (cart.isNew || cart.isModified()) await cart.save();
  res.status(status).json({ cart: priced });
}

async function getCart(req, res) {
  await respond(res, await loadCart(req.user.id), req.user.id);
}

// Sets one line's quantity (0 removes it).
async function setItem(req, res) {
  const { sku, qty } = req.body;
  const cart = await loadCart(req.user.id);
  const line = cart.items.find((i) => i.sku === sku);
  if (qty === 0) {
    cart.items = cart.items.filter((i) => i.sku !== sku);
  } else if (line) {
    line.qty = qty;
  } else {
    if (cart.items.length >= MAX_LINES) throw AppError.badRequest(`Your cart can hold up to ${MAX_LINES} products.`);
    if (!(await Product.exists({ "variants.sku": sku, status: "published" }))) throw AppError.notFound("Product not found");
    cart.items.push({ sku, qty });
  }
  await respond(res, cart, req.user.id);
}

async function removeItem(req, res) {
  const cart = await loadCart(req.user.id);
  cart.items = cart.items.filter((i) => i.sku !== req.params.sku);
  await respond(res, cart, req.user.id);
}

// After sign-in: fold the guest cart into the account cart (quantities add up, capped at 10).
async function mergeCart(req, res) {
  const cart = await loadCart(req.user.id);
  const merged = normaliseItems([...cart.items.map((i) => ({ sku: i.sku, qty: i.qty })), ...req.body.items]);
  const addedAt = new Map(cart.items.map((i) => [i.sku, i.addedAt]));
  cart.items = merged.map((i) => ({ ...i, qty: Math.min(MAX_QTY, i.qty), addedAt: addedAt.get(i.sku) }));
  if (req.body.couponCode && !cart.couponCode) cart.couponCode = req.body.couponCode;
  await respond(res, cart, req.user.id);
}

async function clearCart(req, res) {
  await Cart.updateOne({ user: req.user.id }, { $set: { items: [] }, $unset: { couponCode: "" } });
  res.status(204).end();
}

async function applyCoupon(req, res) {
  const cart = await loadCart(req.user.id);
  const priced = await priceCart({ items: cart.items, couponCode: req.body.code, userId: req.user.id });
  if (!priced.coupon.applied) {
    throw new AppError(400, `COUPON_${priced.coupon.reason}`, priced.coupon.message, [{ path: "code", message: priced.coupon.message }]);
  }
  cart.couponCode = req.body.code;
  await respond(res, cart, req.user.id);
}

async function removeCoupon(req, res) {
  const cart = await loadCart(req.user.id);
  cart.couponCode = undefined;
  await respond(res, cart, req.user.id);
}

// --- Wishlist ----------------------------------------------------------------------------------

async function wishlistView(userId) {
  const list = await Wishlist.findOne({ user: userId });
  if (!list?.products.length) return [];
  const products = await Product.find({ _id: { $in: list.products }, status: "published" });
  const order = new Map(list.products.map((id, i) => [String(id), i]));
  return products
    .sort((a, b) => order.get(String(b._id)) - order.get(String(a._id))) // newest saved first
    .map((p) => {
      const variant = p.variants.find((v) => v.isDefault) || p.variants[0];
      return { ...p.toCard(), lowStock: variant.stock > 0 && variant.stock <= 5 ? variant.stock : null };
    });
}

async function getWishlist(req, res) {
  res.json({ products: await wishlistView(req.user.id) });
}

async function addToWishlist(req, res) {
  const product = await Product.findOne({ slug: req.body.slug, status: "published" }).select("_id");
  if (!product) throw AppError.notFound("Product not found");
  const list = (await Wishlist.findOne({ user: req.user.id })) ?? new Wishlist({ user: req.user.id });
  if (!list.products.some((id) => id.equals(product._id))) {
    if (list.products.length >= MAX_WISHLIST) throw AppError.badRequest(`You can save up to ${MAX_WISHLIST} products.`);
    list.products.push(product._id);
    await list.save();
  }
  res.status(201).json({ products: await wishlistView(req.user.id) });
}

async function removeFromWishlist(req, res) {
  const product = await Product.findOne({ slug: req.params.slug }).select("_id");
  if (product) await Wishlist.updateOne({ user: req.user.id }, { $pull: { products: product._id } });
  res.json({ products: await wishlistView(req.user.id) });
}

// --- Admin: coupons ----------------------------------------------------------------------------

async function listCoupons(req, res) {
  const coupons = await Coupon.find().sort({ createdAt: -1 });
  const confirmed = await CouponRedemption.aggregate([{ $match: { status: "confirmed" } }, { $group: { _id: "$coupon", n: { $sum: 1 }, discount: { $sum: "$discount" } } }]);
  const stats = new Map(confirmed.map((c) => [String(c._id), c]));
  res.json({
    coupons: coupons.map((c) => ({ ...c.toAdmin(), confirmedUses: stats.get(String(c._id))?.n ?? 0, totalDiscount: stats.get(String(c._id))?.discount ?? 0 })),
  });
}

async function createCoupon(req, res) {
  try {
    const coupon = await Coupon.create(req.body);
    audit(req, { action: "coupon.create", resourceId: coupon._id, after: coupon, summary: coupon.code });
    res.status(201).json({ coupon: coupon.toAdmin() });
  } catch (err) {
    if (err?.code === 11000) throw new AppError(409, "CONFLICT", "That code already exists", [{ path: "code", message: "Already in use" }]);
    throw err;
  }
}

async function updateCoupon(req, res) {
  const coupon = await Coupon.findById(req.params.id);
  if (!coupon) throw AppError.notFound("Coupon not found");
  // usedCount is never editable; code changes would orphan the shoppers' carts, so they're blocked too.
  if (req.body.code && req.body.code !== coupon.code) throw AppError.badRequest("Codes can’t be renamed — create a new coupon instead", [{ path: "code", message: "Can’t be changed" }]);
  const before = coupon.toObject();
  coupon.set(req.body);
  await coupon.save();
  audit(req, { action: "coupon.update", resourceId: coupon._id, before, after: coupon, summary: coupon.code });
  res.json({ coupon: coupon.toAdmin() });
}

// A coupon nobody has used is deleted; a used one is only deactivated so past orders keep their reference.
async function deactivateCoupon(req, res) {
  const coupon = await Coupon.findById(req.params.id);
  if (!coupon) throw AppError.notFound("Coupon not found");
  const used = coupon.usedCount > 0 || (await CouponRedemption.exists({ coupon: coupon._id }));
  if (used) {
    await Coupon.updateOne({ _id: coupon._id }, { $set: { isActive: false } });
    audit(req, { action: "coupon.deactivate", resourceId: coupon._id, before: { isActive: coupon.isActive }, after: { isActive: false }, summary: coupon.code });
  } else {
    await Coupon.deleteOne({ _id: coupon._id });
    audit(req, { action: "coupon.delete", resourceId: coupon._id, before: coupon, summary: coupon.code });
  }
  res.json({ deleted: !used });
}

module.exports = {
  validateCart,
  getCart,
  setItem,
  removeItem,
  mergeCart,
  clearCart,
  applyCoupon,
  removeCoupon,
  getWishlist,
  addToWishlist,
  removeFromWishlist,
  listCoupons,
  createCoupon,
  updateCoupon,
  deactivateCoupon,
};
