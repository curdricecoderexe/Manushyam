import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from "vitest";
import request from "supertest";
import { createRequire } from "module";
import { buildApp, startDb, stopDb, clearDb, registerUser, registerAs, bearer, outbox } from "./helpers.mjs";

const require = createRequire(import.meta.url);
const { Product } = require("../Models/Product.js");
const { Order } = require("../Models/Order.js");
const { Review } = require("../Models/Review.js");
const { BlogPost, BlogCategory } = require("../Models/Blog.js");
const { NewsletterSubscriber, ContactMessage } = require("../Models/Engagement.js");
const { seedCatalog } = require("../Services/seed.js");
const { drainMailQueue } = require("../Services/mailQueue.js");
const { sanitizePostHtml, readMinutes, deriveExcerpt } = require("../Services/blog.js");
const { displayName } = require("../Services/reviews.js");

const app = buildApp();
const SLUG = "men-anti-hairfall-therapy";

beforeAll(async () => {
  await startDb();
  await Promise.all([Product, Order, Review, BlogPost, BlogCategory, NewsletterSubscriber].map((m) => m.syncIndexes()));
});
afterAll(stopDb);
beforeEach(async () => {
  buildApp();
  await clearDb();
  await seedCatalog();
});
afterEach(async () => {
  await drainMailQueue();
  vi.restoreAllMocks();
});

let seq = 0;
// A delivered (or other-status) order for a customer, written straight to the database.
async function orderFor(session, { status = "delivered", slugs = [SLUG] } = {}) {
  seq += 1;
  const products = await Product.find({ slug: { $in: slugs } });
  const items = products.map((p) => ({ product: p._id, slug: p.slug, sku: p.variants[0].sku, name: p.name, variantLabel: p.variants[0].label, price: p.variants[0].price, qty: 1, lineTotal: p.variants[0].price }));
  const total = items.reduce((s, i) => s + i.lineTotal, 0);
  return Order.create({
    orderNumber: `MM261004-T${String(seq).padStart(4, "0")}`,
    user: session.user.id,
    email: session.email,
    items,
    address: { fullName: "Ananya Sharma", phone: "9876543210", line1: "1 MG Road", city: "Bengaluru", state: "Karnataka", pincode: "560001" },
    amounts: { subtotal: total, total },
    paymentMethod: "cod",
    status,
    holdsStock: false,
    deliveredAt: status === "delivered" ? new Date() : undefined,
  });
}

const review = (h, body) => request(app).post("/api/reviews").set(h).send({ productSlug: SLUG, rating: 5, body: "Hair fall reduced after three weeks of use.", ...body });

