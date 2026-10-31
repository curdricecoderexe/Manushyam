import { describe, it, expect, vi, afterEach } from "vitest";
import { screen, within, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderRoute } from "../../test/renderRoute";
import { installFakeApi, signedInAs, customer } from "../../test/fakeApi";
import { catalogApi } from "../../test/catalogFixtures";

afterEach(() => vi.unstubAllGlobals());

const cat = (slug, name, count) => ({ slug, name, description: "", count });
const post = (n, overrides = {}) => ({
  id: `p${n}`,
  slug: `article-${n}`,
  title: `Article number ${n}`,
  excerpt: `Excerpt for article ${n}.`,
  coverImage: { url: `/images/blog/blog-${n}.jpg`, alt: "" },
  category: { slug: "hair-fall-guide", name: "Hair Fall Guide" },
  author: { name: "ManushyaM Ayurveda Team", avatar: null },
  publishedAt: "2025-05-20T03:30:00.000Z",
  readMinutes: 6,
  isFeatured: n === 1,
  ...overrides,
});

function blogApi(overrides = {}) {
  const all = [1, 2, 3, 4, 5, 6].map((n) => post(n, n === 5 ? { category: { slug: "product-education", name: "Product Education" } } : {}));
  return catalogApi({
    "GET /api/blog/categories": () => [200, { categories: [cat("hair-fall-guide", "Hair Fall Guide", 5), cat("product-education", "Product Education", 1), cat("empty", "Empty Category", 0)], total: 6 }],
    "GET /api/blog/featured": () => [200, { post: all[0] }],
    "GET /api/blog/posts": (_b, req) => {
      const list = req.query.category ? all.filter((p) => p.category.slug === req.query.category) : all;
      const limit = Number(req.query.limit ?? 8);
      const page = Number(req.query.page ?? 1);
      return [200, { posts: list.slice((page - 1) * limit, page * limit), page, pages: Math.ceil(list.length / limit), total: list.length }];
    },
    "GET /api/reviews/highlights": () => [200, { reviews: [{ id: "r1", rating: 5, title: "", body: "I saw visible reduction in hair fall in just 3 weeks.", authorName: "Priya S.", verified: true, createdAt: "2026-10-01", product: { slug: "men-anti-hairfall-therapy", name: "Men Anti-Hairfall Therapy", image: null } }] }],
    ...overrides,
  });
}

