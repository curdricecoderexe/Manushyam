const express = require("express");
const { z } = require("zod");
const { limiter } = require("../Middleware/rateLimit");
const { getSitemap } = require("../Services/sitemap");
const { logger } = require("../Utils/logger");

// Browser crash reports. Fields are clipped, query strings dropped from URLs, and the endpoint always
// answers 204 so a broken page never gets a second error from reporting the first.
const clip = (n) => z.string().max(n * 4).transform((s) => s.slice(0, n));
const clientError = z.object({
  kind: z.enum(["render", "route", "error", "unhandledrejection"]).default("error"),
  message: clip(500),
  stack: clip(4000).optional(),
  componentStack: clip(2000).optional(),
  url: clip(500)
    .transform((u) => u.split(/[?#]/)[0])
    .optional(),
  release: clip(40).optional(),
});

function siteRoutes() {
  const router = express.Router();

  router.get("/seo/sitemap.xml", async (req, res) => {
    res.set("Content-Type", "application/xml; charset=utf-8");
    res.set("Cache-Control", "public, max-age=3600");
    res.send(await getSitemap());
  });

  router.post("/client-errors", limiter({ name: "client-error", windowMs: 15 * 60 * 1000, max: 30, silent: true }), (req, res) => {
    const parsed = clientError.safeParse(req.body ?? {});
    if (parsed.success) {
      logger.warn({ clientError: parsed.data, userAgent: req.get("user-agent")?.slice(0, 200), requestId: req.id }, "Client error reported");
    }
    res.status(204).end();
  });

  return router;
}

module.exports = { siteRoutes };