describe("reviews", () => {
  it("lets a customer review a delivered product once, and updates the product rating", async () => {
    const s = await registerUser(app, { name: "Ananya Sharma" });
    const h = bearer(s.accessToken);
    const order = await orderFor(s);

    const res = await review(h, { orderNumber: order.orderNumber, title: "Works!" });
    expect(res.status).toBe(201);
    expect(res.body.review).toMatchObject({ rating: 5, title: "Works!", authorName: "Ananya S.", verified: true, orderNumber: order.orderNumber, product: { slug: SLUG } });
    expect((await Product.findOne({ slug: SLUG })).rating.toObject()).toEqual({ average: 5, count: 1 });

    const again = await review(h, { orderNumber: order.orderNumber });
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe("ALREADY_REVIEWED");

    const pub = await request(app).get(`/api/products/${SLUG}/reviews`);
    expect(pub.body.summary).toEqual({ average: 5, count: 1, distribution: { 5: 1, 4: 0, 3: 0, 2: 0, 1: 0 } });
    expect(pub.body.reviews[0]).toEqual({ id: expect.any(String), rating: 5, title: "Works!", body: "Hair fall reduced after three weeks of use.", authorName: "Ananya S.", verified: true, createdAt: expect.any(String) });
    expect(JSON.stringify(pub.body)).not.toMatch(/example\.com|Sharma/);
  });

  it("only allows verified, delivered purchases by the order's owner", async () => {
    const s = await registerUser(app);
    const other = await registerUser(app);
    const shipped = await orderFor(s, { status: "shipped" });
    const delivered = await orderFor(s);
    expect((await review(bearer(s.accessToken), { orderNumber: shipped.orderNumber })).body.error.code).toBe("NOT_DELIVERED");
    expect((await review(bearer(other.accessToken), { orderNumber: delivered.orderNumber })).status).toBe(404);
    expect((await review(bearer(s.accessToken), { orderNumber: delivered.orderNumber, productSlug: "women-anti-hairfall-combo" })).status).toBe(404);
    expect((await request(app).post("/api/reviews").send({ orderNumber: delivered.orderNumber, productSlug: SLUG, rating: 5, body: "Lovely product overall" })).status).toBe(401);
  });

  it("validates rating and text length", async () => {
    const s = await registerUser(app);
    const order = await orderFor(s);
    const h = bearer(s.accessToken);
    expect((await review(h, { orderNumber: order.orderNumber, rating: 6 })).status).toBe(400);
    expect((await review(h, { orderNumber: order.orderNumber, body: "ok" })).status).toBe(400);
    expect((await review(h, { orderNumber: order.orderNumber, body: "x".repeat(1001) })).status).toBe(400);
    expect((await review(h, { orderNumber: order.orderNumber, verified: false })).status).toBe(400);
  });

  it("lists the customer's reviews and the delivered items still waiting for one; edits and deletes recompute the rating", async () => {
    const s = await registerUser(app);
    const h = bearer(s.accessToken);
    const order = await orderFor(s, { slugs: [SLUG, "men-anti-hairfall-combo"] });
    await orderFor(s, { status: "processing" });
    const created = await review(h, { orderNumber: order.orderNumber, rating: 4 });

    const mine = await request(app).get("/api/me/reviews").set(h);
    expect(mine.body.reviews).toHaveLength(1);
    expect(mine.body.pending).toEqual([{ orderNumber: order.orderNumber, product: { slug: "men-anti-hairfall-combo", name: "Men Anti-Hairfall Combo", image: null }, deliveredAt: expect.any(String) }]);

    const id = created.body.review.id;
    const edited = await request(app).patch(`/api/reviews/${id}`).set(h).send({ rating: 2 });
    expect(edited.body.review.rating).toBe(2);
    expect((await Product.findOne({ slug: SLUG })).rating.average).toBe(2);
    const other = await registerUser(app);
    expect((await request(app).patch(`/api/reviews/${id}`).set(bearer(other.accessToken)).send({ rating: 5 })).status).toBe(404);
    expect((await request(app).delete(`/api/reviews/${id}`).set(h)).status).toBe(204);
    expect((await Product.findOne({ slug: SLUG })).rating.toObject()).toEqual({ average: 0, count: 0 });
  });

  it("lets admins hide and delete reviews (hidden ones leave the rating and the public list)", async () => {
    const a = await registerUser(app, { name: "Priya Sharma" });
    const b = await registerUser(app, { name: "Rohan Mehta" });
    await review(bearer(a.accessToken), { orderNumber: (await orderFor(a)).orderNumber, rating: 5 });
    const spam = await review(bearer(b.accessToken), { orderNumber: (await orderFor(b)).orderNumber, rating: 1, body: "Spam spam spam spam" });
    expect((await Product.findOne({ slug: SLUG })).rating.average).toBe(3);

    const staff = bearer((await registerAs(app, "staff")).accessToken);
    const admin = bearer((await registerAs(app, "admin")).accessToken);
    expect((await request(app).get("/api/admin/reviews").set(staff)).status).toBe(403);
    const list = await request(app).get("/api/admin/reviews?rating=1").set(admin);
    expect(list.body.reviews).toEqual([expect.objectContaining({ id: spam.body.review.id, customer: { name: "Rohan Mehta", email: b.email }, product: { slug: SLUG, name: "Men Anti-Hairfall Therapy" } })]);

    const hidden = await request(app).patch(`/api/admin/reviews/${spam.body.review.id}`).set(admin).send({ status: "hidden", note: "Spam" });
    expect(hidden.body.review.status).toBe("hidden");
    expect((await Product.findOne({ slug: SLUG })).rating.toObject()).toEqual({ average: 5, count: 1 });
    expect((await request(app).get(`/api/products/${SLUG}/reviews`)).body.reviews.map((r) => r.authorName)).toEqual(["Priya S."]);

    expect((await request(app).delete(`/api/admin/reviews/${spam.body.review.id}`).set(admin)).status).toBe(204);
    expect(await Review.countDocuments()).toBe(1);
  });

  it("serves recent 4–5 star highlights with their product", async () => {
    const s = await registerUser(app, { name: "Priya Sharma" });
    await review(bearer(s.accessToken), { orderNumber: (await orderFor(s)).orderNumber });
    const res = await request(app).get("/api/reviews/highlights?limit=3");
    expect(res.body.reviews).toEqual([expect.objectContaining({ authorName: "Priya S.", rating: 5, product: expect.objectContaining({ slug: SLUG }) })]);
  });

  it("builds a privacy-friendly display name", () => {
    expect(displayName("Priya Sharma")).toBe("Priya S.");
    expect(displayName("  ravi  kumar  reddy ")).toBe("ravi R.");
    expect(displayName("Madonna")).toBe("Madonna");
    expect(displayName("")).toBe("Verified buyer");
  });
});

