const pino = require("pino");

// PII and secrets are redacted at the logger so no call site can leak them.
const logger = pino({
  level: process.env.LOG_LEVEL || (process.env.NODE_ENV === "test" ? "silent" : "info"),
  base: { service: "manushyam-api" },
  redact: {
    paths: [
      "req.headers.authorization",
      "req.headers.cookie",
      'res.headers["set-cookie"]',
      "*.password",
      "*.otp",
      "*.token",
      "*.refreshToken",
      "*.email",
      "*.phone",
      "*.address",
    ],
    censor: "[redacted]",
  },
  timestamp: pino.stdTimeFunctions.isoTime,
});

module.exports = { logger };
