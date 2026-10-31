const express = require("express");
const ctrl = require("../Controller/cartController");
const { validate } = require("../Middleware/validate");
const { requireAuth, requireRole } = require("../Middleware/auth");
const { limiter, limiters } = require("../Middleware/rateLimit");
const { schemas } = require("../Validators/cart");

function cartRoutes() {
  const router = express.Router();
  const write = limiters.write();
  // Codes are guessable; slow down anyone trying many (per account when signed in, else per IP).
  const couponLimit = limiter({ name: "coupon", windowMs: 15 * 60 * 1000, max: 20, keyByUser: true });
  const validateLimit = limiter({ name: "cart-validate", windowMs: 60 * 1000, max: 60 });
  const auth = requireAuth;

  router.post("/cart/validate", validateLimit, validate({ body: schemas.validate }), (req, res, next) => (req.body.couponCode ? couponLimit(req, res, next) : next()), ctrl.validateCart);

  router.get("/cart", auth, ctrl.getCart);
  router.put("/cart/items", auth, write, validate({ body: schemas.setItem }), ctrl.setItem);
  router.delete("/cart/items/:sku", auth, write, validate({ params: schemas.skuParam }), ctrl.removeItem);
  router.post("/cart/merge", auth, write, validate({ body: schemas.merge }), ctrl.mergeCart);
  router.delete("/cart", auth, write, ctrl.clearCart);
  router.post("/cart/coupon", auth, couponLimit, validate({ body: schemas.coupon }), ctrl.applyCoupon);
  router.delete("/cart/coupon", auth, write, ctrl.removeCoupon);

  router.get("/wishlist", auth, ctrl.getWishlist);
  router.post("/wishlist", auth, write, validate({ body: schemas.wishlistAdd }), ctrl.addToWishlist);
  router.delete("/wishlist/:slug", auth, write, validate({ params: schemas.slugParam }), ctrl.removeFromWishlist);

  // Coupons are admin-only (staff can't create discounts — PLAN.md M8).
  const admin = [requireAuth, requireRole("admin")];
  const byId = validate({ params: require("../Validators/catalog").schemas.idParam });
  router.get("/admin/coupons", ...admin, ctrl.listCoupons);
  router.post("/admin/coupons", ...admin, write, validate({ body: schemas.couponCreate }), ctrl.createCoupon);
  router.patch("/admin/coupons/:id", ...admin, write, byId, validate({ body: schemas.couponUpdate }), ctrl.updateCoupon);
  router.delete("/admin/coupons/:id", ...admin, write, byId, ctrl.deactivateCoupon);

  return router;
}

module.exports = { cartRoutes };
