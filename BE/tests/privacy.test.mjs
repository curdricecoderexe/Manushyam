import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import request from "supertest";
import { createRequire } from "module";
import { buildApp, startDb, stopDb, clearDb, registerUser, registerAs, bearer, outbox, ORIGIN } from "./helpers.mjs";

const require = createRequire(import.meta.url);
const { User } = require("../Models/User.js");
const { Order } = require("../Models/Order.js");
const { Product } = require("../Models/Product.js");
const { Review } = require("../Models/Review.js");
const { Address } = require("../Models/Address.js");
const { NewsletterSubscriber } = require("../Models/Engagement.js");
const { AnalyticsSession, AnalyticsPageview, AnalyticsEvent, AnalyticsVital, ConsentRecord, AnalyticsDaily } = require("../Models/Analytics.js");
const { seedCatalog } = require("../Services/seed.js");
const { computeDay, hashId, network, referrerHost } = require("../Services/webAnalytics.js");
const { istDay, addDays } = require("../Services/salesAnalytics.js");
const { isBot, classify } = require("../Services/userAgent.js");
const { recomputeRating } = require("../Services/reviews.js");

const CRON_SECRET = "cron-secret-cron-secret-0001";
// Secrets are process-wide (Config/runtime), so every app built here carries the same ones.
const build = (overrides = {}) => buildApp({ CRON_SECRET, ...overrides });
const app = build();
const PHONE_UA = "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Mobile Safari/537.36";
const MAC_UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15";

beforeAll(startDb);
afterAll(stopDb);
beforeEach(async () => {
  await clearDb();
  await seedCatalog();
});

const ids = (n) => ({ vid: `visitor-${n}-abcdef`, sid: `session-${n}-abcdef` });
function collect(body, { ua = PHONE_UA, target = app, beacon = false } = {}) {
  const req = request(target).post("/api/analytics/collect").set("Origin", ORIGIN).set("User-Agent", ua);
  return beacon ? req.set("Content-Type", "text/plain").send(JSON.stringify(body)) : req.send(body);
}

let n = 0;
async function order(user, { status = "delivered", sku = "MM-MEN-THERAPY", extra = {} } = {}) {
  n += 1;
  const product = await Product.findOne({ "variants.sku": sku });
  return Order.create({
    orderNumber: `MM261017-P${String(n).padStart(4, "0")}`,
    user,
    email: "kavya@example.com",
    customerName: "Kavya Iyer",
    items: [{ product: product._id, sku, name: product.name, price: 49900, qty: 1, lineTotal: 49900 }],
    address: { fullName: "Kavya Iyer", phone: "9876543210", line1: "12 Lake Road", line2: "Flat 4", landmark: "Near park", city: "Bengaluru", state: "Karnataka", pincode: "560001" },
    amounts: { subtotal: 49900, total: 49900 },
    paymentMethod: "cod",
    status,
    history: [{ status, at: new Date(), source: "system" }],
    holdsStock: false,
    invoiceNumber: `MM/26-27/P${n}`,
    ...extra,
  });
}

describe("user agent and helpers", () => {
  it("classifies devices and spots bots", () => {
    expect(classify(PHONE_UA)).toEqual({ type: "mobile", browser: "Chrome", os: "Android" });
    expect(classify(MAC_UA)).toEqual({ type: "desktop", browser: "Safari", os: "macOS" });
    expect(classify("Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1").type).toBe("tablet");
    expect(isBot("Mozilla/5.0 (compatible; Googlebot/2.1)")).toBe(true);
    expect(isBot("")).toBe(true);
    expect(isBot(PHONE_UA)).toBe(false);
  });

  it("keeps only the referring host and a coarse network", () => {
    expect(referrerHost("https://www.google.com/search?q=hair+oil")).toBe("google.com");
    expect(referrerHost("http://localhost:5173/solutions")).toBeNull();
    expect(referrerHost("not a url")).toBeNull();
    expect(network("203.0.113.45")).toBe("203.0.113.0/24");
    expect(network("::ffff:203.0.113.45")).toBe("203.0.113.0/24");
    expect(network("2001:db8:abcd:12::1")).toBe("2001:db8:abcd::/48");
    expect(network("2001:db8::1")).toBe("2001:db8:0::/48");
    expect(network("::1")).toBe("0:0:0::/48");
  });
});

