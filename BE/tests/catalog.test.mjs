import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import request from "supertest";
import { createRequire } from "module";
import { buildApp, startDb, stopDb, clearDb } from "./helpers.mjs";

const require = createRequire(import.meta.url);
const { Product } = require("../Models/Product.js");
const { HeroSlide, Faq, Page } = require("../Models/Content.js");
const { seedCatalog } = require("../Services/seed.js");
const { editDistance, tokenScore, tokenize } = require("../Services/search.js");

const app = buildApp();

beforeAll(async () => {
  await startDb();
  // $text queries need the text index to exist before the first search.
  await Product.syncIndexes();
});
afterAll(stopDb);
beforeEach(async () => {
  await clearDb();
  await seedCatalog();
});

const slugs = (res) => res.body.products.map((p) => p.slug);

describe("product listing", () => {
  it("lists published products in the recommended order with card fields only", async () => {
    await Product.create({ slug: "draft-oil", name: "Draft Oil", audience: "men", type: "oil", variants: [{ sku: "DRAFT-1", label: "x", price: 100, stock: 1 }] });
    const res = await request(app).get("/api/products");
    expect(res.status).toBe(200);
    expect(slugs(res)).toEqual(["men-anti-hairfall-therapy", "women-anti-hairfall-therapy", "men-anti-hairfall-combo", "women-anti-hairfall-combo"]);
    expect(res.body).toMatchObject({ total: 4, page: 1, pages: 1, match: "browse" });
    const card = res.body.products[0];
    expect(card).toMatchObject({ name: "Men Anti-Hairfall Therapy", price: 49900, inStock: true, defaultSku: "MM-MEN-THERAPY", badges: ["Bestseller"] });
    expect(card.image.url).toBe("/images/products/pdp-men-therapy.jpg");
    for (const hidden of ["internal", "variants", "stock", "status", "popularity"]) expect(card).not.toHaveProperty(hidden);
    expect(res.headers["cache-control"]).toMatch(/public/);
  });

  it("filters by audience, type, concern, price and stock", async () => {
    expect(slugs(await request(app).get("/api/products?for=women"))).toEqual(["women-anti-hairfall-therapy", "women-anti-hairfall-combo"]);
    expect(slugs(await request(app).get("/api/products?type=combo"))).toEqual(["men-anti-hairfall-combo", "women-anti-hairfall-combo"]);
    expect(slugs(await request(app).get("/api/products?concern=dht"))).toEqual(["men-anti-hairfall-therapy", "men-anti-hairfall-combo"]);
    expect(slugs(await request(app).get("/api/products?minPrice=50000&maxPrice=80000"))).toEqual(["women-anti-hairfall-therapy", "men-anti-hairfall-combo"]);

    await Product.updateOne({ slug: "men-anti-hairfall-combo" }, { $set: { "variants.0.stock": 0, inStock: false } });
    expect(slugs(await request(app).get("/api/products?inStock=true&type=combo"))).toEqual(["women-anti-hairfall-combo"]);
  });

  it("includes unisex products for men and women", async () => {
    await Product.create({ slug: "unisex-oil", name: "Unisex Oil", audience: "unisex", type: "oil", status: "published", sortOrder: 9, variants: [{ sku: "UNI-1", label: "100 ml", price: 30000, stock: 5 }] });
    expect(slugs(await request(app).get("/api/products?for=men"))).toContain("unisex-oil");
    expect(slugs(await request(app).get("/api/products?for=women"))).toContain("unisex-oil");
  });

  it("sorts and paginates", async () => {
    expect(slugs(await request(app).get("/api/products?sort=price_desc"))[0]).toBe("women-anti-hairfall-combo");
    const page2 = await request(app).get("/api/products?sort=price_asc&limit=3&page=2");
    expect(page2.body).toMatchObject({ total: 4, page: 2, pages: 2 });
    expect(slugs(page2)).toEqual(["women-anti-hairfall-combo"]);
  });

  it("rejects bad query parameters", async () => {
    for (const qs of ["for=kids", "type=therapy,candle", "sort=random", "limit=500", "page=0", "foo=bar", "minPrice=-1"]) {
      expect((await request(app).get(`/api/products?${qs}`)).status, qs).toBe(400);
    }
    const crossed = await request(app).get("/api/products?minPrice=90000&maxPrice=10000");
    expect(crossed.status).toBe(400);
    expect(crossed.body.error.details[0].path).toBe("minPrice");
  });

  it("returns specific products by slug list (recently viewed)", async () => {
    const res = await request(app).get("/api/products?slugs=women-anti-hairfall-combo,men-anti-hairfall-therapy");
    expect(slugs(res).sort()).toEqual(["men-anti-hairfall-therapy", "women-anti-hairfall-combo"]);
  });
});

