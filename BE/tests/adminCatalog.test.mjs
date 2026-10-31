import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from "vitest";
import request from "supertest";
import { createRequire } from "module";
import { buildApp, startDb, stopDb, clearDb, registerUser, registerAs, bearer } from "./helpers.mjs";

const require = createRequire(import.meta.url);
const { Product } = require("../Models/Product.js");
const { seedCatalog } = require("../Services/seed.js");
const { sniffImageType, signParams } = require("../Services/uploads.js");

const app = buildApp();

beforeAll(async () => {
  await startDb();
  await Product.syncIndexes();
});
afterAll(stopDb);
beforeEach(async () => {
  await clearDb();
  await seedCatalog();
});

const newProduct = (overrides = {}) => ({
  slug: "bhringaraj-oil",
  name: "Bhringaraj Hair Oil",
  audience: "unisex",
  type: "oil",
  status: "published",
  images: [{ url: "https://res.cloudinary.com/demo/image/upload/oil.jpg", alt: "Oil bottle" }],
  variants: [
    { sku: "MM-BHR-100", label: "100 ml", price: 34900, mrp: 39900, stock: 40 },
    { sku: "MM-BHR-200", label: "200 ml", price: 59900, stock: 0 },
  ],
  internal: { costPrice: 9000, supplier: "Kerala Herbals" },
  ...overrides,
});

describe("access control", () => {
  it("requires sign-in, and staff or admin role, for catalogue management", async () => {
    expect((await request(app).get("/api/admin/products")).status).toBe(401);
    const customer = await registerUser(app);
    expect((await request(app).get("/api/admin/products").set(bearer(customer.accessToken))).status).toBe(403);
    expect((await request(app).post("/api/admin/products").set(bearer(customer.accessToken)).send(newProduct())).status).toBe(403);
    const staff = await registerAs(app, "staff");
    expect((await request(app).get("/api/admin/products").set(bearer(staff.accessToken))).status).toBe(200);
  });

  it("limits CMS and archiving to admins", async () => {
    const staff = await registerAs(app, "staff");
    const auth = bearer(staff.accessToken);
    const id = (await Product.findOne({ slug: "men-anti-hairfall-combo" }))._id;
    expect((await request(app).delete(`/api/admin/products/${id}`).set(auth)).status).toBe(403);
    expect((await request(app).get("/api/admin/hero-slides").set(auth)).status).toBe(403);
    expect((await request(app).post("/api/admin/faqs").set(auth).send({ question: "Staff question?", answer: "No", topic: "orders" })).status).toBe(403);
    expect((await request(app).put("/api/admin/settings").set(auth).send({ heroSubline: "Hacked" })).status).toBe(403);
  });
});