describe("analytics ingest", () => {
  it("stores a session, pageviews, time on page, events and vitals under hashed ids", async () => {
    const res = await collect({
      ...ids(1),
      signedIn: true,
      events: [
        { t: "pageview", pv: "pv-0001-abcd", path: "/solutions?for=men&email=a@b.com#top", title: "Solutions", referrer: "https://www.instagram.com/p/x", utm: { source: "Instagram", medium: "Social", campaign: "Diwali" } },
        { t: "event", name: "add_to_cart", path: "/solutions", props: { sku: "MM-MEN-THERAPY", qty: 1 } },
        { t: "vital", name: "LCP", value: 1800, rating: "good", path: "/solutions" },
      ],
    });
    expect(res.status).toBe(204);
    await collect({ ...ids(1), events: [{ t: "leave", pv: "pv-0001-abcd", durationMs: 42000 }, { t: "pageview", pv: "pv-0002-abcd", path: "/cart" }] }, { beacon: true });

    const session = await AnalyticsSession.findOne();
    expect(session._id).toBe(hashId("s", "session-1-abcdef"));
    expect(session._id).not.toContain("session-1");
    expect(session.visitor).toBe(hashId("v", "visitor-1-abcdef"));
    expect(session).toMatchObject({ pageviews: 2, landingPath: "/solutions", exitPath: "/cart", referrer: "instagram.com", source: "instagram", signedIn: true });
    expect(session.utm.toObject()).toMatchObject({ source: "instagram", medium: "social", campaign: "diwali" });
    expect(session.device.toObject()).toEqual({ type: "mobile", browser: "Chrome", os: "Android" });
    expect(session.expiresAt.getTime()).toBeGreaterThan(Date.now() + 89 * 86400000);

    const views = await AnalyticsPageview.find().sort({ pv: 1 });
    expect(views.map((v) => v.path)).toEqual(["/solutions", "/cart"]);
    expect(views[0].durationMs).toBe(42000);
    expect((await AnalyticsEvent.findOne()).props.get("sku")).toBe("MM-MEN-THERAPY");
    expect(await AnalyticsVital.countDocuments({ name: "LCP" })).toBe(1);
  });

  it("ignores repeated beacons, bots, and caps time on page", async () => {
    const batch = { ...ids(2), events: [{ t: "pageview", pv: "pv-0001-abcd", path: "/" }] };
    await collect(batch);
    expect((await collect(batch)).status).toBe(204);
    expect(await AnalyticsPageview.countDocuments()).toBe(1);
    await collect({ ...ids(2), events: [{ t: "leave", pv: "pv-0001-abcd", durationMs: 5 * 3600000 }] });
    expect((await AnalyticsPageview.findOne()).durationMs).toBe(30 * 60000);

    await collect({ ...ids(3), events: [{ t: "pageview", pv: "pv-0009-abcd", path: "/" }] }, { ua: "Mozilla/5.0 (compatible; bingbot/2.0)" });
    expect(await AnalyticsSession.countDocuments()).toBe(1);
  });

  it("rejects malformed input and operator keys", async () => {
    expect((await collect({ ...ids(4), events: [] })).status).toBe(400);
    expect((await collect({ vid: "x", sid: "short", events: [{ t: "ping" }] })).status).toBe(400);
    expect((await collect({ ...ids(4), events: [{ t: "pageview", pv: "pv-0001-abcd", path: "https://evil.example/" }] })).status).toBe(400);
    expect((await collect({ ...ids(4), events: [{ t: "event", name: "Click Me" }] })).status).toBe(400);
    expect((await collect({ ...ids(4), events: [{ t: "event", name: "x", props: { $where: "1" } }] })).status).toBe(400);
    expect((await collect({ ...ids(4), extra: 1, events: [{ t: "ping" }] })).status).toBe(400);
    const bad = await request(app).post("/api/analytics/collect").set("Content-Type", "text/plain").send("{nope");
    expect(bad.status).toBe(400);
    expect(await AnalyticsSession.countDocuments()).toBe(0);
  });

  it("stops recording past the daily cap per IP without telling the client", async () => {
    const capped = build({ ANALYTICS_DAILY_MAX: "2" });
    for (let i = 0; i < 4; i += 1) {
      const res = await collect({ ...ids(5), events: [{ t: "pageview", pv: `pv-000${i}-abcd`, path: "/" }] }, { target: capped });
      expect(res.status).toBe(204);
    }
    expect(await AnalyticsPageview.countDocuments()).toBe(2);
  });

  it("rate-limits bursts per minute", async () => {
    const limited = build({ ANALYTICS_RATE_MAX: "2" });
    const statuses = [];
    for (let i = 0; i < 3; i += 1) statuses.push((await collect({ ...ids(6), events: [{ t: "ping" }] }, { target: limited })).status);
    expect(statuses).toEqual([204, 204, 429]);
  });
});