describe("Blogs & Reviews page", () => {
  it("shows categories, the featured article, a paged grid and verified review highlights", async () => {
    const fake = installFakeApi(blogApi());
    const user = userEvent.setup();
    renderRoute("/blog");
    expect(await screen.findByRole("heading", { level: 1, name: "Blogs & Reviews" })).toBeInTheDocument();

    const nav = await screen.findByRole("navigation", { name: "Article categories" });
    expect(within(nav).getByRole("link", { name: "All Articles" })).toHaveAttribute("aria-current", "page");
    expect(within(nav).queryByRole("link", { name: "Empty Category" })).not.toBeInTheDocument();

    const featured = (await screen.findByRole("heading", { name: "Featured Article" })).closest("section");
    expect(await within(featured).findByRole("link", { name: "Article number 1" })).toHaveAttribute("href", "/blog/article-1");

    const grid = screen.getByRole("heading", { name: "All Articles" }).closest("section");
    await within(grid).findByRole("link", { name: "Article number 4" });
    expect(within(grid).queryByRole("link", { name: "Article number 5" })).not.toBeInTheDocument();
    await user.click(within(grid).getByRole("button", { name: /Load More Articles/ }));
    expect(await within(grid).findByRole("link", { name: "Article number 6" })).toBeInTheDocument();
    expect(within(grid).queryByRole("button", { name: /Load More Articles/ })).not.toBeInTheDocument();
    expect(fake.calls.filter((c) => c.path === "/api/blog/posts").at(-1).query).toEqual({ limit: "4", page: "2" });

    const sidebar = screen.getByRole("complementary", { name: "What People Love About ManushyaM" });
    expect(within(sidebar).getByText(/visible reduction in hair fall/)).toBeInTheDocument();
    expect(within(sidebar).getByText("— Priya S.")).toBeInTheDocument();
    expect(within(sidebar).getByRole("link", { name: /See All Reviews/ })).toHaveAttribute("href", "/solutions/men-anti-hairfall-therapy#reviews");
    expect(screen.getByRole("heading", { name: "Share Your Ritual" })).toBeInTheDocument();
  });

  it("filters by category from the sidebar (URL state) and hides the featured block", async () => {
    installFakeApi(blogApi());
    const user = userEvent.setup();
    const { router } = renderRoute("/blog");
    const nav = await screen.findByRole("navigation", { name: "Article categories" });
    await user.click(await within(nav).findByRole("link", { name: "Product Education" }));
    expect(router.state.location.search).toBe("?category=product-education");
    const grid = (await screen.findByRole("heading", { name: "Product Education" })).closest("section");
    expect(await within(grid).findByRole("link", { name: "Article number 5" })).toBeInTheDocument();
    expect(within(grid).queryByRole("link", { name: "Article number 1" })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Featured Article" })).not.toBeInTheDocument();
  });

  it("subscribes to the newsletter from the sidebar (double opt-in message)", async () => {
    const fake = installFakeApi(blogApi({ "POST /api/newsletter/subscribe": () => [202, { message: "Check your inbox to confirm your subscription." }] }));
    const user = userEvent.setup();
    renderRoute("/blog");
    const card = (await screen.findByRole("heading", { name: "Stay Updated" })).parentElement;
    await user.type(within(card).getByLabelText("Email address"), "reader@example.com");
    await user.click(within(card).getByRole("button", { name: "Subscribe" }));
    expect(await within(card).findByText("Check your inbox to confirm your subscription.")).toBeInTheDocument();
    expect(fake.calls.find((c) => c.path === "/api/newsletter/subscribe").body).toEqual({ email: "reader@example.com", source: "blog" });
  });
});

describe("article page", () => {
  const article = {
    ...post(3),
    contentHtml: "<h2>What it is</h2><p>Bhringraj is called <strong>Keshraj</strong>.</p>",
    tags: ["bhringraj"],
    updatedAt: "2025-05-21T00:00:00Z",
    seo: { title: "Bhringraj for Hair", description: "Why Ayurveda loves Bhringraj." },
  };

  it("renders the article HTML with breadcrumbs, related posts and Article structured data", async () => {
    installFakeApi(catalogApi({ "GET /api/blog/posts/article-3": () => [200, { post: article, related: [post(1), post(2)] }] }));
    renderRoute("/blog/article-3");
    expect(await screen.findByRole("heading", { level: 1, name: "Article number 3" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: "What it is" })).toBeInTheDocument();
    expect(screen.getByText("Keshraj").tagName).toBe("STRONG");
    expect(screen.getByRole("navigation", { name: /breadcrumb/i })).toHaveTextContent("Hair Fall Guide");
    const related = screen.getByRole("heading", { name: "Keep Reading" }).closest("section");
    expect(within(related).getAllByRole("article")).toHaveLength(2);
    await waitFor(() => {
      const ld = [...document.querySelectorAll('script[type="application/ld+json"]')].map((s) => JSON.parse(s.textContent));
      expect(ld.find((d) => d["@type"] === "Article")).toMatchObject({ headline: "Article number 3", articleSection: "Hair Fall Guide", datePublished: article.publishedAt });
    });
  });

  it("shows the not-found page for an unknown article", async () => {
    installFakeApi(catalogApi());
    renderRoute("/blog/nope");
    expect(await screen.findByRole("heading", { level: 1, name: "This path has wandered off." })).toBeInTheDocument();
  });
});

describe("contact page", () => {
  it("validates, then sends the message (with +91 phone) and confirms", async () => {
    const fake = installFakeApi(catalogApi({ "POST /api/contact": () => [201, { message: "Thank you — we’ve received your message and will reply within one working day." }] }));
    const user = userEvent.setup();
    renderRoute("/contact");
    const form = await screen.findByRole("form", { name: "Send us a message" });
    await user.click(within(form).getByRole("button", { name: /Send Message/ }));
    expect(within(form).getByText("Enter your name")).toBeInTheDocument();
    expect(within(form).getByText("Choose a topic")).toBeInTheDocument();
    expect(fake.calls.some((c) => c.path === "/api/contact")).toBe(false);

    await user.type(within(form).getByLabelText(/Full Name/), "Ravi Kumar");
    await user.type(within(form).getByLabelText(/Email Address/), "ravi@example.com");
    await user.type(within(form).getByLabelText(/Phone Number/), "98765 43210");
    await user.selectOptions(within(form).getByLabelText(/Subject/), "orders");
    await user.type(within(form).getByLabelText(/Message/), "Where is my order? It has been a week.");
    await user.click(within(form).getByRole("button", { name: /Send Message/ }));

    expect(await screen.findByText("Message sent")).toBeInTheDocument();
    expect(fake.calls.find((c) => c.path === "/api/contact").body).toEqual({ fullName: "Ravi Kumar", email: "ravi@example.com", phone: "98765 43210", subject: "orders", message: "Where is my order? It has been a week." });
  });

  it("links quick answers into the FAQ topics and shows the support channels", async () => {
    installFakeApi(catalogApi());
    renderRoute("/contact");
    expect(await screen.findByRole("link", { name: /Orders & Shipping/ })).toHaveAttribute("href", "/faq?topic=orders");
    expect(screen.getByRole("link", { name: /Email Support/ })).toHaveAttribute("href", "mailto:care@manushyam.com");
    expect(screen.getAllByRole("link", { name: /WhatsApp/ })[0]).toHaveAttribute("href", "https://wa.me/917829600018");
  });
});

describe("newsletter links", () => {
  it("confirms a subscription from the emailed link", async () => {
    const fake = installFakeApi(catalogApi({ "POST /api/newsletter/confirm": () => [200, { status: "subscribed" }] }));
    renderRoute("/newsletter/confirm?token=abcdefghijklmnopqrstuvwxyz012345");
    expect(await screen.findByRole("heading", { name: "You’re subscribed" })).toBeInTheDocument();
    expect(fake.calls.find((c) => c.path === "/api/newsletter/confirm").body).toEqual({ token: "abcdefghijklmnopqrstuvwxyz012345" });
  });

  it("explains an invalid unsubscribe link", async () => {
    installFakeApi(catalogApi({ "POST /api/newsletter/unsubscribe": () => [400, { error: { code: "BAD_REQUEST", message: "This unsubscribe link is invalid." } }] }));
    renderRoute("/newsletter/unsubscribe?e=abc&t=def");
    expect(await screen.findByText("This unsubscribe link is invalid.")).toBeInTheDocument();
  });

  it("wires the footer signup to the API", async () => {
    const fake = installFakeApi(catalogApi({ "POST /api/newsletter/subscribe": () => [202, { message: "Check your inbox to confirm your subscription." }] }));
    const user = userEvent.setup();
    renderRoute("/faq");
    const footer = await screen.findByRole("contentinfo");
    await user.type(within(footer).getByLabelText("Email address"), "fan@example.com");
    await user.click(within(footer).getByRole("button", { name: "Subscribe" }));
    expect(await within(footer).findByText("Check your inbox to confirm your subscription.")).toBeInTheDocument();
    expect(fake.calls.find((c) => c.path === "/api/newsletter/subscribe").body.source).toBe("footer");
  });
});

describe("product reviews", () => {
  const reviewsFor = (page, sort) => ({
    summary: { average: 4.5, count: 6, distribution: { 5: 4, 4: 1, 3: 1, 2: 0, 1: 0 } },
    reviews: (page === 1 ? [1, 2, 3, 4, 5] : [6]).map((n) => ({ id: `r${n}`, rating: sort === "lowest" ? 3 : 5, title: n === 1 ? "Works!" : "", body: `Review body number ${n}.`, authorName: `Buyer ${n}.`, verified: true, createdAt: "2026-10-01T00:00:00Z" })),
    page,
    pages: 2,
  });

  it("shows the summary, sorts and loads more", async () => {
    const fake = installFakeApi(catalogApi({ "GET /api/products/men-anti-hairfall-therapy/reviews": (_b, req) => [200, reviewsFor(Number(req.query.page ?? 1), req.query.sort)] }));
    const user = userEvent.setup();
    renderRoute("/solutions/men-anti-hairfall-therapy");
    const section = (await screen.findByRole("heading", { name: "Customer Reviews" })).closest("section");
    expect(await within(section).findByText("4.5")).toBeInTheDocument();
    expect(within(section).getByText("6 verified reviews")).toBeInTheDocument();
    expect(within(section).getByRole("list", { name: "Rating breakdown" })).toHaveTextContent("4 reviews with 5 stars");
    expect(within(section).getByText("Works!")).toBeInTheDocument();
    expect(within(section).getAllByText(/Verified purchase/)).toHaveLength(5);

    await user.click(within(section).getByRole("button", { name: "Show more reviews" }));
    expect(await within(section).findByText("Review body number 6.")).toBeInTheDocument();
    await user.selectOptions(within(section).getByLabelText("Sort by"), "lowest");
    await waitFor(() => expect(fake.calls.at(-1).query).toEqual({ sort: "lowest" }));
    expect(await within(section).findAllByRole("img", { name: "3 out of 5 stars" })).toHaveLength(5);
  });

  it("explains that only verified buyers can review when there are none", async () => {
    installFakeApi(catalogApi());
    renderRoute("/solutions/men-anti-hairfall-therapy");
    expect(await screen.findByText("No reviews yet")).toBeInTheDocument();
  });
});

describe("reviewing a delivered order", () => {
  const order = {
    id: "o1",
    orderNumber: "MM261004-7KQ2X",
    status: "delivered",
    paymentMethod: "cod",
    items: [{ sku: "MM-MEN-THERAPY", slug: "men-anti-hairfall-therapy", name: "Men Anti-Hairfall Therapy", variantLabel: "Shampoo + Oil", image: null, price: 49900, mrp: null, qty: 1, lineTotal: 49900 }],
    address: { fullName: "Ananya Sharma", phone: "9876543210", line1: "12 MG Road", city: "Bengaluru", state: "Karnataka", pincode: "560001" },
    delivery: { method: "standard", etaMinDays: 3, etaMaxDays: 7 },
    amounts: { subtotal: 49900, discount: 0, shipping: 0, codFee: 0, total: 49900 },
    coupon: null,
    history: [{ status: "cod_confirmed", at: "2026-10-01T00:00:00Z" }, { status: "delivered", at: "2026-10-04T00:00:00Z" }],
    shipment: null,
    refund: null,
    canCancel: false,
    hasInvoice: true,
    createdAt: "2026-10-01T00:00:00Z",
  };

  it("writes a review from the order page and then offers to edit it", async () => {
    const fake = installFakeApi(
      catalogApi({
        ...signedInAs(customer),
        "GET /api/cart": () => [200, { cart: { items: [], lines: [], count: 0, subtotal: 0, discount: 0, shipping: 0, total: 0, coupon: null, issues: [], canCheckout: false } }],
        "GET /api/wishlist": () => [200, { products: [] }],
        "GET /api/orders/MM261004-7KQ2X": () => [200, { order }],
        "GET /api/me/reviews": () => [200, { reviews: [], pending: [] }],
        "POST /api/reviews": (body) => [201, { review: { id: "r1", rating: body.rating, title: body.title ?? "", body: body.body, authorName: "Ananya S.", verified: true, status: "published", createdAt: "2026-10-04" } }],
      })
    );
    const user = userEvent.setup();
    renderRoute("/account/orders/MM261004-7KQ2X");
    await user.click(await screen.findByRole("button", { name: "Write a review of Men Anti-Hairfall Therapy" }));
    const form = screen.getByRole("form", { name: "Review Men Anti-Hairfall Therapy" });
    await user.click(within(form).getByRole("button", { name: "Submit review" }));
    expect(within(form).getByText("Choose a rating")).toBeInTheDocument();

    await user.click(within(form).getByRole("radio", { name: "4 stars — Very good" }));
    await user.type(within(form).getByLabelText(/Your review/), "Hair feels stronger after a month.");
    await user.click(within(form).getByRole("button", { name: "Submit review" }));
    expect(await screen.findByRole("button", { name: "Edit your review of Men Anti-Hairfall Therapy" })).toBeInTheDocument();
    expect(fake.calls.find((c) => c.path === "/api/reviews").body).toEqual({ orderNumber: "MM261004-7KQ2X", productSlug: "men-anti-hairfall-therapy", rating: 4, body: "Hair feels stronger after a month." });
  });
});
