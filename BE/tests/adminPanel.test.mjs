import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import request from "supertest";
import { createRequire } from "module";
import { buildApp, startDb, stopDb, clearDb, registerUser, registerAs, bearer, outbox, ORIGIN } from "./helpers.mjs";

const require = createRequire(import.meta.url);
const { User } = require("../Models/User.js");
const { Order } = require("../Models/Order.js");
const { Product } = require("../Models/Product.js");
const { PincodeRule } = require("../Models/Delivery.js");
const { AuditLog } = require("../Models/AuditLog.js");
const { seedCatalog } = require("../Services/seed.js");
const { flushAudit, diff } = require("../Services/audit.js");
const { drainMailQueue } = require("../Services/mailQueue.js");
const { parseCsv, toCsv } = require("../Services/csv.js");
const { resolveRange, istDay, addDays } = require("../Services/salesAnalytics.js");

const app = buildApp();

beforeAll(startDb);
afterAll(stopDb);
beforeEach(async () => {
  await clearDb();
  await seedCatalog();
});

let n = 0;
async function order(user, { status = "delivered", paymentMethod = "cod", total = 49900, qty = 1, sku = "MM-MEN-THERAPY", daysAgo = 0, confirmed = true, extra = {} } = {}) {
  n += 1;
  const product = await Product.findOne({ "variants.sku": sku });
  return Order.create({
    orderNumber: `MM261016-A${String(n).padStart(4, "0")}`,
    user,
    email: "c@example.com",
    items: [{ product: product._id, sku, name: product.name, variantLabel: "Kit", price: total / qty, qty, lineTotal: total }],
    address: { fullName: "A B", phone: "9876543210", line1: "x", city: "Bengaluru", state: "Karnataka", pincode: "560001" },
    amounts: { subtotal: total, total },
    paymentMethod,
    status,
    history: [{ status, at: new Date(), source: "system" }],
    holdsStock: false,
    ...(confirmed ? { invoiceNumber: `MM/26-27/A${n}` } : {}),
    createdAt: new Date(Date.now() - daysAgo * 86400000),
    ...extra,
  });
}

