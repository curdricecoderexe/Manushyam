const { rateLimit, ipKeyGenerator } = require("express-rate-limit");

// In-memory store for now (single instance). Swap `store` for a Redis store when scaling out (plan §1).
// `silent` answers 204 instead of 429 (analytics beacons: nothing for a client to retry or show).
function limiter({ windowMs, max, name, keyByUser = false, silent = false }) {
  return rateLimit({
    windowMs,
    limit: max,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    // ipKeyGenerator normalises IPv6 to a /56 subnet so one host can't rotate addresses.
    keyGenerator: (req) => (keyByUser && req.user ? `u:${req.user.id}` : `ip:${ipKeyGenerator(req.ip, 56)}`),
    handler: (req, res) => {
      if (silent) return res.status(204).end();
      return res.status(429).json({
        error: { code: "RATE_LIMITED", message: "Too many requests. Please slow down.", limiter: name, requestId: req.id },
      });
    },
  });
}

const limiters = {
  global: (max) => limiter({ name: "global", windowMs: 15 * 60 * 1000, max }),
  auth: (max = 20) => limiter({ name: "auth", windowMs: 15 * 60 * 1000, max }),
  otp: (max = 10) => limiter({ name: "otp", windowMs: 15 * 60 * 1000, max }),
  analytics: (max = 60) => limiter({ name: "analytics", windowMs: 60 * 1000, max }),
  analyticsDaily: (max = 2000) => limiter({ name: "analytics-daily", windowMs: 24 * 60 * 60 * 1000, max, silent: true }),
  privacy: () => limiter({ name: "privacy", windowMs: 60 * 60 * 1000, max: 5, keyByUser: true }),
  write: () => limiter({ name: "write", windowMs: 60 * 1000, max: 60, keyByUser: true }),
};

module.exports = { limiter, limiters };
