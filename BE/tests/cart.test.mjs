import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import request from "supertest";
import mongoose from "mongoose";
import { createRequire } from "module";
import { buildApp, startDb, stopDb, clearDb, registerUser, registerAs, bearer } from "./helpers.mjs";

const require = createRequire(import.meta.url);
const { Product } = require("../Models/Product.js");
const { Cart } = require("../Models/Cart.js");
const { Coupon, CouponRedemption } = require("../Models/Coupon.js");
const { seedCatalog } = require("../Services/seed.js");
const coupons = require("../Services/coupons.js");

const app = buildApp();
const MEN = "MM-MEN-THERAPY"; // ₹499
const COMBO = "MM-MEN-COMBO"; // ₹799

beforeAll(async () => {
  await startDb();
  await Promise.all([Product.syncIndexes(), CouponRedemption.syncIndexes(), Coupon.syncIndexes()]);
});
afterAll(stopDb);
beforeEach(async () => {
  await clearDb();
  await seedCatalog();
});

const setStock = (sku, stock) => Product.updateOne({ "variants.sku": sku }, { $set: { "variants.$.stock": stock } }).then(() => Product.findOne({ "variants.sku": sku }).then((p) => p.save()));

describe("guest cart validation", () => {
  it("prices everything on the server from SKUs and quantities", async () => {
    const res = await request(app).post("/api/cart/validate").send({ items: [{ sku: MEN, qty: 2 }, { sku: COMBO, qty: 1 }] });
    expect(res.status).toBe(200);
    expect(res.body.cart).toMatchObject({ count: 3, subtotal: 2 * 49900 + 79900, discount: 0, shipping: 0, total: 179700, canCheckout: true, issues: [] });
    expect(res.body.cart.lines[0]).toMatchObject({ sku: MEN, name: "Men Anti-Hairfall Therapy", price: 49900, qty: 2, lineTotal: 99800, inStock: true, lowStock: null });
    expect(res.headers["cache-control"]).toBe("no-store");
  });

  it("ignores any client-sent price and rejects unknown fields", async () => {
    const res = await request(app).post("/api/cart/validate").send({ items: [{ sku: MEN, qty: 1, price: 1 }] });
    expect(res.status).toBe(400);
    const tampered = await request(app).post("/api/cart/validate").send({ items: [{ sku: MEN, qty: 1 }], total: 100 });
    expect(tampered.status).toBe(400);
  });

  it("caps quantities at 10 and merges duplicate lines", async () => {
    expect((await request(app).post("/api/cart/validate").send({ items: [{ sku: MEN, qty: 11 }] })).status).toBe(400);
    const res = await request(app).post("/api/cart/validate").send({ items: [{ sku: MEN, qty: 7 }, { sku: "mm-men-therapy", qty: 6 }] });
    expect(res.body.cart.lines).toHaveLength(1);
    expect(res.body.cart.lines[0].qty).toBe(10);
  });

  it("adjusts quantity to stock, flags out-of-stock and drops unavailable products", async () => {
    await setStock(MEN, 3);
    await setStock(COMBO, 0);
    await Product.updateOne({ slug: "women-anti-hairfall-combo" }, { $set: { status: "archived" } });
    const res = await request(app)
      .post("/api/cart/validate")
      .send({ items: [{ sku: MEN, qty: 5 }, { sku: COMBO, qty: 1 }, { sku: "MM-WOMEN-COMBO", qty: 1 }, { sku: "NO-SUCH-SKU", qty: 1 }] });
    const { cart } = res.body;
    expect(cart.issues.map((i) => i.type)).toEqual(["QTY_ADJUSTED", "OUT_OF_STOCK", "UNAVAILABLE", "UNAVAILABLE"]);
    expect(cart.lines.map((l) => [l.sku, l.qty, l.inStock, l.lowStock])).toEqual([
      [MEN, 3, true, 3],
      [COMBO, 1, false, null],
    ]);
    expect(cart).toMatchObject({ subtotal: 3 * 49900, count: 3, canCheckout: false });
    expect(cart.items).toEqual([{ sku: MEN, qty: 3 }, { sku: COMBO, qty: 1 }]);
  });
});