describe("search", () => {
  it("ranks text matches by relevance", async () => {
    const res = await request(app).get("/api/products?q=shampoo");
    expect(res.body.match).toBe("text");
    expect(slugs(res)).toEqual(expect.arrayContaining(["men-anti-hairfall-therapy", "men-anti-hairfall-combo"]));
    expect(slugs(res)).not.toContain("women-anti-hairfall-therapy");
  });

  it("falls back to fuzzy matching for typos", async () => {
    const res = await request(app).get("/api/products?q=shampo");
    expect(res.body.match).toBe("fuzzy");
    expect(slugs(res).sort()).toEqual(["men-anti-hairfall-combo", "men-anti-hairfall-therapy"]);
  });

  it("requires every word to match, tolerating typos", async () => {
    const res = await request(app).get("/api/products?q=womn%20combo");
    expect(slugs(res)).toEqual(["women-anti-hairfall-combo"]);
  });

  it("returns nothing (not everything) for unrelated words", async () => {
    const res = await request(app).get("/api/products?q=lipstick");
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ products: [], total: 0 });
  });

  it("combines search with filters", async () => {
    expect(slugs(await request(app).get("/api/products?q=combo&for=men"))).toEqual(["men-anti-hairfall-combo"]);
  });

  it("treats regex characters in queries literally", async () => {
    for (const q of ["(", ".*", "a+b[", "\\"]) {
      expect((await request(app).get(`/api/products/suggest?q=${encodeURIComponent(q + "xx")}`)).status).toBe(200);
      expect((await request(app).get(`/api/products?q=${encodeURIComponent(q)}`)).status).toBe(200);
    }
  });

  it("suggests products by word prefix, then by fuzzy match", async () => {
    const prefix = await request(app).get("/api/products/suggest?q=wom");
    expect(prefix.body.suggestions.map((s) => s.slug)).toEqual(["women-anti-hairfall-therapy", "women-anti-hairfall-combo"]);
    const typo = await request(app).get("/api/products/suggest?q=therpy");
    expect(typo.body.suggestions.map((s) => s.slug)).toEqual(expect.arrayContaining(["men-anti-hairfall-therapy", "women-anti-hairfall-therapy"]));
    expect((await request(app).get("/api/products/suggest?q=a")).status).toBe(400);
  });
});

describe("search scoring", () => {
  it("measures edit distance with transpositions", () => {
    expect(editDistance("ginsng", "ginseng")).toBe(1);
    expect(editDistance("hiar", "hair")).toBe(1);
    expect(editDistance("shampoo", "oil", 2)).toBeGreaterThan(2);
  });

  it("scores exact > prefix > typo", () => {
    expect(tokenScore("combo", "combo")).toBe(3);
    expect(tokenScore("com", "combo")).toBe(2);
    expect(tokenScore("cmbo", "combo")).toBe(1);
    expect(tokenScore("xyz", "combo")).toBe(0);
    expect(tokenize("Women’s Anti-Hairfall!")).toEqual(["women", "anti", "hairfall"]);
  });
});

