import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import request from "supertest";
import { createRequire } from "module";
import { buildApp, startDb, stopDb, clearDb } from "./helpers.mjs";

const require = createRequire(import.meta.url);
const { Product } = require("../Models/Product.js");
const { BlogPost } = require("../Models/Blog.js");
const { Page } = require("../Models/Content.js");
const { seedCatalog } = require("../Services/seed.js");
const { buildSitemap } = require("../Services/sitemap.js");

const app = buildApp({ APP_URL: "https://manushyam.com" });

beforeAll(startDb);
afterAll(stopDb);
beforeEach(async () => {
  await clearDb();
  await seedCatalog();
});

describe("sitemap", () => {
  it("lists static pages, published products, live articles and policies only", async () => {
    const draft = await Product.findOne().sort({ slug: 1 });
    await Product.updateOne({ _id: draft._id }, { $set: { status: "draft" } });
    const post = await BlogPost.findOne();
    await BlogPost.updateOne({ _id: post._id }, { $set: { publishAt: new Date(Date.now() + 86400000) } });
    await Page.updateOne({ slug: "terms" }, { $set: { isPublished: false } });

    const res = await request(app).get("/api/seo/sitemap.xml");
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toMatch(/application\/xml/);
    expect(res.headers["cache-control"]).toBe("public, max-age=3600");
    const xml = res.text;
    expect(xml).toMatch(/^<\?xml version="1.0" encoding="UTF-8"\?>/);
    expect(xml).toContain("<loc>https://manushyam.com/</loc>");
    expect(xml).toContain("<loc>https://manushyam.com/solutions</loc>");

    const live = await Product.find({ status: "published" });
    for (const p of live) expect(xml).toContain(`<loc>https://manushyam.com/solutions/${p.slug}</loc>`);
    expect(xml).not.toContain(`/solutions/${draft.slug}<`);
    expect(xml).not.toContain(`/blog/${post.slug}<`);
    expect(xml).toContain("<loc>https://manushyam.com/policies/privacy</loc>");
    expect(xml).not.toContain("/policies/terms");
    expect(xml).not.toMatch(/\/(account|cart|checkout|search|admin)/);
    expect(xml).toMatch(/<lastmod>\d{4}-\d{2}-\d{2}<\/lastmod>/);
  });

  it("escapes XML special characters", async () => {
    await Page.create({ slug: "a-b", title: "x", kind: "policy" });
    await Page.updateOne({ slug: "a-b" }, { $set: { slug: "a&b" } });
    expect(await buildSitemap()).toContain("/policies/a&amp;b</loc>");
  });
});

describe("client error reports", () => {
  it("always answers 204, logging only clean fields", async () => {
    const ok = await request(app).post("/api/client-errors").send({ kind: "render", message: "x is undefined", stack: "at Foo", url: "https://manushyam.com/cart?email=a@b.com", release: "abc123" });
    expect(ok.status).toBe(204);
    expect((await request(app).post("/api/client-errors").send({ nope: true })).status).toBe(204);
    expect((await request(app).post("/api/client-errors").send({ message: "x".repeat(10000) })).status).toBe(204);
  });

  it("drops reports past the per-IP limit without an error", async () => {
    const statuses = [];
    for (let i = 0; i < 32; i += 1) statuses.push((await request(app).post("/api/client-errors").send({ message: "boom" })).status);
    expect(new Set(statuses)).toEqual(new Set([204]));
  });
});

describe("compression", () => {
  it("compresses larger responses when the client accepts it", async () => {
    const res = await request(app).get("/api/seo/sitemap.xml").set("Accept-Encoding", "gzip");
    expect(res.headers["content-encoding"]).toBe("gzip");
  });
});