describe("users", () => {
  it("lists users with order stats, filters by role/status and searches", async () => {
    const admin = await registerAs(app, "admin");
    const customer = await registerUser(app, { name: "Kavya Iyer" });
    await registerAs(app, "staff");
    await order(customer.user.id, { total: 49900 });
    await order(customer.user.id, { total: 79900, status: "cancelled" });
    const auth = bearer(admin.accessToken);

    const all = await request(app).get("/api/admin/users").set(auth);
    expect(all.status).toBe(200);
    expect(all.body.total).toBe(3);
    expect(all.body.counts).toEqual({ admin: 1, staff: 1, customer: 1 });
    const kavya = all.body.users.find((u) => u.email === customer.email);
    expect(kavya).toMatchObject({ name: "Kavya Iyer", role: "customer", isActive: true, orders: 2, spent: 49900 });
    expect(kavya.passwordHash).toBeUndefined();

    expect((await request(app).get("/api/admin/users?role=staff").set(auth)).body.users).toHaveLength(1);
    expect((await request(app).get("/api/admin/users?q=kavya").set(auth)).body.users.map((u) => u.email)).toEqual([customer.email]);
    expect((await request(app).get("/api/admin/users?q=.*").set(auth)).body.users).toHaveLength(0);

    const detail = await request(app).get(`/api/admin/users/${customer.user.id}`).set(auth);
    expect(detail.body.recentOrders).toHaveLength(2);
    expect(detail.body.user.spent).toBe(49900);
  });

  it("creates an account with an invite email, and rejects duplicates", async () => {
    const admin = await registerAs(app, "admin");
    const auth = bearer(admin.accessToken);
    const res = await request(app).post("/api/admin/users").set(auth).send({ name: "Meera Staff", email: "Meera@Example.com", role: "staff" });
    expect(res.status).toBe(201);
    expect(res.body.user).toMatchObject({ email: "meera@example.com", role: "staff", isActive: true });
    await drainMailQueue();
    const invite = outbox.find((m) => m.to === "meera@example.com");
    expect(invite.subject).toBe("Your ManushyaM account is ready");
    expect(invite.html).toContain("/forgot-password");
    expect((await request(app).post("/api/admin/users").set(auth).send({ name: "Again", email: "meera@example.com" })).status).toBe(409);
    expect((await request(app).post("/api/admin/users").set(auth).send({ name: "X", email: "bad" })).status).toBe(400);
    expect((await request(app).post("/api/admin/users").set(auth).send({ name: "Mass", email: "m@example.com", isActive: false, tokenVersion: 9 })).status).toBe(400);
  });

  it("changes roles and deactivates — ending the user's sessions — but never leaves the store without an admin", async () => {
    const admin = await registerAs(app, "admin");
    const auth = bearer(admin.accessToken);
    const target = await registerUser(app);

    const promoted = await request(app).patch(`/api/admin/users/${target.user.id}`).set(auth).send({ role: "staff" });
    expect(promoted.body.user.role).toBe("staff");
    // The old token (and its refresh cookie) stop working; a new sign-in carries the new role.
    expect((await request(app).get("/api/me").set(bearer(target.accessToken))).status).toBe(401);
    expect((await request(app).post("/api/auth/refresh").set("Origin", ORIGIN).set("Cookie", target.cookie)).status).toBe(401);

    expect((await request(app).patch(`/api/admin/users/${target.user.id}`).set(auth).send({ isActive: false })).body.user.isActive).toBe(false);
    expect((await request(app).post("/api/auth/login").send({ email: target.email, password: target.password })).status).toBe(401);
    expect((await request(app).patch(`/api/admin/users/${target.user.id}`).set(auth).send({ isActive: true })).body.user.isActive).toBe(true);

    // Self-demotion and removing the last admin are refused.
    expect((await request(app).patch(`/api/admin/users/${admin.user.id}`).set(auth).send({ role: "customer" })).body.error.code).toBe("SELF_CHANGE");
    expect((await request(app).patch(`/api/admin/users/${admin.user.id}`).set(auth).send({ isActive: false })).body.error.code).toBe("SELF_CHANGE");
    // Another admin can demote this one; the demoted admin's session ends at once.
    const second = await registerAs(app, "admin");
    expect((await request(app).patch(`/api/admin/users/${admin.user.id}`).set(bearer(second.accessToken)).send({ role: "staff" })).status).toBe(200);
    expect((await request(app).get("/api/admin/users").set(auth)).status).toBe(401);
  });

  it("soft-deletes and restores; hard delete only for accounts without orders", async () => {
    const admin = await registerAs(app, "admin");
    const auth = bearer(admin.accessToken);
    const buyer = await registerUser(app);
    const browser = await registerUser(app);
    await order(buyer.user.id);

    expect((await request(app).delete(`/api/admin/users/${buyer.user.id}?mode=hard`).set(auth)).body.error.code).toBe("HAS_ORDERS");
    expect((await request(app).delete(`/api/admin/users/${buyer.user.id}`).set(auth)).body).toEqual({ deleted: "soft" });
    expect((await request(app).get("/api/me").set(bearer(buyer.accessToken))).status).toBe(401);
    expect((await request(app).get("/api/admin/users?status=deleted").set(auth)).body.users.map((u) => u.id)).toEqual([buyer.user.id]);
    expect((await request(app).patch(`/api/admin/users/${buyer.user.id}`).set(auth).send({ name: "X Y" })).body.error.code).toBe("USER_DELETED");
    const restored = await request(app).post(`/api/admin/users/${buyer.user.id}/restore`).set(auth);
    expect(restored.body.user).toMatchObject({ isActive: true, deletedAt: null });
    expect((await request(app).post("/api/auth/login").send({ email: buyer.email, password: buyer.password })).status).toBe(200);

    expect((await request(app).delete(`/api/admin/users/${browser.user.id}?mode=hard`).set(auth)).body).toEqual({ deleted: "hard" });
    expect(await User.findById(browser.user.id)).toBeNull();
    expect((await request(app).delete(`/api/admin/users/${admin.user.id}`).set(auth)).body.error.code).toBe("SELF_CHANGE");
  });
});