describe("blog", () => {
  it("serves seeded categories, paged posts, the featured article and an article with related posts", async () => {
    const cats = await request(app).get("/api/blog/categories");
    expect(cats.body.total).toBe(6);
    expect(cats.body.categories.map((c) => c.name)).toEqual(["Hair Fall Guide", "Men's Hair Care", "Women's Hair Care", "Ayurveda & Ingredients", "Product Education", "Lifestyle & Wellness"]);
    expect(cats.body.categories[0].count).toBe(1);

    const page1 = await request(app).get("/api/blog/posts?limit=4");
    expect(page1.body).toMatchObject({ page: 1, pages: 2, total: 6 });
    expect(page1.body.posts[0]).toMatchObject({ slug: "why-hair-fall-happens-after-21", category: { slug: "hair-fall-guide", name: "Hair Fall Guide" }, author: { name: "ManushyaM Ayurveda Team" }, readMinutes: expect.any(Number) });
    expect(page1.body.posts[0].contentHtml).toBeUndefined();
    expect((await request(app).get("/api/blog/posts?category=product-education")).body.posts.map((p) => p.slug)).toEqual(["how-to-use-hair-oil-correctly"]);
    expect((await request(app).get("/api/blog/posts?category=nope")).status).toBe(404);

    expect((await request(app).get("/api/blog/featured")).body.post.slug).toBe("why-hair-fall-happens-after-21");
    const article = await request(app).get("/api/blog/posts/bhringraj-for-hair-why-ayurveda-loves-it");
    expect(article.body.post.contentHtml).toContain("<h2>What it is traditionally used for</h2>");
    expect(article.body.post.seo).toEqual({ title: "Bhringraj for Hair: Why Ayurveda Loves It", description: expect.any(String) });
    expect(article.body.related).toHaveLength(3);
    expect(article.headers["cache-control"]).toBe("public, max-age=60");
  });

  it("hides drafts and scheduled posts until their time", async () => {
    await BlogPost.create({ slug: "draft-post", title: "Draft post", status: "draft" });
    await BlogPost.create({ slug: "future-post", title: "Future post", status: "published", publishAt: new Date(Date.now() + 86400000) });
    expect((await request(app).get("/api/blog/posts/draft-post")).status).toBe(404);
    expect((await request(app).get("/api/blog/posts/future-post")).status).toBe(404);
    expect((await request(app).get("/api/blog/posts")).body.total).toBe(6);
  });

  it("lets admins write articles with server-side sanitised HTML, one featured at a time", async () => {
    const admin = bearer((await registerAs(app, "admin")).accessToken);
    const staff = bearer((await registerAs(app, "staff")).accessToken);
    const cat = await BlogCategory.findOne({ slug: "lifestyle-wellness" });
    const body = {
      slug: "monsoon-scalp-care",
      title: "Monsoon Scalp Care",
      category: String(cat._id),
      status: "published",
      isFeatured: true,
      contentHtml: `<h1>Big</h1><p onclick="steal()">Hello <script>alert(1)</script><a href="javascript:alert(1)">bad</a> <a href="https://example.org">ext</a> <a href="/solutions">shop</a></p><img src="x" onerror="alert(1)"><img src="data:image/png;base64,AAA"><img src="/images/blog/blog-1.jpg" alt="ok"><iframe src="https://evil.example"></iframe><style>body{}</style>`,
    };
    expect((await request(app).post("/api/admin/blog/posts").set(staff).send(body)).status).toBe(403);
    const res = await request(app).post("/api/admin/blog/posts").set(admin).send(body);
    expect(res.status).toBe(201);
    const html = res.body.post.contentHtml;
    expect(html).not.toMatch(/script|onclick|onerror|javascript:|data:|iframe|style/);
    expect(html).toContain("<h2>Big</h2>");
    expect(html).toContain('<a href="https://example.org" target="_blank" rel="noopener noreferrer nofollow">ext</a>');
    expect(html).toContain('<a href="/solutions">shop</a>');
    expect(html).toContain('<img src="/images/blog/blog-1.jpg" alt="ok" loading="lazy" />');
    expect(res.body.post.excerpt).toBe("Big Hello bad ext shop");
    expect(res.body.post.publishAt).toBeTruthy();

    expect((await request(app).get("/api/blog/featured")).body.post.slug).toBe("monsoon-scalp-care");
    expect(await BlogPost.countDocuments({ isFeatured: true })).toBe(1);
    expect((await request(app).post("/api/admin/blog/posts").set(admin).send({ ...body, contentHtml: "<p>x</p>" })).status).toBe(409);
    expect((await request(app).post("/api/admin/blog/posts").set(admin).send({ ...body, slug: "img", coverImage: { url: "javascript:alert(1)" } })).status).toBe(400);

    const id = res.body.post.id;
    const upd = await request(app).patch(`/api/admin/blog/posts/${id}`).set(admin).send({ status: "draft" });
    expect(upd.body.post.status).toBe("draft");
    expect((await request(app).get("/api/blog/posts/monsoon-scalp-care")).status).toBe(404);
    expect((await request(app).delete(`/api/admin/blog/categories/${cat._id}`).set(admin)).status).toBe(409);
    expect((await request(app).delete(`/api/admin/blog/posts/${id}`).set(admin)).status).toBe(204);
  });

  it("sanitiser helpers", () => {
    expect(sanitizePostHtml('<p><a href="//evil.example/x">x</a></p>')).toBe("<p><a>x</a></p>");
    expect(readMinutes(`<p>${"word ".repeat(600)}</p>`)).toBe(3);
    expect(deriveExcerpt(`<p>${"alpha beta ".repeat(40)}</p>`, 30)).toBe("alpha beta alpha beta alpha…");
  });
});

