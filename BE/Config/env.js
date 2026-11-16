const { z } = require("zod");

// Validated once at boot. A bad or missing variable stops the process
// instead of surfacing later as a confusing runtime error.
const schema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    PORT: z.coerce.number().int().positive().default(5000),
    MONGODB_URI: z.string().min(1, "MONGODB_URI is required"),
    CORS_ORIGINS: z.string().default("http://localhost:5173"),
    TRUST_PROXY_HOPS: z.coerce.number().int().min(0).default(0),
    LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
    GLOBAL_RATE_MAX: z.coerce.number().int().positive().default(300),
    AUTH_RATE_MAX: z.coerce.number().int().positive().default(20),
    OTP_RATE_MAX: z.coerce.number().int().positive().default(10),
    // First-party analytics ingest: requests per minute and per day from one IP, and raw-data retention.
    ANALYTICS_RATE_MAX: z.coerce.number().int().positive().default(60),
    ANALYTICS_DAILY_MAX: z.coerce.number().int().positive().default(2000),
    ANALYTICS_RETENTION_DAYS: z.coerce.number().int().min(1).max(730).default(90),
    JWT_ACCESS_SECRET: z.string().min(32, "JWT_ACCESS_SECRET must be at least 32 characters"),
    JWT_REFRESH_SECRET: z.string().min(32, "JWT_REFRESH_SECRET must be at least 32 characters"),
    OTP_PEPPER: z.string().min(16, "OTP_PEPPER must be at least 16 characters"),
    APP_URL: z.string().url().regex(/^https?:\/\//, "must be an http(s) URL").default("http://localhost:5173"),
    // Email OTP is always required for staff/admin; this toggles it for customers.
    CUSTOMER_LOGIN_OTP: z
      .enum(["true", "false"])
      .default("true")
      .transform((v) => v === "true"),
    // Outgoing email over SMTP (Gmail by default). Leave SMTP_USER/SMTP_PASS empty in dev to log emails instead.
    SMTP_HOST: z.string().min(1).default("smtp.gmail.com"),
    // 465 = TLS from the start; 587 = STARTTLS.
    SMTP_PORT: z.coerce.number().int().positive().default(465),
    // The Gmail address, and a 16-character App Password (not the account password).
    SMTP_USER: z.string().optional(),
    // Google shows App Passwords in groups of four; the spaces are not part of it.
    SMTP_PASS: z
      .string()
      .optional()
      .transform((v) => v?.replace(/\s+/g, "")),
    MAIL_FROM: z.string().default("ManushyaM <no-reply@manushyam.com>"),
    // Product/CMS image uploads. Leave empty to disable uploads (the endpoint returns 503).
    CLOUDINARY_CLOUD_NAME: z.string().optional(),
    CLOUDINARY_API_KEY: z.string().optional(),
    CLOUDINARY_API_SECRET: z.string().optional(),
    // Razorpay (prepaid). Leave empty to offer Cash on Delivery only.
    RAZORPAY_KEY_ID: z
      .string()
      .regex(/^(rzp_(live|test)_[A-Za-z0-9]+)?$/, "must look like rzp_live_… or rzp_test_…")
      .optional(),
    RAZORPAY_KEY_SECRET: z.string().optional(),
    RAZORPAY_WEBHOOK_SECRET: z.string().optional(),
    // Optional: your Razorpay merchant account id (acc_…). Webhooks for any other account are ignored.
    RAZORPAY_ACCOUNT_ID: z
      .string()
      .regex(/^(acc_[A-Za-z0-9]+)?$/, "must look like acc_…")
      .optional(),
    // Refund a paid online order automatically when it is cancelled (by the customer, an admin or expiry).
    RAZORPAY_AUTO_REFUND_ON_CANCEL: z
      .enum(["true", "false"])
      .default("true")
      .transform((v) => v === "true"),
    // "optimum" = instant refund where the bank supports it (Razorpay charges a fee); "normal" = 5–7 days, free.
    RAZORPAY_REFUND_SPEED: z.enum(["normal", "optimum"]).default("normal"),
    // Production refuses rzp_test_ keys unless this is set (for a staging deployment).
    RAZORPAY_ALLOW_TEST_MODE: z
      .enum(["true", "false"])
      .default("false")
      .transform((v) => v === "true"),
    // Shiprocket. Leave empty to quote delivery from the admin PIN rules and ship manually.
    SHIPROCKET_EMAIL: z.string().optional(),
    SHIPROCKET_PASSWORD: z.string().optional(),
    SHIPROCKET_PICKUP_LOCATION: z.string().default("Primary"),
    SHIPROCKET_PICKUP_PIN: z
      .string()
      .regex(/^[1-9][0-9]{5}$/)
      .default("560001"),
    // Sent by Shiprocket as the x-api-key header on tracking webhooks.
    SHIPROCKET_WEBHOOK_TOKEN: z.string().optional(),
    // Optional: the Shiprocket channel to file orders under (Channels → Custom channel id).
    SHIPROCKET_CHANNEL_ID: z
      .string()
      .regex(/^(\d+)?$/, "must be a number")
      .optional(),
    // Optional: always use this courier (courier_company_id). Empty = Shiprocket's recommendation.
    SHIPROCKET_COURIER_ID: z
      .string()
      .regex(/^(\d+)?$/, "must be a number")
      .optional(),
    // Request the courier pickup as soon as the AWB is assigned.
    SHIPROCKET_AUTO_PICKUP: z
      .enum(["true", "false"])
      .default("true")
      .transform((v) => v === "true"),
    // Render Cron calls /api/cron/* with this in the x-cron-secret header. Empty disables the endpoints.
    CRON_SECRET: z.string().min(24, "CRON_SECRET must be at least 24 characters").optional(),
    // GST invoice details (open item: confirm with the owner before launch).
    INVOICE_LEGAL_NAME: z.string().default("ManushyaM Wellness Pvt. Ltd."),
    INVOICE_ADDRESS: z.string().default("Bengaluru, Karnataka, India"),
    INVOICE_GSTIN: z.string().default(""),
    INVOICE_STATE: z.string().default("Karnataka"),
    GST_RATE_PERCENT: z.coerce.number().min(0).max(28).default(18),
    // Contact-form messages are emailed here.
    SUPPORT_EMAIL: z.string().email().default("care@manushyam.com"),
    // Cloudflare Turnstile on the contact form. Leave empty to rely on the honeypot + rate limit only.
    TURNSTILE_SECRET_KEY: z.string().optional(),
    // Shared Socket.IO state across API instances. Leave empty for a single instance.
    REDIS_URL: z.string().optional(),
  })
  .superRefine((env, ctx) => {
    if (env.NODE_ENV === "production" && env.JWT_ACCESS_SECRET === env.JWT_REFRESH_SECRET) {
      ctx.addIssue({ code: "custom", path: ["JWT_REFRESH_SECRET"], message: "must differ from JWT_ACCESS_SECRET" });
    }
    if (env.NODE_ENV === "production") productionChecks(env, ctx);
    if (Boolean(env.SMTP_USER) !== Boolean(env.SMTP_PASS)) {
      ctx.addIssue({ code: "custom", path: [env.SMTP_USER ? "SMTP_PASS" : "SMTP_USER"], message: "SMTP needs both SMTP_USER and SMTP_PASS" });
    }
    if (env.NODE_ENV === "production" && !env.SMTP_USER) {
      ctx.addIssue({ code: "custom", path: ["SMTP_USER"], message: "is required in production (OTP emails)" });
    }
    if (env.RAZORPAY_KEY_ID && !(env.RAZORPAY_KEY_SECRET && env.RAZORPAY_WEBHOOK_SECRET)) {
      ctx.addIssue({ code: "custom", path: ["RAZORPAY_KEY_SECRET"], message: "Razorpay needs the key secret and webhook secret too" });
    }
    if (env.NODE_ENV === "production" && env.RAZORPAY_KEY_ID?.startsWith("rzp_test_") && !env.RAZORPAY_ALLOW_TEST_MODE) {
      ctx.addIssue({ code: "custom", path: ["RAZORPAY_KEY_ID"], message: "is a test key in production — use the rzp_live_ key (or set RAZORPAY_ALLOW_TEST_MODE=true for staging)" });
    }
    if (env.RAZORPAY_WEBHOOK_SECRET && env.RAZORPAY_WEBHOOK_SECRET === env.RAZORPAY_KEY_SECRET) {
      ctx.addIssue({ code: "custom", path: ["RAZORPAY_WEBHOOK_SECRET"], message: "must differ from RAZORPAY_KEY_SECRET (set your own secret on the webhook)" });
    }
    if (env.SHIPROCKET_EMAIL && !(env.SHIPROCKET_PASSWORD && env.SHIPROCKET_WEBHOOK_TOKEN)) {
      ctx.addIssue({ code: "custom", path: ["SHIPROCKET_PASSWORD"], message: "Shiprocket needs the password and webhook token too" });
    }
    if (env.SHIPROCKET_WEBHOOK_TOKEN && env.SHIPROCKET_WEBHOOK_TOKEN.length < 16) {
      ctx.addIssue({ code: "custom", path: ["SHIPROCKET_WEBHOOK_TOKEN"], message: "must be at least 16 characters" });
    }
  });

