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
    APP_URL: z.string().url().default("http://localhost:5173"),
    // Email OTP is always required for staff/admin; this toggles it for customers.
    CUSTOMER_LOGIN_OTP: z
      .enum(["true", "false"])
      .default("true")
      .transform((v) => v === "true"),
    SMTP_URL: z.string().optional(),
    MAIL_FROM: z.string().default("ManushyaM <no-reply@manushyam.com>"),
    // Product/CMS image uploads. Leave empty to disable uploads (the endpoint returns 503).
    CLOUDINARY_CLOUD_NAME: z.string().optional(),
    CLOUDINARY_API_KEY: z.string().optional(),
    CLOUDINARY_API_SECRET: z.string().optional(),
    // Razorpay (prepaid). Leave empty to offer Cash on Delivery only.
    RAZORPAY_KEY_ID: z.string().optional(),
    RAZORPAY_KEY_SECRET: z.string().optional(),
    RAZORPAY_WEBHOOK_SECRET: z.string().optional(),
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
    if (env.NODE_ENV === "production" && !env.SMTP_URL) {
      ctx.addIssue({ code: "custom", path: ["SMTP_URL"], message: "is required in production (OTP emails)" });
    }
    if (env.RAZORPAY_KEY_ID && !(env.RAZORPAY_KEY_SECRET && env.RAZORPAY_WEBHOOK_SECRET)) {
      ctx.addIssue({ code: "custom", path: ["RAZORPAY_KEY_SECRET"], message: "Razorpay needs the key secret and webhook secret too" });
    }
    if (env.SHIPROCKET_EMAIL && !(env.SHIPROCKET_PASSWORD && env.SHIPROCKET_WEBHOOK_TOKEN)) {
      ctx.addIssue({ code: "custom", path: ["SHIPROCKET_PASSWORD"], message: "Shiprocket needs the password and webhook token too" });
    }
  });

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
    corsOrigins: env.CORS_ORIGINS.split(",").map((o) => o.trim()).filter(Boolean),
  });
}

module.exports = { loadEnv };