describe("consent records", () => {
  it("records every choice, linking the account when signed in", async () => {
    const me = await registerUser(app);
    await request(app).post("/api/analytics/consent").set("User-Agent", MAC_UA).send({ vid: "visitor-7-abcdef", action: "essential_only", analytics: false, policyVersion: "2026-10" }).expect(204);
    await request(app).post("/api/analytics/consent").set(bearer(me.accessToken)).send({ vid: "visitor-7-abcdef", action: "accept_all", analytics: true, policyVersion: "2026-10" }).expect(204);
    // A bad token doesn't block the record; it just isn't linked.
    await request(app).post("/api/analytics/consent").set(bearer("nope")).send({ vid: "visitor-7-abcdef", action: "withdraw", analytics: false, policyVersion: "2026-10" }).expect(204);

    const rows = await ConsentRecord.find().sort({ at: 1, _id: 1 });
    expect(rows.map((r) => [r.action, r.analytics, r.user ? String(r.user) : null])).toEqual([
      ["essential_only", false, null],
      ["accept_all", true, me.user.id],
      ["withdraw", false, null],
    ]);
    expect(rows[0].visitor).toBe(hashId("v", "visitor-7-abcdef"));
    expect(rows[0].userAgent).toContain("Macintosh");
    expect(rows[0].expiresAt.getTime()).toBeGreaterThan(Date.now() + 390 * 86400000);

    expect((await request(app).post("/api/analytics/consent").send({ vid: "visitor-7-abcdef", action: "maybe", analytics: true, policyVersion: "1" })).status).toBe(400);
  });
});