describe("product detail", () => {
  it("returns the full public product and three related products", async () => {
    const res = await request(app).get("/api/products/men-anti-hairfall-therapy");
    expect(res.status).toBe(200);
    const { product, related } = res.body;
    expect(product).toMatchObject({ name: "Men Anti-Hairfall Therapy", price: 49900, freeFrom: expect.arrayContaining(["paraben"]) });
    expect(product.benefits).toHaveLength(5);
    expect(product.ingredients.extracts).toContain("Korean Ginseng");
    expect(product.variants[0]).toEqual({ sku: "MM-MEN-THERAPY", label: "Shampoo 100 ml + Men Hair Oil 100 ml", price: 49900, mrp: null, inStock: true, isDefault: true });
    expect(product).not.toHaveProperty("internal");
    expect(JSON.stringify(product)).not.toMatch(/"stock"/);
    expect(related).toHaveLength(3);
    expect(related.map((r) => r.slug)).not.toContain("men-anti-hairfall-therapy");
  });

  it("puts hand-picked related products first", async () => {
    const women = await Product.findOne({ slug: "women-anti-hairfall-combo" });
    await Product.updateOne({ slug: "men-anti-hairfall-therapy" }, { $set: { related: [women._id] } });
    const res = await request(app).get("/api/products/men-anti-hairfall-therapy");
    expect(res.body.related[0].slug).toBe("women-anti-hairfall-combo");
    expect(res.body.related).toHaveLength(3);
  });

  it("hides drafts and archived products and rejects malformed slugs", async () => {
    await Product.updateOne({ slug: "men-anti-hairfall-combo" }, { $set: { status: "archived" } });
    expect((await request(app).get("/api/products/men-anti-hairfall-combo")).status).toBe(404);
    expect((await request(app).get("/api/products/no-such-thing")).status).toBe(404);
    expect((await request(app).get("/api/products/Bad_Slug!")).status).toBe(400);
  });
});

describe("storefront content", () => {
  it("serves active hero slides in order with site settings", async () => {
    await HeroSlide.create({ title: "Old sale", image: { url: "/images/x.jpg" }, endsAt: new Date(Date.now() - 1000), sortOrder: 0 });
    await HeroSlide.create({ title: "Hidden", image: { url: "/images/x.jpg" }, isActive: false, sortOrder: 0 });
    const res = await request(app).get("/api/content/home");
    expect(res.status).toBe(200);
    expect(res.body.slides.map((s) => s.title)).toEqual(["Rooted in\nRitual.", "Rooted in\nRitual.", "Stronger Roots.\nHappier You."]);
    expect(res.body.slides[0]).toMatchObject({ cta: { label: "Shop Therapy", href: "/solutions" }, image: { url: "/images/content/hero-woman-hair.jpg" } });
    expect(res.body.settings).toMatchObject({ heroSubline: "Fix falling hairs after 3rd application", rating: { value: 4.8 } });
  });

  it("lists published FAQs by topic", async () => {
    await Faq.create({ question: "Draft question?", answer: "Not yet", topic: "orders", isPublished: false });
    const res = await request(app).get("/api/faqs");
    expect(res.body.faqs).toHaveLength(16);
    expect(res.body.faqs.map((f) => f.question)).not.toContain("Draft question?");
    expect(res.body.faqs[0]).toEqual({ id: expect.any(String), question: "Why do I get a code when I sign in?", answer: expect.any(String), topic: "account" });
  });

  it("serves policy pages and their index", async () => {
    const list = await request(app).get("/api/pages");
    expect(list.body.pages.map((p) => p.slug)).toEqual(["shipping", "returns", "cancellation", "privacy", "terms"]);
    const page = await request(app).get("/api/pages/privacy");
    expect(page.body.page).toMatchObject({ title: "Privacy Policy", sections: expect.arrayContaining([expect.objectContaining({ heading: "Cookies & analytics" })]) });
    await Page.updateOne({ slug: "terms" }, { $set: { isPublished: false } });
    expect((await request(app).get("/api/pages/terms")).status).toBe(404);
  });
});

describe("seeding", () => {
  it("is idempotent and never overwrites admin edits", async () => {
    await Product.updateOne({ slug: "men-anti-hairfall-therapy" }, { $set: { name: "Edited name" } });
    const again = await seedCatalog();
    expect(again).toEqual({ products: 0, heroSlides: 0, faqs: 0, pages: 0, blogCategories: 0, blogPosts: 0 });
    expect(await Product.countDocuments()).toBe(4);
    expect((await Product.findOne({ slug: "men-anti-hairfall-therapy" })).name).toBe("Edited name");
  });
});
