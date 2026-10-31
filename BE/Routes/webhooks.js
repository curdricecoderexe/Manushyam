const express = require("express");
const ctrl = require("../Controller/webhookController");
const { limiter } = require("../Middleware/rateLimit");

// Mounted before express.json(): signatures are computed over the exact raw bytes.
// Note: Shiprocket rejects webhook URLs containing "shiprocket", hence /shipping.
function webhookRoutes() {
  const router = express.Router();
  const raw = express.raw({ type: "*/*", limit: "1mb" });
  const hookLimit = limiter({ name: "webhooks", windowMs: 60 * 1000, max: 600 });
  router.post("/razorpay", hookLimit, raw, ctrl.razorpay);
  router.post("/shipping", hookLimit, raw, ctrl.shiprocket);
  return router;
}

module.exports = { webhookRoutes };