describe("newsletter", () => {
  const tokenFromOutbox = (to) => [...outbox].reverse().find((m) => m.to === to && m.meta?.purpose === "newsletter-confirm")?.meta.token;

  it("double opt-in: subscribe sends a confirmation link; confirming subscribes and sends an unsubscribe link", async () => {
    const res = await request(app).post("/api/newsletter/subscribe").send({ email: "Reader@Example.com", source: "blog" });
    expect(res.status).toBe(202);
    await drainMailQueue();
    const token = tokenFromOutbox("reader@example.com");
    expect(token).toBeTruthy();
    expect((await NewsletterSubscriber.findOne()).toObject()).toMatchObject({ email: "reader@example.com", status: "pending", source: "blog" });

    // A quick repeat doesn't send another email.
    await request(app).post("/api/newsletter/subscribe").send({ email: "reader@example.com" });
    await drainMailQueue();
    expect(outbox.filter((m) => m.meta?.purpose === "newsletter-confirm")).toHaveLength(1);

    expect((await request(app).post("/api/newsletter/confirm").send({ token })).body.status).toBe("subscribed");
    expect((await request(app).post("/api/newsletter/confirm").send({ token })).status).toBe(400);
    await drainMailQueue();
    const welcome = outbox.find((m) => m.meta?.purpose === "newsletter-welcome");
    expect(welcome.headers["List-Unsubscribe"]).toContain("/newsletter/unsubscribe?e=");

    const url = new URL(welcome.meta.unsubscribeUrl);
    const bad = await request(app).post("/api/newsletter/unsubscribe").send({ e: url.searchParams.get("e"), t: "x".repeat(43) });
    expect(bad.status).toBe(400);
    const ok = await request(app).post("/api/newsletter/unsubscribe").send({ e: url.searchParams.get("e"), t: url.searchParams.get("t") });
    expect(ok.body.status).toBe("unsubscribed");
    expect((await NewsletterSubscriber.findOne()).status).toBe("unsubscribed");
  });

  it("answers the same for existing subscribers and bots, without emailing", async () => {
    await NewsletterSubscriber.create({ email: "fan@example.com", status: "subscribed" });
    const existing = await request(app).post("/api/newsletter/subscribe").send({ email: "fan@example.com" });
    const bot = await request(app).post("/api/newsletter/subscribe").send({ email: "bot@example.com", website: "http://spam" });
    expect([existing.status, bot.status]).toEqual([202, 202]);
    expect(existing.body).toEqual(bot.body);
    await drainMailQueue();
    expect(outbox).toHaveLength(0);
    expect(await NewsletterSubscriber.countDocuments()).toBe(1);
  });

  it("lists subscribers for admins only", async () => {
    await NewsletterSubscriber.create({ email: "fan@example.com", status: "subscribed" });
    const admin = bearer((await registerAs(app, "admin")).accessToken);
    const res = await request(app).get("/api/admin/newsletter").set(admin);
    expect(res.body).toMatchObject({ total: 1, counts: { subscribed: 1 } });
  });
});