describe("coupons", () => {
  const make = (overrides = {}) => Coupon.create({ code: "RITUAL10", type: "percent", value: 10, ...overrides });

  it("applies percentage and flat discounts with caps and minimum order", async () => {
    await make({ maxDiscount: 10000 });
    await Coupon.create({ code: "FLAT150", type: "flat", value: 15000, minOrder: 100000 });
    const pct = await request(app).post("/api/cart/validate").send({ items: [{ sku: COMBO, qty: 2 }], couponCode: "ritual10" });
    expect(pct.body.cart).toMatchObject({ subtotal: 159800, discount: 10000, total: 149800, coupon: { code: "RITUAL10", applied: true, message: "RITUAL10 applied — 10% off" } });

    const short = await request(app).post("/api/cart/validate").send({ items: [{ sku: MEN, qty: 1 }], couponCode: "FLAT150" });
    expect(short.body.cart.coupon).toMatchObject({ applied: false, reason: "MIN_ORDER", message: "Add ₹501 more to use this code." });
    expect(short.body.cart.discount).toBe(0);

    const ok = await request(app).post("/api/cart/validate").send({ items: [{ sku: COMBO, qty: 2 }], couponCode: "FLAT150" });
    expect(ok.body.cart).toMatchObject({ discount: 15000, total: 144800 });
  });

  it("rejects inactive, expired, future and fully-used codes", async () => {
    await make({ code: "OFF1", isActive: false });
    await make({ code: "OLD1", endsAt: new Date(Date.now() - 1000) });
    await make({ code: "SOON1", startsAt: new Date(Date.now() + 86400000) });
    await make({ code: "GONE1", usageLimit: 5, usedCount: 5 });
    const reasons = {};
    for (const code of ["OFF1", "OLD1", "SOON1", "GONE1", "NOPE1"]) {
      reasons[code] = (await request(app).post("/api/cart/validate").send({ items: [{ sku: MEN, qty: 1 }], couponCode: code })).body.cart.coupon.reason;
    }
    expect(reasons).toEqual({ OFF1: "INVALID", OLD1: "EXPIRED", SOON1: "NOT_STARTED", GONE1: "USED_UP", NOPE1: "INVALID" });
  });

  it("never discounts more than the subtotal", () => {
    expect(coupons.evaluateCoupon({ isActive: true, type: "flat", value: 99999, usedCount: 0 }, { subtotal: 49900 }).discount).toBe(49900);
  });

  it("lets one customer reserve a code once, even with simultaneous requests", async () => {
    const coupon = await make();
    const { user } = await registerUser(app);
    const results = await Promise.allSettled(Array.from({ length: 5 }, () => coupons.reserveCoupon({ code: "RITUAL10", userId: user.id, subtotal: 49900 })));
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((r) => r.status === "rejected").every((r) => r.reason.code === "COUPON_ALREADY_USED")).toBe(true);
    expect((await Coupon.findById(coupon._id)).usedCount).toBe(1);
    const again = await request(app).post("/api/cart/validate").send({ items: [{ sku: MEN, qty: 1 }], couponCode: "RITUAL10" });
    expect(again.body.cart.coupon.applied).toBe(true); // guests can't be matched to a redemption
  });

  it("never exceeds the total usage limit under contention", async () => {
    const coupon = await make({ code: "LAST1", usageLimit: 1 });
    const users = await Promise.all([registerUser(app), registerUser(app), registerUser(app)]);
    const results = await Promise.allSettled(users.map(({ user }) => coupons.reserveCoupon({ code: "LAST1", userId: user.id, subtotal: 49900 })));
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect((await Coupon.findById(coupon._id)).usedCount).toBe(1);
    expect(await CouponRedemption.countDocuments({ coupon: coupon._id })).toBe(1);
  });

  it("rolls the claim back when the surrounding order transaction aborts", async () => {
    const coupon = await make({ usageLimit: 3 });
    const { user } = await registerUser(app);
    const session = await mongoose.startSession();
    await expect(
      session.withTransaction(async () => {
        await coupons.reserveCoupon({ code: "RITUAL10", userId: user.id, subtotal: 49900, session });
        throw new Error("stock check failed");
      })
    ).rejects.toThrow("stock check failed");
    await session.endSession();
    expect((await Coupon.findById(coupon._id)).usedCount).toBe(0);
    expect(await CouponRedemption.countDocuments()).toBe(0);
  });

  it("confirms, releases once, and lets a released code be used again", async () => {
    const coupon = await make({ usageLimit: 10 });
    const { user } = await registerUser(app);
    const r1 = await coupons.reserveCoupon({ code: "RITUAL10", userId: user.id, subtotal: 49900 });
    expect(await coupons.releaseRedemption(r1._id)).toBe(true);
    expect(await coupons.releaseRedemption(r1._id)).toBe(false);
    expect((await Coupon.findById(coupon._id)).usedCount).toBe(0);

    const r2 = await coupons.reserveCoupon({ code: "RITUAL10", userId: user.id, subtotal: 49900 });
    await coupons.confirmRedemption(r2._id);
    expect(await CouponRedemption.findById(r2._id)).toMatchObject({ status: "confirmed", active: true });
    await expect(coupons.reserveCoupon({ code: "RITUAL10", userId: user.id, subtotal: 49900 })).rejects.toMatchObject({ code: "COUPON_ALREADY_USED" });
  });

  it("releases pending redemptions that were abandoned", async () => {
    const coupon = await make();
    const { user } = await registerUser(app);
    const r = await coupons.reserveCoupon({ code: "RITUAL10", userId: user.id, subtotal: 49900, now: new Date(Date.now() - coupons.PENDING_TTL_MS - 1000) });
    expect(await coupons.releaseExpiredRedemptions()).toBe(1);
    expect(await CouponRedemption.findById(r._id)).toMatchObject({ status: "released" });
    expect((await Coupon.findById(coupon._id)).usedCount).toBe(0);
  });
});

