const crypto = require("crypto");
const { getEnv } = require("../Config/runtime");
const { AnalyticsSession, AnalyticsPageview, AnalyticsEvent, AnalyticsVital, ConsentRecord, AnalyticsDaily, VITALS } = require("../Models/Analytics");
const { resolveRange, istDay, addDays } = require("./salesAnalytics");
const { classify } = require("./userAgent");
const { logger } = require("../Utils/logger");

const DAY_MS = 86400000;
const TZ = "Asia/Kolkata";
// Consent records are evidence of what a visitor agreed to, so they outlive raw analytics (13 months;
// the banner asks again after 12).
const CONSENT_RETENTION_DAYS = 395;
// Longest gap counted as time on a page / in a session (a tab left open overnight isn't "engagement").
const MAX_PAGE_MS = 30 * 60 * 1000;
const MAX_SESSION_MS = 4 * 60 * 60 * 1000;
// "Active now" = seen in the last five minutes (the storefront pings every minute while visible).
const ACTIVE_WINDOW_MS = 5 * 60 * 1000;
const TOP_N = 50;

// Keyed hash of a browser-made id. Without the server key, a stored id can't be matched back to a browser.
function hashId(kind, raw) {
  return crypto.createHmac("sha256", getEnv().OTP_PEPPER).update(`analytics:${kind}:${raw}`).digest("base64url").slice(0, 32);
}

const expiry = (days = getEnv().ANALYTICS_RETENTION_DAYS) => new Date(Date.now() + days * DAY_MS);

// "https://www.google.com/search?q=…" → "google.com"; our own site and junk → null.
function referrerHost(url) {
  if (!url) return null;
  try {
    const host = new URL(url).hostname.toLowerCase().replace(/^www\./, "");
    const own = new URL(getEnv().APP_URL).hostname.toLowerCase().replace(/^www\./, "");
    return host && host !== own ? host.slice(0, 100) : null;
  } catch {
    return null;
  }
}

// Coarse network for consent records: IPv4 /24 or IPv6 /48.
function network(ip = "") {
  const v4 = ip.replace(/^::ffff:/, "");
  if (/^\d+\.\d+\.\d+\.\d+$/.test(v4)) return `${v4.split(".").slice(0, 3).join(".")}.0/24`;
  if (ip.includes(":")) {
    // Expand "::" so the first three groups are the real ones (e.g. "::1" → 0:0:0).
    const [head, tail = ""] = ip.split("%")[0].split("::");
    const left = head ? head.split(":") : [];
    const right = ip.includes("::") && tail ? tail.split(":") : [];
    const groups = [...left, ...Array(Math.max(0, 8 - left.length - right.length)).fill("0"), ...right];
    return `${groups.slice(0, 3).map((g) => g || "0").join(":")}::/48`;
  }
  return undefined;
}

// --- Ingest -------------------------------------------------------------------------------------

// One batch from one browser tab: pageviews, time-on-page updates, custom events, Web Vitals and pings.
async function ingest({ vid, sid, signedIn, events }, { userAgent }) {
  const now = new Date();
  const session = hashId("s", sid);
  const expiresAt = expiry();
  const views = events.filter((e) => e.t === "pageview");
  const first = views[0];

  const sessionUpdate = {
    $setOnInsert: {
      visitor: hashId("v", vid),
      startedAt: now,
      landingPath: first?.path,
      referrer: referrerHost(first?.referrer),
      utm: first?.utm,
      source: first?.utm?.source || referrerHost(first?.referrer) || "direct",
      device: classify(userAgent),
      expiresAt,
    },
    $set: { lastSeenAt: now, ...(views.length ? { exitPath: views[views.length - 1].path } : {}) },
    $inc: { pageviews: views.length },
  };
  if (signedIn) sessionUpdate.$set.signedIn = true;
  await AnalyticsSession.updateOne({ _id: session }, sessionUpdate, { upsert: true });

  const writes = [];
  if (views.length) {
    const docs = views.map((v) => ({ session, pv: v.pv, path: v.path, title: v.title, at: now, expiresAt }));
    // A retried beacon re-sends the same pv ids; the unique index drops the copies.
    writes.push(AnalyticsPageview.insertMany(docs, { ordered: false }).catch((err) => (err.code === 11000 || err.writeErrors ? null : Promise.reject(err))));
  }
  for (const leave of events.filter((e) => e.t === "leave")) {
    writes.push(AnalyticsPageview.updateOne({ session, pv: leave.pv }, { $set: { durationMs: Math.min(leave.durationMs, MAX_PAGE_MS) } }));
  }
  const custom = events.filter((e) => e.t === "event");
  if (custom.length) writes.push(AnalyticsEvent.insertMany(custom.map((e) => ({ session, name: e.name, path: e.path, props: e.props, at: now, expiresAt }))));
  const vitals = events.filter((e) => e.t === "vital");
  if (vitals.length) writes.push(AnalyticsVital.insertMany(vitals.map((v) => ({ session, name: v.name, value: v.value, rating: v.rating, path: v.path, at: now, expiresAt }))));
  await Promise.all(writes);
}