describe("web analytics dashboard", () => {
  async function traffic() {
    await collect({ ...ids(10), events: [{ t: "pageview", pv: "pv-0001-abcd", path: "/" }, { t: "pageview", pv: "pv-0002-abcd", path: "/solutions" }, { t: "event", name: "add_to_cart" }, { t: "vital", name: "LCP", value: 2000, rating: "good" }] });
    await collect({ ...ids(11), events: [{ t: "pageview", pv: "pv-0001-abcd", path: "/", referrer: "https://www.google.com/" }, { t: "vital", name: "LCP", value: 5000, rating: "poor" }, { t: "vital", name: "CLS", value: 0.05, rating: "good" }] }, { ua: MAC_UA });
    // Same visitor, second session.
    await collect({ vid: ids(10).vid, sid: "session-12-abcdef", events: [{ t: "pageview", pv: "pv-0001-abcd", path: "/solutions" }] });
    await request(app).post("/api/analytics/consent").send({ vid: "visitor-10-abcdef", action: "accept_all", analytics: true, policyVersion: "2026-10" });
    await request(app).post("/api/analytics/consent").send({ vid: "visitor-13-abcdef", action: "essential_only", analytics: false, policyVersion: "2026-10" });
    await request(app).post("/api/analytics/consent").send({ vid: "visitor-14-abcdef", action: "custom", analytics: true, policyVersion: "2026-10" });
  }

  it("is admin-only", async () => {
    const staff = await registerAs(app, "staff");
    const customer = await registerUser(app);
    expect((await request(app).get("/api/admin/analytics/web").set(bearer(staff.accessToken))).status).toBe(403);
    expect((await request(app).get("/api/admin/analytics/live").set(bearer(customer.accessToken))).status).toBe(403);
    expect((await request(app).get("/api/admin/analytics/web")).status).toBe(401);
  });

  it("reports traffic, sources, devices, events, vitals and consent for the range", async () => {
    const admin = await registerAs(app, "admin");
    await traffic();
    const res = await request(app).get("/api/admin/analytics/web").set(bearer(admin.accessToken));
    expect(res.status).toBe(200);
    const r = res.body;
    expect(r.range.days).toBe(30);
    expect(r.kpis).toMatchObject({ pageviews: 4, sessions: 3, visitors: 2, bounceRate: 2 / 3, pagesPerSession: 4 / 3 });
    expect(r.previous.pageviews).toBe(0);
    expect(r.trend).toHaveLength(30);
    expect(r.trend.at(-1)).toMatchObject({ key: istDay(new Date()), pageviews: 4, sessions: 3 });
    expect(r.topPages).toEqual([{ key: "/", count: 2 }, { key: "/solutions", count: 2 }]);
    expect(r.sources).toEqual([{ key: "direct", count: 2 }, { key: "google.com", count: 1 }]);
    expect(r.devices.types).toEqual([{ key: "mobile", count: 2 }, { key: "desktop", count: 1 }]);
    expect(r.events).toEqual([{ key: "add_to_cart", count: 1 }]);
    const lcp = r.vitals.find((v) => v.name === "LCP");
    expect(lcp).toMatchObject({ count: 2, average: 3500, good: 1, poor: 1 });
    expect(r.vitals.find((v) => v.name === "TTFB")).toMatchObject({ count: 0, average: null });
    expect(r.consent).toEqual({ total: 3, acceptAll: 1, essentialOnly: 1, custom: 1, withdraw: 0, analyticsOn: 2 });

    const live = await request(app).get("/api/admin/analytics/live").set(bearer(admin.accessToken));
    expect(live.body.activeNow).toBe(3);
    expect(live.body.pages[0]).toEqual({ key: "/solutions", count: 2 });

    expect((await request(app).get("/api/admin/analytics/web?from=2026-10-10&to=2026-10-01").set(bearer(admin.accessToken))).status).toBe(400);
  });

  it("stores finished days once and keeps totals after raw data is purged", async () => {
    const admin = await registerAs(app, "admin");
    await traffic();
    const yesterday = addDays(istDay(new Date()), -1);
    // Move all raw data to yesterday (India time).
    const shift = { $set: { at: new Date(`${yesterday}T12:00:00+05:30`) } };
    await Promise.all([AnalyticsPageview.updateMany({}, shift), AnalyticsEvent.updateMany({}, shift), AnalyticsVital.updateMany({}, shift), ConsentRecord.updateMany({}, shift)]);
    await AnalyticsSession.updateMany({}, { $set: { startedAt: new Date(`${yesterday}T12:00:00+05:30`), lastSeenAt: new Date(`${yesterday}T12:05:00+05:30`) } });

    expect((await request(app).post("/api/cron/analytics-rollup")).status).toBe(401);
    const cron = await request(app).post("/api/cron/analytics-rollup").set("x-cron-secret", CRON_SECRET);
    expect(cron.body.rolledUp).toContain(yesterday);
    const stored = await AnalyticsDaily.findById(yesterday).lean();
    expect(stored).toMatchObject({ pageviews: 4, sessions: 3, visitors: 2, bounces: 2 });
    expect(stored.durationMs).toBe(3 * 5 * 60000);

    // TTL purge (simulated): the dashboard still has the day's totals.
    await Promise.all([AnalyticsSession.deleteMany({}), AnalyticsPageview.deleteMany({}), AnalyticsEvent.deleteMany({}), AnalyticsVital.deleteMany({}), ConsentRecord.deleteMany({})]);
    const r = (await request(app).get(`/api/admin/analytics/web?from=${yesterday}&to=${yesterday}`).set(bearer(admin.accessToken))).body;
    expect(r.kpis).toMatchObject({ pageviews: 4, sessions: 3, avgSessionMs: 5 * 60000 });
    expect(r.consent.total).toBe(3);
    expect(await computeDay(yesterday)).toMatchObject({ pageviews: 0, sessions: 0 });
  });
});