describe("server cart", () => {
  it("requires sign-in", async () => {
    expect((await request(app).get("/api/cart")).status).toBe(401);
    expect((await request(app).put("/api/cart/items").send({ sku: MEN, qty: 1 })).status).toBe(401);
  });

  it("adds, updates and removes items for the signed-in customer only", async () => {
    const alice = await registerUser(app);
    const bob = await registerUser(app);
    const a = bearer(alice.accessToken);
    expect((await request(app).get("/api/cart").set(a)).body.cart).toMatchObject({ count: 0, lines: [] });
    await request(app).put("/api/cart/items").set(a).send({ sku: MEN, qty: 2 });
    const added = await request(app).put("/api/cart/items").set(a).send({ sku: COMBO, qty: 1 });
    expect(added.body.cart).toMatchObject({ count: 3, total: 179700 });
    const updated = await request(app).put("/api/cart/items").set(a).send({ sku: MEN, qty: 1 });
    expect(updated.body.cart.count).toBe(2);
    const removed = await request(app).delete(`/api/cart/items/${COMBO}`).set(a);
    expect(removed.body.cart.lines.map((l) => l.sku)).toEqual([MEN]);
    expect((await request(app).put("/api/cart/items").set(a).send({ sku: MEN, qty: 0 })).body.cart.lines).toEqual([]);
    expect((await request(app).get("/api/cart").set(bearer(bob.accessToken))).body.cart.count).toBe(0);
  });

  it("rejects unknown SKUs and more than 10 of a product", async () => {
    const { accessToken } = await registerUser(app);
    expect((await request(app).put("/api/cart/items").set(bearer(accessToken)).send({ sku: "NOPE-123", qty: 1 })).status).toBe(404);
    expect((await request(app).put("/api/cart/items").set(bearer(accessToken)).send({ sku: MEN, qty: 11 })).status).toBe(400);
  });

  it("merges a guest cart on sign-in, adding quantities up to 10", async () => {
    const { accessToken, user } = await registerUser(app);
    const auth = bearer(accessToken);
    await request(app).put("/api/cart/items").set(auth).send({ sku: MEN, qty: 6 });
    const res = await request(app).post("/api/cart/merge").set(auth).send({ items: [{ sku: MEN, qty: 6 }, { sku: COMBO, qty: 1 }, { sku: "GONE-123", qty: 1 }] });
    expect(res.body.cart.lines.map((l) => [l.sku, l.qty])).toEqual([
      [MEN, 10],
      [COMBO, 1],
    ]);
    expect((await Cart.findOne({ user: user.id })).items.map((i) => i.sku)).toEqual([MEN, COMBO]);
  });

  it("saves stock adjustments back to the stored cart", async () => {
    const { accessToken, user } = await registerUser(app);
    await request(app).put("/api/cart/items").set(bearer(accessToken)).send({ sku: MEN, qty: 5 });
    await setStock(MEN, 2);
    const res = await request(app).get("/api/cart").set(bearer(accessToken));
    expect(res.body.cart.issues[0].type).toBe("QTY_ADJUSTED");
    expect((await Cart.findOne({ user: user.id })).items[0].qty).toBe(2);
  });

  it("applies and removes a coupon; refuses one the customer already used", async () => {
    await Coupon.create({ code: "RITUAL10", type: "percent", value: 10 });
    const { accessToken, user } = await registerUser(app);
    const auth = bearer(accessToken);
    await request(app).put("/api/cart/items").set(auth).send({ sku: COMBO, qty: 1 });

    const bad = await request(app).post("/api/cart/coupon").set(auth).send({ code: "WRONG1" });
    expect(bad.status).toBe(400);
    expect(bad.body.error).toMatchObject({ code: "COUPON_INVALID", details: [{ path: "code" }] });

    const ok = await request(app).post("/api/cart/coupon").set(auth).send({ code: "ritual10" });
    expect(ok.body.cart).toMatchObject({ discount: 7990, total: 71910, coupon: { applied: true } });
    expect((await request(app).get("/api/cart").set(auth)).body.cart.coupon.code).toBe("RITUAL10");
    expect((await request(app).delete("/api/cart/coupon").set(auth)).body.cart.coupon).toBeNull();

    await coupons.reserveCoupon({ code: "RITUAL10", userId: user.id, subtotal: 79900 });
    const used = await request(app).post("/api/cart/coupon").set(auth).send({ code: "RITUAL10" });
    expect(used.body.error.code).toBe("COUPON_ALREADY_USED");
  });

  it("clears the cart", async () => {
    const { accessToken } = await registerUser(app);
    await request(app).put("/api/cart/items").set(bearer(accessToken)).send({ sku: MEN, qty: 1 });
    expect((await request(app).delete("/api/cart").set(bearer(accessToken))).status).toBe(204);
    expect((await request(app).get("/api/cart").set(bearer(accessToken))).body.cart.count).toBe(0);
  });
});