async function recordConsent({ vid, action, analytics, policyVersion }, { userId, ip, userAgent }) {
  await ConsentRecord.create({
    visitor: hashId("v", vid),
    user: userId,
    action,
    analytics,
    policyVersion,
    network: network(ip),
    userAgent: userAgent?.slice(0, 200),
    expiresAt: expiry(CONSENT_RETENTION_DAYS),
  });
}

// --- Daily roll-ups -----------------------------------------------------------------------------

const istStart = (day) => new Date(`${day}T00:00:00+05:30`);
const counts = (field) => [{ $group: { _id: field, count: { $sum: 1 } } }, { $sort: { count: -1, _id: 1 } }, { $limit: TOP_N }, { $project: { _id: 0, key: { $ifNull: ["$_id", "unknown"] }, count: 1 } }];

// Aggregates one India-time day from the raw collections.
async function computeDay(day) {
  const since = istStart(day);
  const until = istStart(addDays(day, 1));
  const inDay = { $gte: since, $lt: until };

  const [[s], [pv], events, vitals, consents] = await Promise.all([
    AnalyticsSession.aggregate([
      { $match: { startedAt: inDay } },
      {
        $facet: {
          totals: [
            {
              $group: {
                _id: null,
                sessions: { $sum: 1 },
                bounces: { $sum: { $cond: [{ $lte: ["$pageviews", 1] }, 1, 0] } },
                durationMs: { $sum: { $min: [{ $subtract: ["$lastSeenAt", "$startedAt"] }, MAX_SESSION_MS] } },
                visitors: { $addToSet: "$visitor" },
              },
            },
            { $project: { _id: 0, sessions: 1, bounces: 1, durationMs: 1, visitors: { $size: "$visitors" } } },
          ],
          sources: counts("$source"),
          deviceTypes: counts("$device.type"),
          browsers: counts("$device.browser"),
          os: counts("$device.os"),
        },
      },
    ]),
    AnalyticsPageview.aggregate([{ $match: { at: inDay } }, { $facet: { total: [{ $count: "n" }], topPages: counts("$path") } }]),
    AnalyticsEvent.aggregate([{ $match: { at: inDay } }, ...counts("$name")]),
    AnalyticsVital.aggregate([
      { $match: { at: inDay } },
      {
        $group: {
          _id: "$name",
          count: { $sum: 1 },
          sum: { $sum: "$value" },
          good: { $sum: { $cond: [{ $eq: ["$rating", "good"] }, 1, 0] } },
          needsImprovement: { $sum: { $cond: [{ $eq: ["$rating", "needs-improvement"] }, 1, 0] } },
          poor: { $sum: { $cond: [{ $eq: ["$rating", "poor"] }, 1, 0] } },
        },
      },
      { $project: { _id: 0, name: "$_id", count: 1, sum: 1, good: 1, needsImprovement: 1, poor: 1 } },
    ]),
    ConsentRecord.aggregate([{ $match: { at: inDay } }, { $group: { _id: "$action", n: { $sum: 1 }, on: { $sum: { $cond: ["$analytics", 1, 0] } } } }]),
  ]);

  const t = s.totals[0] ?? { sessions: 0, bounces: 0, durationMs: 0, visitors: 0 };
  const byAction = Object.fromEntries(consents.map((c) => [c._id, c.n]));
  return {
    _id: day,
    pageviews: pv.total[0]?.n ?? 0,
    ...t,
    topPages: pv.topPages,
    sources: s.sources,
    deviceTypes: s.deviceTypes,
    browsers: s.browsers,
    os: s.os,
    events,
    vitals,
    consents: {
      total: consents.reduce((n, c) => n + c.n, 0),
      acceptAll: byAction.accept_all ?? 0,
      essentialOnly: byAction.essential_only ?? 0,
      custom: byAction.custom ?? 0,
      withdraw: byAction.withdraw ?? 0,
      analyticsOn: consents.reduce((n, c) => n + c.on, 0),
    },
  };
}

async function rollupDay(day) {
  const doc = await computeDay(day);
  await AnalyticsDaily.replaceOne({ _id: day }, { ...doc, rolledUpAt: new Date() }, { upsert: true });
  return doc;
}

// Nightly job: (re)build the last few finished days so late beacons from sessions crossing midnight count.
async function rollupRecent(days = 3) {
  const today = istDay(new Date());
  const done = [];
  for (let i = days; i >= 1; i -= 1) {
    const day = addDays(today, -i);
    await rollupDay(day);
    done.push(day);
  }
  return { rolledUp: done };
}