describe("download my data", () => {
  it("returns everything linked to the account and nothing of anyone else's", async () => {
    const me = await registerUser(app, { name: "Kavya Iyer" });
    const other = await registerUser(app, { name: "Someone Else" });
    await request(app).post("/api/addresses").set(bearer(me.accessToken)).send({ fullName: "Kavya Iyer", phone: "9876543210", line1: "12 Lake Road", city: "Bengaluru", state: "Karnataka", pincode: "560001" }).expect(201);
    await order(me.user.id);
    await order(other.user.id);
    await NewsletterSubscriber.create({ email: me.email, status: "subscribed" });
    await request(app).post("/api/analytics/consent").set(bearer(me.accessToken)).send({ vid: "visitor-20-abcdef", action: "accept_all", analytics: true, policyVersion: "2026-10" });

    expect((await request(app).get("/api/me/data-export")).status).toBe(401);
    const res = await request(app).get("/api/me/data-export").set(bearer(me.accessToken));
    expect(res.status).toBe(200);
    expect(res.headers["content-disposition"]).toMatch(/attachment; filename="manushyam-my-data-\d{4}-\d{2}-\d{2}\.json"/);
    expect(res.headers["cache-control"]).toBe("no-store");
    const data = JSON.parse(res.text);
    expect(data.profile).toMatchObject({ name: "Kavya Iyer", email: me.email });
    expect(data.addresses).toHaveLength(1);
    expect(data.orders).toHaveLength(1);
    expect(data.orders[0]).toMatchObject({ status: "delivered", email: "kavya@example.com" });
    expect(data.orders[0].invoiceNumber).toMatch(/^MM\/26-27\//);
    expect(data.newsletter.status).toBe("subscribed");
    expect(data.cookieConsents).toEqual([expect.objectContaining({ choice: "accept_all", analytics: true })]);
    expect(res.text).not.toContain("passwordHash");
    expect(res.text).not.toContain(other.email);
  });

  it("is limited to a few downloads an hour", async () => {
    const me = await registerUser(app);
    const statuses = [];
    for (let i = 0; i < 6; i += 1) statuses.push((await request(app).get("/api/me/data-export").set(bearer(me.accessToken))).status);
    expect(statuses).toEqual([200, 200, 200, 200, 200, 429]);
  });
});

describe("delete my account", () => {
  const del = (session, body) => request(app).post("/api/me/delete").set(bearer(session.accessToken)).send(body);

  it("asks for the password and an explicit confirmation", async () => {
    const me = await registerUser(app);
    expect((await del(me, { password: "Wrong2025", confirm: "DELETE" })).status).toBe(400);
    const noConfirm = await del(me, { password: me.password, confirm: "delete" });
    expect(noConfirm.status).toBe(400);
    expect(noConfirm.body.error.details[0].message).toBe("Type DELETE to confirm");
    expect(await User.exists({ _id: me.user.id })).toBeTruthy();
  });

  it("refuses staff accounts and customers with orders still in progress", async () => {
    const staff = await registerAs(app, "staff");
    expect((await del(staff, { password: staff.password, confirm: "DELETE" })).status).toBe(403);

    const me = await registerUser(app);
    await order(me.user.id, { status: "shipped" });
    const res = await del(me, { password: me.password, confirm: "DELETE" });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("ORDERS_IN_PROGRESS");

    await Order.updateOne({ user: me.user.id }, { $set: { status: "delivered", "refund.status": "pending" } });
    expect((await del(me, { password: me.password, confirm: "DELETE" })).status).toBe(409);
  });

  it("deletes an account without orders completely; the email can sign up again", async () => {
    const me = await registerUser(app, { name: "Ravi Kumar" });
    await request(app).post("/api/addresses").set(bearer(me.accessToken)).send({ fullName: "Ravi Kumar", phone: "9876543210", line1: "1 MG Road", city: "Bengaluru", state: "Karnataka", pincode: "560001" });
    await NewsletterSubscriber.create({ email: me.email, status: "subscribed" });

    const res = await del(me, { password: me.password, confirm: "DELETE" });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ deleted: "deleted", anonymizedOrders: 0 });
    expect(res.headers["set-cookie"].join(";")).toMatch(/mm_rt=;/);
    expect(await User.exists({ _id: me.user.id })).toBeNull();
    expect(await Address.countDocuments({ user: me.user.id })).toBe(0);
    expect(await NewsletterSubscriber.countDocuments({ email: me.email })).toBe(0);
    expect(outbox.find((m) => m.to === me.email && m.meta?.purpose === "account-deleted")).toBeTruthy();

    // Old session and refresh cookie are dead.
    expect((await request(app).get("/api/me").set(bearer(me.accessToken))).status).toBe(401);
    expect((await request(app).post("/api/auth/refresh").set("Origin", ORIGIN).set("Cookie", me.cookie)).status).toBe(401);
    const again = await registerUser(app, { email: me.email });
    expect(again.user.email).toBe(me.email);
  });

  it("anonymises GST orders, removes reviews and personal data, and can't be restored", async () => {
    const me = await registerUser(app, { name: "Kavya Iyer" });
    const admin = await registerAs(app, "admin");
    const o = await order(me.user.id);
    const product = await Product.findOne({ "variants.sku": "MM-MEN-THERAPY" });
    await Review.create({ product: product._id, order: o._id, user: me.user.id, authorName: "Kavya I.", rating: 5, body: "Lovely oil, less hair fall." });
    await recomputeRating(product._id);
    await request(app).post("/api/analytics/consent").set(bearer(me.accessToken)).send({ vid: "visitor-30-abcdef", action: "accept_all", analytics: true, policyVersion: "2026-10" });

    const res = await del(me, { password: me.password, confirm: "DELETE" });
    expect(res.body).toEqual({ deleted: "anonymized", anonymizedOrders: 1 });

    const kept = await Order.findById(o._id).lean();
    expect(kept.email).toBe(`deleted-${me.user.id}@deleted.invalid`);
    expect(kept.customerName).toBe("Deleted customer");
    expect(kept.address).toEqual({ fullName: "Deleted customer", city: "Bengaluru", state: "Karnataka", pincode: "560001" });
    expect(kept.invoiceNumber).toBe(o.invoiceNumber);
    expect(kept.amounts.total).toBe(49900);

    const shell = await User.findById(me.user.id).lean();
    expect(shell).toMatchObject({ name: "Deleted customer", email: `deleted-${me.user.id}@deleted.invalid`, isActive: false });
    expect(shell.anonymizedAt).toBeTruthy();
    expect(shell.phone).toBeUndefined();
    expect(await Review.countDocuments({ user: me.user.id })).toBe(0);
    expect((await Product.findById(product._id)).rating.count).toBe(0);
    const consent = await ConsentRecord.findOne().lean();
    expect(consent.user).toBeUndefined();
    expect(outbox.find((m) => m.to === me.email && m.meta?.purpose === "account-deleted").text).toContain("1 past order");

    const login = await request(app).post("/api/auth/login").send({ email: me.email, password: me.password });
    expect(login.status).toBe(401);
    const restore = await request(app).post(`/api/admin/users/${me.user.id}/restore`).set(bearer(admin.accessToken));
    expect(restore.status).toBe(409);
    expect(restore.body.error.code).toBe("ANONYMIZED");
  });
});
