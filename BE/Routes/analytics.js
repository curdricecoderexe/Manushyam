const express = require("express");
const { validate } = require("../Middleware/validate");
const { optionalAuth } = require("../Middleware/auth");
const { limiters } = require("../Middleware/rateLimit");
const { schemas } = require("../Validators/analytics");
const { isBot } = require("../Services/userAgent");
const { ingest, recordConsent, quietly } = require("../Services/webAnalytics");
const { AppError } = require("../Utils/AppError");

// navigator.sendBeacon can only post "simple" bodies cross-origin, so the storefront sends JSON as
// text/plain. Both content types are accepted here.
function parseBeacon(req, res, next) {
  if (typeof req.body !== "string") return next();
  try {
    req.body = JSON.parse(req.body);
    return next();
  } catch {
    return next(new AppError(400, "INVALID_JSON", "Request body is not valid JSON"));
  }
}

// Public ingest, mounted outside the global limiter so analytics never eats a shopper's API budget.
// It has its own per-minute limit and a silent daily cap per IP.
function analyticsRoutes(env) {
  const router = express.Router();
  const limits = [limiters.analytics(env.ANALYTICS_RATE_MAX), limiters.analyticsDaily(env.ANALYTICS_DAILY_MAX)];
  const body = [express.text({ type: "text/plain", limit: "32kb" }), parseBeacon];

  // Events only arrive after the visitor has accepted analytics cookies (the browser holds them until then).
  router.post("/collect", ...limits, ...body, validate({ body: schemas.collect }), async (req, res) => {
    const userAgent = req.get("user-agent");
    if (!isBot(userAgent)) await quietly(ingest(req.body, { userAgent }), "ingest");
    res.status(204).end();
  });

  // The consent choice itself is always recorded (it is the DPDP consent record), with or without analytics.
  router.post("/consent", ...limits, ...body, validate({ body: schemas.consent }), optionalAuth, async (req, res) => {
    await recordConsent(req.body, { userId: req.user?.id, ip: req.ip, userAgent: req.get("user-agent") });
    res.status(204).end();
  });

  return router;
}

module.exports = { analyticsRoutes };
