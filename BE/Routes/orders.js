const express = require("express");
const ctrl = require("../Controller/orderController");
const { validate } = require("../Middleware/validate");
const { requireAuth } = require("../Middleware/auth");
const { limiter, limiters } = require("../Middleware/rateLimit");
const { schemas } = require("../Validators/orders");

// Order submissions must carry an Idempotency-Key header so retries can't create duplicates.
function idempotencyKey(req, res, next) {
  try {
    req.idempotencyKey = schemas.idempotencyKey.parse(req.get("idempotency-key") ?? "");
    next();
  } catch (err) {
    next(err);
  }
}

function orderRoutes(env) {
  const router = express.Router();
  const auth = requireAuth;
  const write = limiters.write();
  const byNumber = validate({ params: schemas.orderParam });
  const pinLimit = limiter({ name: "delivery-check", windowMs: 60 * 1000, max: 30 });
  const placeLimit = limiter({ name: "place-order", windowMs: 15 * 60 * 1000, max: 20, keyByUser: true });
  // Order number + email lookups are guessable; keep them slow.
  const trackLimit = limiter({ name: "track-order", windowMs: 15 * 60 * 1000, max: 20 });

  router.get("/delivery/check", pinLimit, validate({ query: schemas.deliveryCheck }), ctrl.checkDelivery);
  router.post("/track-order", trackLimit, validate({ body: schemas.track }), ctrl.trackOrder);

  router.post("/checkout/quote", auth, write, validate({ body: schemas.quote }), ctrl.quote);
  router.post("/orders", auth, placeLimit, idempotencyKey, validate({ body: schemas.place }), ctrl.placeOrder);
  router.get("/orders", auth, validate({ query: schemas.listQuery }), ctrl.listOrders);
  router.get("/orders/:orderNumber", auth, byNumber, ctrl.getOrder);
  router.get("/orders/:orderNumber/invoice", auth, byNumber, ctrl.downloadInvoice);
  router.post("/orders/:orderNumber/payment/verify", auth, write, byNumber, validate({ body: schemas.verifyPayment }), ctrl.verifyPayment);
  router.post("/orders/:orderNumber/payment/abandon", auth, write, byNumber, ctrl.abandonPayment);
  router.post("/orders/:orderNumber/cod/confirm", auth, limiters.otp(env.OTP_RATE_MAX), byNumber, validate({ body: schemas.codConfirm }), ctrl.confirmCod);
  router.post("/orders/:orderNumber/cod/resend", auth, limiters.otp(env.OTP_RATE_MAX), byNumber, ctrl.resendCod);
  router.post("/orders/:orderNumber/cancel", auth, write, byNumber, validate({ body: schemas.cancel }), ctrl.cancelOrder);

  return router;
}

module.exports = { orderRoutes };
