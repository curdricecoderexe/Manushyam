import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import request from "supertest";
import { createRequire } from "module";
import { buildApp, startDb, stopDb, clearDb, registerUser, registerAs, bearer } from "./helpers.mjs";

const require = createRequire(import.meta.url);
const { Product } = require("../Models/Product.js");
const { Order } = require("../Models/Order.js");
const { Chat } = require("../Models/Chat.js");
const { seedCatalog } = require("../Services/seed.js");
const { levelOf, istDay } = require("../Controller/dashboardController.js");

const app = buildApp();

beforeAll(startDb);
afterAll(stopDb);
beforeEach(async () => {
  await clearDb();
  await seedCatalog();
});

let n = 0;
async function order(user, { status, confirmed = true, total = 49900, daysAgo = 0, extra = {} }) {
  n += 1;
  const product = await Product.findOne();
  return Order.create({
    orderNumber: `MM261004-D${String(n).padStart(4, "0")}`,
    user,
    email: "c@example.com",
    items: [{ product: product._id, sku: "MM-MEN-THERAPY", name: "Therapy", price: total, qty: 1, lineTotal: total }],
    address: { fullName: "A B", phone: "9876543210", line1: "x", city: "Bengaluru", state: "Karnataka", pincode: "560001" },
    amounts: { subtotal: total, total },
    paymentMethod: "cod",
    status,
    holdsStock: false,
    ...(confirmed ? { invoiceNumber: `MM/26-27/D${n}` } : {}),
    createdAt: new Date(Date.now() - daysAgo * 86400000),
    ...extra,
  });
}

describe("staff dashboard", () => {
  it("summarises workload, 7-day orders (IST days), stock health and the support queue", async () => {
    const customer = await registerUser(app);
    const staff = await registerAs(app, "staff");
    const admin = await registerAs(app, "admin");
    const uid = customer.user.id;
    await order(uid, { status: "paid" });
    await order(uid, { status: "cod_confirmed", daysAgo: 1 });
    await order(uid, { status: "processing", daysAgo: 1 });
    await order(uid, { status: "packed", daysAgo: 2, extra: { shipment: { error: "No courier available" } } });
    await order(uid, { status: "shipped", daysAgo: 3 });
    await order(uid, { status: "cancelled", daysAgo: 3, total: 79900 });
    await order(uid, { status: "payment_pending", confirmed: false });
    await order(uid, { status: "delivered", daysAgo: 10 });

    await Product.updateOne({ "variants.sku": "MM-MEN-THERAPY" }, { $set: { "variants.$.stock": 0 } });
    await Product.updateOne({ "variants.sku": "MM-WOMEN-THERAPY" }, { $set: { "variants.$.stock": 3 } });
    await Product.updateOne({ "variants.sku": "MM-MEN-COMBO" }, { $set: { "variants.$.stock": 12 } });
    await Chat.create({ customer: uid, status: "pending" });

    const res = await request(app).get("/api/admin/dashboard").set(bearer(staff.accessToken));
    expect(res.status).toBe(200);
    expect(res.body.fulfilment).toEqual({ toProcess: 2, processing: 1, packed: 1, inTransit: 1, needsAttention: 1 });
    expect(res.body.ordersByDay).toHaveLength(7);
    expect(res.body.ordersByDay.at(-1)).toEqual({ date: istDay(new Date()), orders: 1 });
    expect(res.body.ordersByDay.reduce((s, d) => s + d.orders, 0)).toBe(6);
    expect(res.body.today).toEqual({ orders: 1 });
    expect(JSON.stringify(res.body)).not.toContain("revenue");
    expect(res.body.stock).toMatchObject({ out: 1, critical: 1, low: 1, healthy: 1 });
    expect(res.body.stock.watch.map((w) => [w.sku, w.level])).toEqual([
      ["MM-MEN-THERAPY", "out"],
      ["MM-WOMEN-THERAPY", "critical"],
      ["MM-MEN-COMBO", "low"],
    ]);
    expect(res.body.support).toEqual({ pending: 1, active: 0, mine: 0 });

    const asAdmin = await request(app).get("/api/admin/dashboard").set(bearer(admin.accessToken));
    expect(asAdmin.body.today).toEqual({ orders: 1, revenue: 49900 });
    // Cancelled orders count as orders but not as revenue.
    expect(asAdmin.body.ordersByDay.reduce((s, d) => s + d.revenue, 0)).toBe(5 * 49900);
  });

  it("classifies stock levels", () => {
    expect([0, 1, 5, 6, 20, 21].map(levelOf)).toEqual(["out", "critical", "critical", "low", "low", "healthy"]);
  });
});