// Daily docs for a list of days. Finished days are stored the first time they are needed; today is
// always computed live. Days older than the raw-data retention with no stored total are simply empty.
async function dailies(days) {
  const today = istDay(new Date());
  const oldestRaw = istDay(new Date(Date.now() - getEnv().ANALYTICS_RETENTION_DAYS * DAY_MS));
  const stored = new Map((await AnalyticsDaily.find({ _id: { $in: days } }).lean()).map((d) => [d._id, d]));
  const out = [];
  for (const day of days) {
    if (day > today) out.push(emptyDay(day));
    else if (day === today) out.push(await computeDay(day));
    else if (stored.has(day)) out.push(stored.get(day));
    else if (day < oldestRaw) out.push(emptyDay(day));
    else out.push(await rollupDay(day));
  }
  return out;
}

function emptyDay(day) {
  return { _id: day, pageviews: 0, sessions: 0, visitors: 0, bounces: 0, durationMs: 0, topPages: [], sources: [], deviceTypes: [], browsers: [], os: [], events: [], vitals: [], consents: { total: 0, acceptAll: 0, essentialOnly: 0, custom: 0, withdraw: 0, analyticsOn: 0 } };
}

// --- Dashboard ----------------------------------------------------------------------------------

function mergeCounts(docs, field, limit = 20) {
  const totals = new Map();
  for (const d of docs) for (const { key, count } of d[field] ?? []) totals.set(key, (totals.get(key) ?? 0) + count);
  return [...totals].map(([key, count]) => ({ key, count })).sort((a, b) => b.count - a.count || a.key.localeCompare(b.key)).slice(0, limit);
}

function kpis(docs) {
  const sum = (f) => docs.reduce((n, d) => n + (d[f] ?? 0), 0);
  const sessions = sum("sessions");
  const pageviews = sum("pageviews");
  return {
    pageviews,
    sessions,
    visitors: sum("visitors"),
    bounceRate: sessions ? sum("bounces") / sessions : 0,
    avgSessionMs: sessions ? Math.round(sum("durationMs") / sessions) : 0,
    pagesPerSession: sessions ? pageviews / sessions : 0,
  };
}

function mergeVitals(docs) {
  return VITALS.map((name) => {
    const rows = docs.flatMap((d) => (d.vitals ?? []).filter((v) => v.name === name));
    const count = rows.reduce((n, r) => n + r.count, 0);
    const pick = (f) => rows.reduce((n, r) => n + r[f], 0);
    return { name, count, average: count ? pick("sum") / count : null, good: pick("good"), needsImprovement: pick("needsImprovement"), poor: pick("poor") };
  });
}

function mergeConsents(docs) {
  const keys = ["total", "acceptAll", "essentialOnly", "custom", "withdraw", "analyticsOn"];
  return Object.fromEntries(keys.map((k) => [k, docs.reduce((n, d) => n + (d.consents?.[k] ?? 0), 0)]));
}

function dayList(from, to) {
  const days = [];
  for (let d = from; d <= to; d = addDays(d, 1)) days.push(d);
  return days;
}

async function webReport(query) {
  const range = resolveRange(query);
  const [current, previous] = await Promise.all([dailies(dayList(range.from, range.to)), dailies(dayList(range.previous.from, range.previous.to))]);

  const buckets = new Map();
  for (const d of current) {
    const key = range.granularity === "day" ? d._id : d._id.slice(0, 7);
    const b = buckets.get(key) ?? { key, pageviews: 0, sessions: 0, visitors: 0 };
    b.pageviews += d.pageviews;
    b.sessions += d.sessions;
    b.visitors += d.visitors;
    buckets.set(key, b);
  }

  return {
    range: { from: range.from, to: range.to, days: range.days, granularity: range.granularity, timezone: TZ },
    retentionDays: getEnv().ANALYTICS_RETENTION_DAYS,
    kpis: kpis(current),
    previous: kpis(previous),
    trend: [...buckets.values()],
    topPages: mergeCounts(current, "topPages"),
    sources: mergeCounts(current, "sources"),
    devices: { types: mergeCounts(current, "deviceTypes"), browsers: mergeCounts(current, "browsers", 8), os: mergeCounts(current, "os", 8) },
    events: mergeCounts(current, "events"),
    vitals: mergeVitals(current),
    consent: mergeConsents(current),
  };
}

async function liveVisitors() {
  const since = new Date(Date.now() - ACTIVE_WINDOW_MS);
  const [activeNow, pages] = await Promise.all([
    AnalyticsSession.countDocuments({ lastSeenAt: { $gte: since } }),
    AnalyticsSession.aggregate([{ $match: { lastSeenAt: { $gte: since } } }, ...counts("$exitPath"), { $limit: 5 }]),
  ]);
  return { activeNow, pages, windowMinutes: ACTIVE_WINDOW_MS / 60000, at: new Date() };
}

// Ingest must never fail loudly for the visitor; problems are logged and the beacon still gets a 204.
function quietly(promise, what) {
  return promise.catch((err) => logger.warn({ err: err.message }, `analytics ${what} failed`));
}

module.exports = { ingest, recordConsent, computeDay, rollupDay, rollupRecent, webReport, liveVisitors, hashId, referrerHost, network, quietly };