// Mistakes that are harmless on a laptop but unsafe on the internet.
const PLACEHOLDER = /(dummy|changeme|change-me|replace|placeholder|example|^x+$)/i;
function productionChecks(env, ctx) {
  const issue = (path, message) => ctx.addIssue({ code: "custom", path: [path], message });
  // Behind Render's load balancer (and any CDN) the client IP is only known if the proxies are trusted;
  // with 0 every visitor shares one rate-limit bucket and the logs show the proxy's address.
  if (env.TRUST_PROXY_HOPS < 1) issue("TRUST_PROXY_HOPS", "must be at least 1 behind a load balancer (1 on Render, 2 with Cloudflare in front)");
  const origins = env.CORS_ORIGINS.split(",").map((o) => o.trim()).filter(Boolean);
  if (!origins.length || origins.some((o) => !/^https:\/\/[^/\s]+$/.test(o))) issue("CORS_ORIGINS", "must list only https origins (no paths, no localhost)");
  if (!env.APP_URL.startsWith("https://")) issue("APP_URL", "must be an https URL");
  for (const key of ["JWT_ACCESS_SECRET", "JWT_REFRESH_SECRET", "OTP_PEPPER", "CRON_SECRET", "RAZORPAY_WEBHOOK_SECRET", "SHIPROCKET_WEBHOOK_TOKEN"]) {
    if (env[key] && PLACEHOLDER.test(env[key])) issue(key, "looks like a placeholder — generate a random value");
  }
  if (env.OTP_PEPPER === env.JWT_ACCESS_SECRET || env.OTP_PEPPER === env.JWT_REFRESH_SECRET) issue("OTP_PEPPER", "must differ from the JWT secrets");
  if (env.RAZORPAY_WEBHOOK_SECRET && env.RAZORPAY_WEBHOOK_SECRET.length < 16) issue("RAZORPAY_WEBHOOK_SECRET", "must be at least 16 characters");
}

function loadEnv(source = process.env) {
  const parsed = schema.safeParse(source);
  if (!parsed.success) {
    const lines = parsed.error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`);
    throw new Error(`Invalid environment configuration:\n${lines.join("\n")}`);
  }
  const env = parsed.data;
  return Object.freeze({
    ...env,
    isProd: env.NODE_ENV === "production",
    isTest: env.NODE_ENV === "test",
    mailEnabled: Boolean(env.SMTP_USER && env.SMTP_PASS),
    corsOrigins: env.CORS_ORIGINS.split(",").map((o) => o.trim()).filter(Boolean),
  });
}

module.exports = { loadEnv };