describe("audit log", () => {
  it("records staff and admin writes with actor, before/after diff and IP — and nothing for reads or failures", async () => {
    const admin = await registerAs(app, "admin");
    const staff = await registerAs(app, "staff");
    const auth = bearer(admin.accessToken);

    const coupon = await request(app).post("/api/admin/coupons").set(auth).send({ code: "AUDIT10", type: "percent", value: 10 });
    await request(app).patch(`/api/admin/coupons/${coupon.body.coupon.id}`).set(auth).send({ minOrder: 50000 });
    await request(app).put("/api/admin/settings").set(auth).send({ heroSubline: "New subline" });
    await request(app).post("/api/admin/coupons").set(auth).send({ code: "AUDIT10", type: "percent", value: 10 }); // 409: not logged
    await request(app).get("/api/admin/coupons").set(auth);
    const product = await Product.findOne({ "variants.sku": "MM-MEN-THERAPY" });
    await request(app).patch(`/api/admin/products/${product._id}/stock`).set(bearer(staff.accessToken)).send({ sku: "MM-MEN-THERAPY", stock: 7 });
    await request(app).post("/api/admin/faqs").set(auth).send({ question: "Is it safe for kids?", answer: "Ask your doctor.", topic: "product" });
    await flushAudit();

    const logs = await AuditLog.find().sort({ createdAt: 1 }).lean();
    expect(logs.map((l) => l.action)).toEqual(["coupon.create", "coupon.update", "settings.update", "product.stock", "faq.create"]);
    const update = logs[1];
    expect(update).toMatchObject({ actorEmail: admin.email, actorRole: "admin", resource: "coupon", resourceId: coupon.body.coupon.id, before: { minOrder: 0 }, after: { minOrder: 50000 }, method: "PATCH", status: 200 });
    expect(update.ip).toBeTruthy();
    expect(logs[2].after).toEqual({ heroSubline: "New subline" });
    expect(logs[3]).toMatchObject({ actorRole: "staff", summary: "MM-MEN-THERAPY: 50 → 7".replace("50", String(product.variants.find((v) => v.sku === "MM-MEN-THERAPY").stock)) });

    const page = await request(app).get("/api/admin/audit-logs?resource=coupon").set(auth);
    expect(page.body.entries.map((e) => e.action)).toEqual(["coupon.update", "coupon.create"]);
    expect(page.body.facets.resources).toEqual(expect.arrayContaining(["coupon", "settings", "product", "faq"]));
    expect(page.body.facets.actors.map((a) => a.email).sort()).toEqual([admin.email, staff.email].sort());
    expect((await request(app).get(`/api/admin/audit-logs?actor=${staff.user.id}`).set(auth)).body.total).toBe(1);
    expect((await request(app).get("/api/admin/audit-logs").set(bearer(staff.accessToken))).status).toBe(403);
  });

  it("falls back to a description from the route and masks secrets", async () => {
    const admin = await registerAs(app, "admin");
    const customer = await registerUser(app);
    const { Chat } = require("../Models/Chat.js");
    const chat = await Chat.create({ customer: customer.user.id, status: "pending" });
    await request(app).post(`/api/chat/${chat._id}/accept`).set(bearer(admin.accessToken));
    await request(app).post("/api/cart/validate").set(bearer(customer.accessToken)).send({ items: [] }); // customer: never logged
    await flushAudit();
    const logs = await AuditLog.find().lean();
    expect(logs.map((l) => [l.action, l.resourceId])).toEqual([["chat.accept", String(chat._id)]]);
    expect(diff({ a: 1, password: "x" }, { a: 2, password: "y" })).toEqual({ before: { a: 1 }, after: { a: 2 } });
    expect(diff(undefined, { passwordHash: "h", note: "n".repeat(500) }).after).toEqual({ passwordHash: "••••", note: `${"n".repeat(400)}… (500 chars)` });
  });
});

describe("appearance", () => {
  it("lets admins override whitelisted storefront images and reset them", async () => {
    const admin = await registerAs(app, "admin");
    const auth = bearer(admin.accessToken);
    expect((await request(app).get("/api/appearance")).body).toEqual({ slots: {} });
    const set = await request(app).put("/api/admin/appearance/authPanel").set(auth).send({ url: "https://res.cloudinary.com/x/image/upload/a.jpg", alt: "Herbs" });
    expect(set.body.slots.authPanel).toEqual({ url: "https://res.cloudinary.com/x/image/upload/a.jpg", alt: "Herbs" });
    expect((await request(app).get("/api/appearance")).body.slots.authPanel.alt).toBe("Herbs");
    expect((await request(app).put("/api/admin/appearance/notASlot").set(auth).send({ url: "https://x.y/a.jpg" })).status).toBe(400);
    expect((await request(app).put("/api/admin/appearance/blogHero").set(auth).send({ url: "javascript:alert(1)" })).status).toBe(400);
    expect((await request(app).delete("/api/admin/appearance/authPanel").set(auth)).body.slots).toEqual({});
  });
});

