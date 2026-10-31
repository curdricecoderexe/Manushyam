const express = require("express");
const ctrl = require("../Controller/authController");
const { validate } = require("../Middleware/validate");
const { requireTrustedOrigin } = require("../Middleware/auth");
const { limiters } = require("../Middleware/rateLimit");
const { schemas } = require("../Validators/auth");

function authRoutes(env) {
  const router = express.Router();
  const authLimit = limiters.auth(env.AUTH_RATE_MAX);
  const otpLimit = limiters.otp(env.OTP_RATE_MAX);

  router.post("/register", authLimit, validate({ body: schemas.registerStart }), ctrl.registerStart);
  router.post("/register/verify", otpLimit, validate({ body: schemas.verify }), ctrl.registerVerify);
  router.post("/login", authLimit, validate({ body: schemas.login }), ctrl.login);
  router.post("/login/verify", otpLimit, validate({ body: schemas.verify }), ctrl.loginVerify);
  router.post("/otp/resend", otpLimit, validate({ body: schemas.resend }), ctrl.resendCode);
  router.post("/password/forgot", authLimit, validate({ body: schemas.forgot }), ctrl.forgotPassword);
  router.post("/password/reset", otpLimit, validate({ body: schemas.reset }), ctrl.resetPassword);

  // Cookie-authenticated: must come from our own site (CSRF defence on top of SameSite=Strict).
  router.post("/refresh", requireTrustedOrigin, ctrl.refresh);
  router.post("/logout", requireTrustedOrigin, ctrl.logout);

  return router;
}

module.exports = { authRoutes };