describe("contact form", () => {
  const message = { fullName: "Ravi Kumar", email: "ravi@example.com", phone: "+91 98765 43210", subject: "orders", message: "Where is my order? It has been a week." };

  it("stores the message, emails support (reply-to the customer) and acknowledges the sender", async () => {
    const res = await request(app).post("/api/contact").send(message);
    expect(res.status).toBe(201);
    const saved = await ContactMessage.findOne();
    expect(saved.toObject()).toMatchObject({ name: "Ravi Kumar", phone: "9876543210", subject: "orders", status: "new" });
    await drainMailQueue();
    const support = outbox.find((m) => m.meta?.purpose === "contact-support");
    expect(support).toMatchObject({ to: "care@manushyam.com", replyTo: "ravi@example.com", subject: "[Contact] Orders & shipping — Ravi Kumar" });
    expect(outbox.find((m) => m.meta?.purpose === "contact-ack").to).toBe("ravi@example.com");
  });

  it("escapes message HTML in the support email", async () => {
    await request(app).post("/api/contact").send({ ...message, message: "<img src=x onerror=alert(1)> please help" });
    await drainMailQueue();
    expect(outbox.find((m) => m.meta?.purpose === "contact-support").html).toContain("&lt;img src=x onerror=alert(1)&gt;");
  });

  it("quietly drops honeypot submissions and validates fields", async () => {
    const bot = await request(app).post("/api/contact").send({ ...message, website: "spam" });
    expect(bot.status).toBe(201);
    expect(await ContactMessage.countDocuments()).toBe(0);
    const bad = await request(app).post("/api/contact").send({ ...message, subject: "nope", message: "hi" });
    expect(bad.status).toBe(400);
    expect(bad.body.error.details.map((d) => d.path).sort()).toEqual(["message", "subject"]);
  });

  it("requires a valid Turnstile token when configured", async () => {
    const guarded = buildApp({ TURNSTILE_SECRET_KEY: "turnstile-secret" });
    const real = globalThis.fetch;
    const verify = vi.spyOn(globalThis, "fetch").mockImplementation(async (url, init) => {
      if (!String(url).includes("challenges.cloudflare.com")) return real(url, init);
      const ok = init.body.get("response") === "good-token";
      return new Response(JSON.stringify({ success: ok }), { headers: { "content-type": "application/json" } });
    });
    expect((await request(guarded).post("/api/contact").send(message)).body.error.code).toBe("CAPTCHA_FAILED");
    expect((await request(guarded).post("/api/contact").send({ ...message, turnstileToken: "bad" })).status).toBe(400);
    expect((await request(guarded).post("/api/contact").send({ ...message, turnstileToken: "good-token" })).status).toBe(201);
    expect(verify.mock.calls.filter(([u]) => String(u).includes("challenges")).at(-1)[1].body.get("secret")).toBe("turnstile-secret");
  });

  it("is readable by staff and admins only", async () => {
    await request(app).post("/api/contact").send(message);
    const customer = bearer((await registerUser(app)).accessToken);
    const staff = bearer((await registerAs(app, "staff")).accessToken);
    expect((await request(app).get("/api/admin/contact-messages").set(customer)).status).toBe(403);
    const list = await request(app).get("/api/admin/contact-messages").set(staff);
    expect(list.body).toMatchObject({ total: 1, counts: { new: 1 } });
    const upd = await request(app).patch(`/api/admin/contact-messages/${list.body.messages[0].id}`).set(staff).send({ status: "replied" });
    expect(upd.body.message.status).toBe("replied");
  });
});