describe("product management", () => {
  it("lets admins create products and see internal fields; derived fields come from variants", async () => {
    const admin = await registerAs(app, "admin");
    const res = await request(app).post("/api/admin/products").set(bearer(admin.accessToken)).send(newProduct());
    expect(res.status).toBe(201);
    expect(res.body.product).toMatchObject({ slug: "bhringaraj-oil", priceFrom: 34900, inStock: true, internal: { costPrice: 9000, supplier: "Kerala Herbals" } });
    expect(res.body.product.variants[0].isDefault).toBe(true);

    const pub = await request(app).get("/api/products/bhringaraj-oil");
    expect(pub.status).toBe(200);
    expect(pub.body.product).not.toHaveProperty("internal");
    expect(pub.body.product.variants.map((v) => v.inStock)).toEqual([true, false]);
  });

  it("never shows or accepts cost data from staff", async () => {
    const staff = await registerAs(app, "staff");
    const auth = bearer(staff.accessToken);
    const created = await request(app).post("/api/admin/products").set(auth).send(newProduct());
    expect(created.status).toBe(201);
    expect(created.body.product).not.toHaveProperty("internal");
    expect(await Product.findOne({ slug: "bhringaraj-oil" }).select("+internal").lean()).not.toHaveProperty("internal.costPrice");

    const list = await request(app).get("/api/admin/products").set(auth);
    expect(list.body.products.every((p) => !("internal" in p))).toBe(true);
  });

  it("updates products, merging internal fields and recalculating price/stock", async () => {
    const admin = await registerAs(app, "admin");
    const auth = bearer(admin.accessToken);
    const { body } = await request(app).post("/api/admin/products").set(auth).send(newProduct());
    const id = body.product.id;

    const res = await request(app)
      .patch(`/api/admin/products/${id}`)
      .set(auth)
      .send({ name: "Bhringaraj Scalp Oil", internal: { notes: "Reorder in March" }, variants: [{ sku: "MM-BHR-100", label: "100 ml", price: 29900, stock: 0 }] });
    expect(res.status).toBe(200);
    expect(res.body.product).toMatchObject({ name: "Bhringaraj Scalp Oil", priceFrom: 29900, inStock: false, internal: { costPrice: 9000, notes: "Reorder in March" } });
  });

  it("updates stock for one variant", async () => {
    const staff = await registerAs(app, "staff");
    const product = await Product.findOne({ slug: "men-anti-hairfall-combo" });
    const res = await request(app).patch(`/api/admin/products/${product._id}/stock`).set(bearer(staff.accessToken)).send({ sku: "mm-men-combo", stock: 0 });
    expect(res.status).toBe(200);
    expect(res.body.product.inStock).toBe(false);
    const missing = await request(app).patch(`/api/admin/products/${product._id}/stock`).set(bearer(staff.accessToken)).send({ sku: "NOPE-1", stock: 3 });
    expect(missing.status).toBe(404);
  });

  it("rejects duplicate slugs and SKUs with 409", async () => {
    const admin = await registerAs(app, "admin");
    const auth = bearer(admin.accessToken);
    const dupSlug = await request(app).post("/api/admin/products").set(auth).send(newProduct({ slug: "men-anti-hairfall-therapy" }));
    expect(dupSlug.status).toBe(409);
    const dupSku = await request(app)
      .post("/api/admin/products")
      .set(auth)
      .send(newProduct({ variants: [{ sku: "MM-MEN-THERAPY", label: "x", price: 100, stock: 1 }] }));
    expect(dupSku.status).toBe(409);
    expect(dupSku.body.error.message).toMatch(/SKU/);
  });

  it("validates input and blocks mass assignment of derived fields", async () => {
    const admin = await registerAs(app, "admin");
    const auth = bearer(admin.accessToken);
    const cases = [
      newProduct({ priceFrom: 1 }),
      newProduct({ rating: { average: 5, count: 999 } }),
      newProduct({ popularity: 1e6 }),
      newProduct({ variants: [] }),
      newProduct({ variants: [{ sku: "A-1", label: "x", price: 10.5, stock: 1 }] }),
      newProduct({ variants: [{ sku: "A-1", label: "x", price: 500, mrp: 400, stock: 1 }] }),
      newProduct({ images: [{ url: "javascript:alert(1)", alt: "" }] }),
      newProduct({ images: [{ url: "http://insecure.example/x.jpg", alt: "" }] }),
      newProduct({ slug: "Has Spaces" }),
    ];
    for (const body of cases) {
      const res = await request(app).post("/api/admin/products").set(auth).send(body);
      expect(res.status, JSON.stringify(body).slice(0, 80)).toBe(400);
    }
  });

  it("rejects related products that don’t exist or point at itself", async () => {
    const admin = await registerAs(app, "admin");
    const auth = bearer(admin.accessToken);
    const bad = await request(app).post("/api/admin/products").set(auth).send(newProduct({ related: ["0123456789abcdef01234567"] }));
    expect(bad.status).toBe(400);
    const self = await Product.findOne({ slug: "men-anti-hairfall-combo" });
    const loop = await request(app).patch(`/api/admin/products/${self._id}`).set(auth).send({ related: [String(self._id)] });
    expect(loop.status).toBe(400);
  });

  it("archives instead of deleting", async () => {
    const admin = await registerAs(app, "admin");
    const product = await Product.findOne({ slug: "men-anti-hairfall-combo" });
    expect((await request(app).delete(`/api/admin/products/${product._id}`).set(bearer(admin.accessToken))).status).toBe(204);
    expect(await Product.findById(product._id)).toMatchObject({ status: "archived" });
    expect((await request(app).get("/api/products/men-anti-hairfall-combo")).status).toBe(404);
  });
});