describe("PIN rules CSV and bulk actions", () => {
  const csv = [
    "pincode,city,state,serviceable,cod_available,standard_fee_rupees,eta_min_days,eta_max_days,express_available,note,active",
    "560001,Bengaluru,karnataka,yes,yes,0,1,3,yes,,yes",
    '110,"Delhi, NCR",Delhi,yes,no,49.5,2,5,no,"Region ""110""",yes',
  ].join("\n");

  it("imports (creating and updating), then exports a round-trippable file", async () => {
    const admin = await registerAs(app, "admin");
    const auth = bearer(admin.accessToken);
    await PincodeRule.create({ pincode: "560001", city: "Old", codAvailable: false });
    const res = await request(app).post("/api/admin/pincode-rules/import").set(auth).attach("file", Buffer.from(csv), "rules.csv");
    expect(res.body).toEqual({ total: 2, created: 1, updated: 1 });
    const delhi = await PincodeRule.findOne({ pincode: "110" }).lean();
    expect(delhi).toMatchObject({ city: "Delhi, NCR", state: "Delhi", codAvailable: false, standardFee: 4950, eta: { min: 2, max: 5 }, note: 'Region "110"' });
    expect((await PincodeRule.findOne({ pincode: "560001" })).state).toBe("Karnataka");

    const out = await request(app).get("/api/admin/pincode-rules/export").set(auth);
    expect(out.headers["content-type"]).toContain("text/csv");
    const rows = parseCsv(out.text);
    expect(rows[0][0]).toBe("pincode");
    expect(rows.find((r) => r[0] === "110")).toEqual(["110", "Delhi, NCR", "Delhi", "yes", "no", "49.5", "2", "5", "no", 'Region "110"', "yes"]);
    const again = await request(app).post("/api/admin/pincode-rules/import").set(auth).attach("file", Buffer.from(out.text), "export.csv");
    expect(again.body).toEqual({ total: 2, created: 0, updated: 2 });
  });

  it("rejects the whole file when any row is invalid, naming the lines", async () => {
    const admin = await registerAs(app, "admin");
    const bad = ["pincode,state,cod_available,eta_min_days", "560001,Karnataka,maybe,", "01234,,,", "560001,Atlantis,yes,2"].join("\n");
    const res = await request(app).post("/api/admin/pincode-rules/import").set(bearer(admin.accessToken)).attach("file", Buffer.from(bad), "bad.csv");
    expect(res.status).toBe(400);
    const messages = res.body.error.details.map((d) => `${d.path}: ${d.message}`);
    expect(messages).toEqual(expect.arrayContaining([expect.stringMatching(/^line 2: cod_available/), expect.stringMatching(/^line 3: pincode/), expect.stringMatching(/^line 4: state/), expect.stringMatching(/^line 4: eta/)]));
    expect(await PincodeRule.countDocuments()).toBe(0);
    expect((await request(app).post("/api/admin/pincode-rules/import").set(bearer(admin.accessToken)).attach("file", Buffer.from("city\nX"), "x.csv")).status).toBe(400);
  });

  it("activates, deactivates and deletes in bulk", async () => {
    const admin = await registerAs(app, "admin");
    const auth = bearer(admin.accessToken);
    const rules = await PincodeRule.insertMany([{ pincode: "560001" }, { pincode: "560002" }, { pincode: "560003" }]);
    const ids = rules.slice(0, 2).map((r) => String(r._id));
    expect((await request(app).post("/api/admin/pincode-rules/bulk").set(auth).send({ ids, action: "deactivate" })).body).toEqual({ affected: 2 });
    expect(await PincodeRule.countDocuments({ isActive: false })).toBe(2);
    await request(app).post("/api/admin/pincode-rules/bulk").set(auth).send({ ids, action: "delete" });
    expect(await PincodeRule.countDocuments()).toBe(1);
  });

  it("writes CSV that spreadsheets won't execute", () => {
    expect(toCsv(["a"], [["=HYPERLINK(1)"], ["-5"], ['say "hi", ok']])).toBe('a\r\n\'=HYPERLINK(1)\r\n-5\r\n"say ""hi"", ok"\r\n');
  });
});