describe("wishlist", () => {
  it("saves, lists (newest first) and removes products per customer", async () => {
    const alice = await registerUser(app);
    const bob = await registerUser(app);
    const a = bearer(alice.accessToken);
    expect((await request(app).get("/api/wishlist")).status).toBe(401);
    await request(app).post("/api/wishlist").set(a).send({ slug: "women-anti-hairfall-therapy" });
    const res = await request(app).post("/api/wishlist").set(a).send({ slug: "men-anti-hairfall-combo" });
    expect(res.status).toBe(201);
    expect(res.body.products.map((p) => p.slug)).toEqual(["men-anti-hairfall-combo", "women-anti-hairfall-therapy"]);
    await request(app).post("/api/wishlist").set(a).send({ slug: "men-anti-hairfall-combo" }); // no duplicate
    expect((await request(app).get("/api/wishlist").set(a)).body.products).toHaveLength(2);
    expect((await request(app).get("/api/wishlist").set(bearer(bob.accessToken))).body.products).toEqual([]);
    const after = await request(app).delete("/api/wishlist/men-anti-hairfall-combo").set(a);
    expect(after.body.products.map((p) => p.slug)).toEqual(["women-anti-hairfall-therapy"]);
    expect((await request(app).post("/api/wishlist").set(a).send({ slug: "no-such-product" })).status).toBe(404);
  });

  it("hides archived products and flags low stock", async () => {
    const { accessToken } = await registerUser(app);
    const auth = bearer(accessToken);
    await request(app).post("/api/wishlist").set(auth).send({ slug: "women-anti-hairfall-combo" });
    await request(app).post("/api/wishlist").set(auth).send({ slug: "men-anti-hairfall-combo" });
    await setStock("MM-WOMEN-COMBO", 4);
    await Product.updateOne({ slug: "men-anti-hairfall-combo" }, { $set: { status: "archived" } });
    const res = await request(app).get("/api/wishlist").set(auth);
    expect(res.body.products.map((p) => [p.slug, p.lowStock])).toEqual([["women-anti-hairfall-combo", 4]]);
  });
});

