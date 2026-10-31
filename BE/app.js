const express = require("express");
const helmet = require("helmet");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const pinoHttp = require("pino-http");
const compression = require("compression");

const { logger } = require("./Utils/logger");
const { requestId } = require("./Middleware/requestId");
const { rejectMongoOperators } = require("./Middleware/sanitize");
const { limiters } = require("./Middleware/rateLimit");
const { notFound, errorHandler } = require("./Middleware/errorHandler");
const healthRoutes = require("./Routes/health");
const { authRoutes } = require("./Routes/auth");
const { accountRoutes } = require("./Routes/account");
const { catalogRoutes } = require("./Routes/catalog");
const { adminCatalogRoutes } = require("./Routes/adminCatalog");
const { cartRoutes } = require("./Routes/cart");
const { orderRoutes } = require("./Routes/orders");
const { adminOrderRoutes } = require("./Routes/adminOrders");
const { webhookRoutes } = require("./Routes/webhooks");
const { cronRoutes } = require("./Routes/cron");
const { engagementRoutes } = require("./Routes/engagement");
const { supportRoutes } = require("./Routes/support");
const { adminSystemRoutes } = require("./Routes/adminSystem");
const { analyticsRoutes } = require("./Routes/analytics");
const { siteRoutes } = require("./Routes/site");
const { auditTrail } = require("./Services/audit");
const { setEnv } = require("./Config/runtime");

function createApp(env) {
  setEnv(env);
  const app = express();
  // Per-app settings (behaviour flags); secrets are read through Config/runtime.
  app.locals.env = env;

  app.disable("x-powered-by");
  app.set("trust proxy", env.TRUST_PROXY_HOPS);

  app.use(requestId);
  app.use(
    pinoHttp({
      logger,
      genReqId: (req) => req.id,
      autoLogging: { ignore: (req) => req.url === "/health" },
    })
  );

  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'none'"],
          frameAncestors: ["'none'"],
        },
      },
      crossOriginResourcePolicy: { policy: "same-site" },
      hsts: env.isProd ? { maxAge: 63072000, includeSubDomains: true, preload: true } : false,
    })
  );

  // Fail closed: requests from origins not on the allow-list are rejected.
  app.use(
    cors({
      origin(origin, cb) {
        if (!origin || env.corsOrigins.includes(origin)) return cb(null, true);
        return cb(new Error("CORS_NOT_ALLOWED"));
      },
      credentials: true,
      maxAge: 600,
    })
  );

  // Compresses JSON, sitemap and PDF responses above 1 KB (Render doesn’t do it for us).
  app.use(compression({ threshold: 1024 }));

  // Webhooks read the raw body (HMAC verification), so they are mounted before the JSON parser
  // and outside the global limiter (they have their own).
  app.use("/api/webhooks", webhookRoutes());

  app.use(express.json({ limit: "256kb" }));
  app.use(express.urlencoded({ extended: false, limit: "64kb" }));
  app.use(cookieParser());
  app.use(rejectMongoOperators);

  app.use(healthRoutes);
  app.get("/", (req, res) => res.json({ name: "ManushyaM API", status: "ok" }));

  // Analytics beacons have their own limits (see Routes/analytics.js), so they sit before the global one.
  app.use("/api/analytics", analyticsRoutes(env));
  app.use("/api", limiters.global(env.GLOBAL_RATE_MAX));
  app.use("/api", siteRoutes());
  // Every successful staff/admin write is recorded once the response is sent.
  app.use(auditTrail);
  app.use("/api/auth", authRoutes(env));
  app.use("/api", accountRoutes(env));
  app.use("/api", catalogRoutes());
  app.use("/api", adminSystemRoutes());
  app.use("/api/admin", adminCatalogRoutes());
  app.use("/api", cartRoutes());
  app.use("/api", orderRoutes(env));
  app.use("/api/admin", adminOrderRoutes());
  app.use("/api/cron", cronRoutes());
  app.use("/api", engagementRoutes());
  app.use("/api", supportRoutes());

  app.use(notFound);
  app.use(errorHandler);

  return app;
}

module.exports = { createApp };
