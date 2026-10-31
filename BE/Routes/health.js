const express = require("express");
const { pingDB } = require("../Config/db");

const router = express.Router();

// Real database round-trip so the load balancer takes us out of rotation when Mongo is down.
router.get("/health", async (req, res) => {
  const db = await pingDB();
  const ok = db;
  res.status(ok ? 200 : 503).json({
    status: ok ? "ok" : "degraded",
    checks: { database: db ? "up" : "down" },
    uptime: Math.round(process.uptime()),
    timestamp: new Date().toISOString(),
  });
});

module.exports = router;