describe("staff permissions (enforced on the server)", () => {
  const id = "0123456789abcdef01234567";
  // [method, path, body] — admin-only endpoints staff must never reach.
  const ADMIN_ONLY = [
    ["post", `/api/admin/orders/${id}/refund`, {}],
    ["get", "/api/admin/coupons"],
    ["post", "/api/admin/coupons", { code: "X10", type: "percent", value: 10 }],
    ["get", "/api/admin/delivery"],
    ["put", "/api/admin/delivery", {}],
    ["get", "/api/admin/pincode-rules"],
    ["get", "/api/admin/settings"],
    ["put", "/api/admin/settings", {}],
    ["get", "/api/admin/hero-slides"],
    ["get", "/api/admin/faqs"],
    ["get", "/api/admin/pages"],
    ["delete", `/api/admin/products/${id}`],
    ["get", "/api/admin/reviews"],
    ["get", "/api/admin/blog/posts"],
    ["get", "/api/admin/newsletter"],
    ["get", "/api/chat/admin/all"],
    // M9
    ["get", "/api/admin/users"],
    ["get", `/api/admin/users/${id}`],
    ["post", "/api/admin/users", { name: "New Person", email: "new@example.com" }],
    ["patch", `/api/admin/users/${id}`, { role: "admin" }],
    ["delete", `/api/admin/users/${id}`],
    ["post", `/api/admin/users/${id}/restore`],
    ["get", "/api/admin/appearance"],
    ["put", "/api/admin/appearance/authPanel", { url: "https://x.example/a.jpg" }],
    ["delete", "/api/admin/appearance/authPanel"],
    ["get", "/api/admin/analytics/sales"],
    ["get", "/api/admin/analytics/sales.pdf"],
    ["get", "/api/admin/analytics/web"],
    ["get", "/api/admin/analytics/live"],
    ["get", "/api/admin/audit-logs"],
    ["get", "/api/admin/pincode-rules/export"],
    ["post", "/api/admin/pincode-rules/import"],
    ["post", "/api/admin/pincode-rules/bulk", { ids: [id], action: "delete" }],
    ["delete", `/api/admin/coupons/${id}`],
    ["post", "/api/admin/hero-slides", {}],
    ["patch", `/api/admin/faqs/${id}`, {}],
    ["post", "/api/admin/blog/posts", {}],
    ["patch", `/api/admin/reviews/${id}`, { status: "hidden" }],
  ];
  // Staff work: fulfilment, inventory, support.
  const STAFF_OK = [
    ["get", "/api/admin/dashboard"],
    ["get", "/api/admin/orders"],
    ["get", "/api/admin/products"],
    ["get", "/api/chat/staff/queue"],
    ["get", "/api/chat/staff/active"],
    ["get", "/api/admin/contact-messages"],
    ["get", "/api/admin/orders-export"],
  ];
  const call = (method, path, token, body) => {
    const r = request(app)[method](path).set(bearer(token));
    return body ? r.send(body) : r;
  };

  it("lets staff do fulfilment, inventory and support — and nothing admin-only", async () => {
    const staff = await registerAs(app, "staff");
    for (const [method, path, body] of STAFF_OK) expect([method, path, (await call(method, path, staff.accessToken, body)).status]).toEqual([method, path, 200]);
    for (const [method, path, body] of ADMIN_ONLY) expect([method, path, (await call(method, path, staff.accessToken, body)).status]).toEqual([method, path, 403]);
  });

  it("keeps customers out of every staff endpoint, and anonymous callers get 401", async () => {
    const customer = await registerUser(app);
    for (const [method, path, body] of [...STAFF_OK, ...ADMIN_ONLY]) {
      expect([path, (await call(method, path, customer.accessToken, body)).status]).toEqual([path, 403]);
      expect([path, (await request(app)[method](path)).status]).toEqual([path, 401]);
    }
  });

  it("hides cost and supplier fields from staff but not admins", async () => {
    await Product.updateOne({ slug: "men-anti-hairfall-therapy" }, { $set: { internal: { costPrice: 12000, supplier: "Herbal Co" } } });
    const staff = await registerAs(app, "staff");
    const admin = await registerAs(app, "admin");
    const asStaff = await request(app).get("/api/admin/products?q=men-anti-hairfall-therapy").set(bearer(staff.accessToken));
    const asAdmin = await request(app).get("/api/admin/products?q=men-anti-hairfall-therapy").set(bearer(admin.accessToken));
    expect(asStaff.body.products[0].internal).toBeUndefined();
    expect(asAdmin.body.products[0].internal).toMatchObject({ costPrice: 12000, supplier: "Herbal Co" });
  });
});