describe("sales analytics", () => {
  it("reports revenue, AOV, trend, top products, new vs returning, payment mix and RTO for an IST range", async () => {
    const admin = await registerAs(app, "admin");
    const a = (await registerUser(app)).user.id;
    const b = (await registerUser(app)).user.id;
    await order(a, { daysAgo: 40, total: 30000 }); // a's first order: before the range
    await order(a, { daysAgo: 2, total: 50000, paymentMethod: "razorpay" });
    await order(b, { daysAgo: 1, total: 100000, qty: 2, sku: "MM-WOMEN-THERAPY" });
    await order(b, { daysAgo: 1, total: 20000, status: "cancelled" });
    await order(b, { daysAgo: 0, total: 40000, status: "rto" });
    await order(b, { daysAgo: 0, total: 99999, status: "payment_pending", confirmed: false });
    await order(a, { daysAgo: 0, total: 60000, paymentMethod: "razorpay", extra: { refund: { status: "processed", amount: 10000 } } });

    const res = await request(app).get("/api/admin/analytics/sales").set(bearer(admin.accessToken));
    expect(res.status).toBe(200);
    const { kpis, previous, trend, topProducts, customers, payments, rto, range } = res.body;
    expect(range).toMatchObject({ days: 30, granularity: "day", to: istDay(new Date()) });
    // Kept orders: 50000 + 100000 + 40000 + (60000 − 10000 refunded) = 240000 over 4 orders.
    expect(kpis).toMatchObject({ orders: 5, cancelled: 1, revenue: 240000, aov: 60000, units: 5, refunds: 10000, customers: 2 });
    expect(previous).toMatchObject({ orders: 1, revenue: 30000 });
    expect(trend).toHaveLength(30);
    expect(trend.reduce((s, d) => s + d.revenue, 0)).toBe(240000);
    expect(topProducts[0]).toMatchObject({ sku: "MM-MEN-THERAPY", qty: 3, revenue: 150000 });
    expect(customers).toEqual({ new: { customers: 1, orders: 2, revenue: 140000 }, returning: { customers: 1, orders: 2, revenue: 100000 } });
    expect(payments).toEqual([
      { method: "razorpay", orders: 2, revenue: 100000, aov: 50000 },
      { method: "cod", orders: 3, revenue: 140000, aov: 70000 },
    ]);
    expect(rto).toMatchObject({ delivered: 3, rto: 1, codRto: 1, rate: 0.25 });
  });

  it("groups long ranges by month, validates ranges and exports a PDF", async () => {
    const admin = await registerAs(app, "admin");
    const auth = bearer(admin.accessToken);
    const r = resolveRange({ from: "2026-01-15", to: "2026-06-10" });
    expect(r.granularity).toBe("month");
    expect(r.previous.to).toBe("2026-01-14");
    expect(r.since.toISOString()).toBe("2026-01-14T18:30:00.000Z");
    expect(addDays("2026-02-28", 1)).toBe("2026-03-01");
    const month = await request(app).get("/api/admin/analytics/sales?from=2026-01-15&to=2026-06-10").set(auth);
    expect(month.body.trend.map((t) => t.key)).toEqual(["2026-01", "2026-02", "2026-03", "2026-04", "2026-05", "2026-06"]);
    expect((await request(app).get("/api/admin/analytics/sales?from=2025-01-01&to=2026-06-10").set(auth)).status).toBe(400);
    expect((await request(app).get("/api/admin/analytics/sales?from=2026-06-10&to=2026-06-01").set(auth)).status).toBe(400);

    const pdf = await request(app).get("/api/admin/analytics/sales.pdf").set(auth).buffer(true).parse((res, cb) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => cb(null, Buffer.concat(chunks)));
    });
    expect(pdf.headers["content-type"]).toBe("application/pdf");
    expect(pdf.body.subarray(0, 5).toString()).toBe("%PDF-");
  });
});

describe("orders export", () => {
  it("returns flat rows filtered by IST dates and status, for staff and admins", async () => {
    const staff = await registerAs(app, "staff");
    const c = (await registerUser(app)).user.id;
    await order(c, { daysAgo: 0, status: "packed" });
    await order(c, { daysAgo: 5, status: "delivered" });
    const today = istDay(new Date());
    const res = await request(app).get(`/api/admin/orders-export?from=${today}&to=${today}`).set(bearer(staff.accessToken));
    expect(res.body.rows).toHaveLength(1);
    expect(res.body.rows[0]).toMatchObject({ status: "packed", items: "MM-MEN-THERAPY × 1", total: 49900, pincode: "560001" });
    expect((await request(app).get("/api/admin/orders-export?status=delivered,packed").set(bearer(staff.accessToken))).body.rows).toHaveLength(2);
  });
});
