const express = require("express");
const { getEnv } = require("../Config/runtime");
const { safeEqualText } = require("../Controller/webhookController");
const { expireReservations } = require("../Services/orders");
const { releaseExpiredRedemptions } = require("../Services/coupons");
const { syncShipments } = require("../Jobs/syncShipments");
const { rollupRecent } = require("../Services/webAnalytics");

// Render Cron calls these with the shared secret (compared in constant time). Disabled without one.
function requireCronSecret(req, res, next) {
  const secret = getEnv().CRON_SECRET;
  if (!secret) return res.status(404).json({ error: { code: "NOT_FOUND", message: "Not found", requestId: req.id } });
  if (!safeEqualText(req.get("x-cron-secret"), secret)) return res.status(401).json({ error: { code: "UNAUTHORIZED", message: "Invalid cron secret", requestId: req.id } });
  return next();
}

function cronRoutes() {
  const router = express.Router();
  // Every few minutes: unpaid/unconfirmed orders past their hold release stock, then stale coupon holds.
  router.post("/cleanup", requireCronSecret, async (req, res) => {
    const expiredOrders = await expireReservations();
    const releasedCoupons = await releaseExpiredRedemptions();
    res.json({ expiredOrders, releasedCoupons });
  });
  // Hourly: courier status fallback.
  router.post("/sync-shipments", requireCronSecret, async (req, res) => {
    res.json(await syncShipments());
  });
  // Nightly: store daily web-analytics totals (raw data is purged by TTL after ANALYTICS_RETENTION_DAYS).
  router.post("/analytics-rollup", requireCronSecret, async (req, res) => {
    res.json(await rollupRecent());
  });
  return router;
}

module.exports = { cronRoutes };