describe("CMS", () => {
  it("lets admins manage hero slides, FAQs, pages and settings", async () => {
    const admin = await registerAs(app, "admin");
    const auth = bearer(admin.accessToken);

    const slide = await request(app).post("/api/admin/hero-slides").set(auth).send({ title: "Monsoon ritual", image: { url: "/images/content/hero-man.jpg", alt: "" }, sortOrder: -1, cta: { label: "Shop", href: "/solutions" } });
    expect(slide.status).toBe(201);
    expect((await request(app).get("/api/content/home")).body.slides[0].title).toBe("Monsoon ritual");
    expect((await request(app).patch(`/api/admin/hero-slides/${slide.body.item.id}`).set(auth).send({ isActive: false })).status).toBe(200);
    expect((await request(app).get("/api/content/home")).body.slides.map((s) => s.title)).not.toContain("Monsoon ritual");

    const faq = await request(app).post("/api/admin/faqs").set(auth).send({ question: "Do you ship abroad?", answer: "Not yet — India only.", topic: "orders" });
    expect(faq.status).toBe(201);
    expect((await request(app).get("/api/faqs")).body.faqs.map((f) => f.question)).toContain("Do you ship abroad?");
    expect((await request(app).delete(`/api/admin/faqs/${faq.body.item.id}`).set(auth)).status).toBe(204);

    const dup = await request(app).post("/api/admin/pages").set(auth).send({ slug: "privacy", title: "Privacy again", sections: [] });
    expect(dup.status).toBe(409);

    const settings = await request(app).put("/api/admin/settings").set(auth).send({ heroSubline: "Results from the 3rd application", rating: { value: 4.9, source: "on Amazon" } });
    expect(settings.status).toBe(200);
    expect((await request(app).get("/api/settings")).body.settings).toMatchObject({ heroSubline: "Results from the 3rd application", rating: { value: 4.9 }, trustedBy: expect.stringContaining("10,000") });
  });

  it("only accepts site paths or https links for slide buttons", async () => {
    const admin = await registerAs(app, "admin");
    for (const href of ["javascript:alert(1)", "//evil.example", "http://evil.example"]) {
      const res = await request(app)
        .post("/api/admin/hero-slides")
        .set(bearer(admin.accessToken))
        .send({ title: "Bad link", image: { url: "/images/x.jpg", alt: "" }, cta: { label: "Go", href } });
      expect(res.status, href).toBe(400);
    }
  });
});

describe("image uploads", () => {
  const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(64)]);
  const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');

  afterEach(() => vi.unstubAllGlobals());

  it("recognises real image bytes only", () => {
    expect(sniffImageType(png)).toBe("image/png");
    expect(sniffImageType(Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(20)]))).toBe("image/jpeg");
    expect(sniffImageType(Buffer.concat([Buffer.from("RIFF"), Buffer.alloc(4), Buffer.from("WEBPVP8 ")]))).toBe("image/webp");
    expect(sniffImageType(svg)).toBeNull();
    expect(sniffImageType(Buffer.from("GIF89a-------"))).toBeNull();
  });

  it("signs Cloudinary params in sorted order", () => {
    expect(signParams({ timestamp: 1, folder: "a" }, "s")).toBe(require("crypto").createHash("sha1").update("folder=a&timestamp=1s").digest("hex"));
  });

  it("rejects disguised files and reports when uploads are not configured", async () => {
    const staff = await registerAs(app, "staff");
    const auth = bearer(staff.accessToken);
    const disguised = await request(app).post("/api/admin/uploads").set(auth).attach("file", svg, { filename: "x.png", contentType: "image/png" });
    expect(disguised.status).toBe(400);
    const missing = await request(app).post("/api/admin/uploads").set(auth).field("folder", "products");
    expect(missing.status).toBe(400);
    const real = await request(app).post("/api/admin/uploads").set(auth).attach("file", png, { filename: "x.png", contentType: "image/png" });
    expect(real.status).toBe(503);
  });

  it("rejects files over 5 MB", async () => {
    const staff = await registerAs(app, "staff");
    const big = Buffer.concat([png, Buffer.alloc(5 * 1024 * 1024)]);
    const res = await request(app).post("/api/admin/uploads").set(bearer(staff.accessToken)).attach("file", big, { filename: "big.png", contentType: "image/png" });
    expect(res.status).toBe(413);
  });

  it("uploads to Cloudinary when configured", async () => {
    const configured = buildApp({ CLOUDINARY_CLOUD_NAME: "demo", CLOUDINARY_API_KEY: "key", CLOUDINARY_API_SECRET: "secret" });
    const staff = await registerAs(configured, "staff");
    const realFetch = globalThis.fetch;
    const fetchMock = vi.fn(async (url, init) => {
      if (!String(url).startsWith("https://api.cloudinary.com/")) return realFetch(url, init);
      return new Response(JSON.stringify({ secure_url: "https://res.cloudinary.com/demo/image/upload/v1/manushyam/products/abc.png", width: 800, height: 800, bytes: 72, format: "png", public_id: "manushyam/products/abc" }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);
    const res = await request(configured).post("/api/admin/uploads").set(bearer(staff.accessToken)).attach("file", png, { filename: "x.png", contentType: "image/png" });
    expect(res.status).toBe(201);
    expect(res.body.image.url).toMatch(/^https:\/\/res\.cloudinary\.com\//);
    const [url, init] = fetchMock.mock.calls.find(([u]) => String(u).includes("cloudinary"));
    expect(url).toBe("https://api.cloudinary.com/v1_1/demo/image/upload");
    expect(init.body.get("signature")).toMatch(/^[a-f0-9]{40}$/);
    expect(init.body.get("api_secret")).toBeNull();
  });
});
