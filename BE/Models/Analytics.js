const mongoose = require("mongoose");

// First-party web analytics. Raw documents carry an `expiresAt` (set from ANALYTICS_RETENTION_DAYS when
// written) and a TTL index removes them; daily totals in AnalyticsDaily are kept.
// Visitor and session ids from the browser are never stored as sent: only keyed hashes, so a document id
// can't be guessed or written to by anyone who doesn't hold the browser's own id.
const expiresAt = { type: Date, required: true, index: { expireAfterSeconds: 0 } };

const sessionSchema = new mongoose.Schema(
  {
    _id: { type: String },
    visitor: { type: String, required: true, index: true },
    startedAt: { type: Date, required: true, index: true },
    lastSeenAt: { type: Date, required: true, index: true },
    pageviews: { type: Number, default: 0 },
    landingPath: String,
    exitPath: String,
    referrer: String,
    utm: { _id: false, source: String, medium: String, campaign: String, term: String, content: String },
    // Traffic source shown on the dashboard: utm_source, else the referring site, else "direct".
    source: { type: String, default: "direct" },
    device: { _id: false, type: { type: String }, browser: String, os: String },
    signedIn: { type: Boolean, default: false },
    expiresAt,
  },
  { versionKey: false }
);

const pageviewSchema = new mongoose.Schema(
  {
    session: { type: String, required: true },
    // Browser-made id for this view, so the "time on page" update can find it (scoped to the session).
    pv: { type: String, required: true },
    path: { type: String, required: true },
    title: String,
    at: { type: Date, required: true, index: true },
    durationMs: Number,
    expiresAt,
  },
  { versionKey: false }
);
pageviewSchema.index({ session: 1, pv: 1 }, { unique: true });

const eventSchema = new mongoose.Schema(
  {
    session: { type: String, required: true, index: true },
    name: { type: String, required: true },
    path: String,
    props: { type: Map, of: mongoose.Schema.Types.Mixed },
    at: { type: Date, required: true, index: true },
    expiresAt,
  },
  { versionKey: false }
);

const VITALS = ["LCP", "FCP", "CLS", "TTFB", "INP"];
const vitalSchema = new mongoose.Schema(
  {
    session: { type: String, required: true },
    name: { type: String, enum: VITALS, required: true },
    value: { type: Number, required: true },
    rating: { type: String, enum: ["good", "needs-improvement", "poor"] },
    path: String,
    at: { type: Date, required: true, index: true },
    expiresAt,
  },
  { versionKey: false }
);

// One row per cookie-banner choice (DPDP Act consent record). Kept longer than raw analytics: it is
// the evidence of what each visitor agreed to and when.
const CONSENT_ACTIONS = ["accept_all", "essential_only", "custom", "withdraw"];
const consentSchema = new mongoose.Schema(
  {
    visitor: { type: String, required: true, index: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", index: { sparse: true } },
    action: { type: String, enum: CONSENT_ACTIONS, required: true },
    analytics: { type: Boolean, required: true },
    policyVersion: { type: String, required: true },
    // Coarse context only: the /24 (IPv4) or /48 (IPv6) network, never the full address.
    network: String,
    userAgent: { type: String, maxlength: 200 },
    at: { type: Date, default: Date.now, index: true },
    expiresAt,
  },
  { versionKey: false }
);

// Pre-aggregated totals for one India-time day ("YYYY-MM-DD"). Rebuilt from the raw data until it is purged.
const countList = { type: [{ _id: false, key: String, count: Number }], default: [] };
const dailySchema = new mongoose.Schema(
  {
    _id: { type: String },
    pageviews: { type: Number, default: 0 },
    sessions: { type: Number, default: 0 },
    visitors: { type: Number, default: 0 },
    bounces: { type: Number, default: 0 },
    durationMs: { type: Number, default: 0 },
    topPages: countList,
    sources: countList,
    deviceTypes: countList,
    browsers: countList,
    os: countList,
    events: countList,
    vitals: {
      type: [{ _id: false, name: String, count: Number, sum: Number, good: Number, needsImprovement: Number, poor: Number }],
      default: [],
    },
    consents: { _id: false, total: { type: Number, default: 0 }, acceptAll: { type: Number, default: 0 }, essentialOnly: { type: Number, default: 0 }, custom: { type: Number, default: 0 }, withdraw: { type: Number, default: 0 }, analyticsOn: { type: Number, default: 0 } },
    rolledUpAt: Date,
  },
  { versionKey: false }
);

const model = (name, schema) => mongoose.models[name] || mongoose.model(name, schema);
const AnalyticsSession = model("AnalyticsSession", sessionSchema);
const AnalyticsPageview = model("AnalyticsPageview", pageviewSchema);
const AnalyticsEvent = model("AnalyticsEvent", eventSchema);
const AnalyticsVital = model("AnalyticsVital", vitalSchema);
const ConsentRecord = model("ConsentRecord", consentSchema);
const AnalyticsDaily = model("AnalyticsDaily", dailySchema);

module.exports = { AnalyticsSession, AnalyticsPageview, AnalyticsEvent, AnalyticsVital, ConsentRecord, AnalyticsDaily, VITALS, CONSENT_ACTIONS };