describe("admin coupons", () => {
  const body = { code: "monsoon15", type: "percent", value: 15, maxDiscount: 20000, minOrder: 50000, usageLimit: 100 };

  it("is admin-only", async () => {
    const staff = await registerAs(app, "staff");
    expect((await request(app).get("/api/admin/coupons").set(bearer(staff.accessToken))).status).toBe(403);
    expect((await request(app).post("/api/admin/coupons").set(bearer(staff.accessToken)).send(body)).status).toBe(403);
  });

  it("creates, lists with usage, updates and deactivates coupons", async () => {
    const admin = await registerAs(app, "admin");
    const auth = bearer(admin.accessToken);
    const created = await request(app).post("/api/admin/coupons").set(auth).send(body);
    expect(created.status).toBe(201);
    expect(created.body.coupon).toMatchObject({ code: "MONSOON15", usedCount: 0, isActive: true });
    expect((await request(app).post("/api/admin/coupons").set(auth).send(body)).status).toBe(409);

    const { user } = await registerUser(app);
    const r = await coupons.reserveCoupon({ code: "MONSOON15", userId: user.id, subtotal: 60000 });
    await coupons.confirmRedemption(r._id);
    const list = await request(app).get("/api/admin/coupons").set(auth);
    expect(list.body.coupons[0]).toMatchObject({ code: "MONSOON15", usedCount: 1, confirmedUses: 1, totalDiscount: 9000 });

    const id = created.body.coupon.id;
    expect((await request(app).patch(`/api/admin/coupons/${id}`).set(auth).send({ usedCount: 0 })).status).toBe(400);
    expect((await request(app).patch(`/api/admin/coupons/${id}`).set(auth).send({ code: "OTHER1" })).status).toBe(400);
    expect((await request(app).patch(`/api/admin/coupons/${id}`).set(auth).send({ minOrder: 0 })).body.coupon.minOrder).toBe(0);
    // Used coupons are only deactivated; unused ones are deleted.
    const del = await request(app).delete(`/api/admin/coupons/${id}`).set(auth);
    expect([del.status, del.body]).toEqual([200, { deleted: false }]);
    expect((await Coupon.findById(id)).isActive).toBe(false);
    const unused = await request(app).post("/api/admin/coupons").set(auth).send({ ...body, code: "UNUSED10" });
    expect((await request(app).delete(`/api/admin/coupons/${unused.body.coupon.id}`).set(auth)).body).toEqual({ deleted: true });
    expect(await Coupon.findById(unused.body.coupon.id)).toBeNull();
  });

  it("validates coupon rules", async () => {
    const admin = await registerAs(app, "admin");
    const auth = bearer(admin.accessToken);
    for (const bad of [{ ...body, value: 95 }, { ...body, type: "bogo" }, { ...body, code: "has space" }, { ...body, startsAt: "2026-12-01", endsAt: "2026-11-01" }, { ...body, value: 10.5 }]) {
      expect((await request(app).post("/api/admin/coupons").set(auth).send(bad)).status, JSON.stringify(bad)).toBe(400);
    }
  });
});
