const express = require("express");
const ctrl = require("../Controller/accountController");
const privacy = require("../Controller/privacyController");
const { validate } = require("../Middleware/validate");
const { requireAuth } = require("../Middleware/auth");
const { limiters } = require("../Middleware/rateLimit");
const { schemas } = require("../Validators/auth");

function accountRoutes(env) {
  const router = express.Router();
  const write = limiters.write();
  const byId = validate({ params: schemas.idParam });
  // requireAuth is attached per route (not router.use) so unknown /api paths still 404.
  const auth = requireAuth;

  router.get("/me", auth, ctrl.getMe);
  router.patch("/me", auth, write, validate({ body: schemas.updateMe }), ctrl.updateMe);
  router.post("/me/password", auth, limiters.auth(env.AUTH_RATE_MAX), validate({ body: schemas.changePassword }), ctrl.changePassword);
  router.post("/me/logout-all", auth, write, ctrl.logoutEverywhere);

  // DPDP: download my data / delete my account.
  router.get("/me/data-export", auth, limiters.privacy(), privacy.downloadMyData);
  router.post("/me/delete", auth, limiters.auth(env.AUTH_RATE_MAX), validate({ body: schemas.deleteAccount }), privacy.deleteMyAccount);

  router.get("/addresses", auth, ctrl.listAddresses);
  router.post("/addresses", auth, write, validate({ body: schemas.address }), ctrl.createAddress);
  router.put("/addresses/:id", auth, write, byId, validate({ body: schemas.address }), ctrl.updateAddress);
  router.patch("/addresses/:id/default", auth, write, byId, ctrl.setDefaultAddress);
  router.delete("/addresses/:id", auth, write, byId, ctrl.deleteAddress);

  return router;
}

module.exports = { accountRoutes };
