import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { screen, within, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderRoute } from "../../test/renderRoute";
import { installFakeApi, signedInAs, customer, admin } from "../../test/fakeApi";

const toFile = vi.fn(async () => {});
const writeExcelFile = vi.fn(() => ({ toFile }));
vi.mock("write-excel-file/browser", () => ({ default: (...args) => writeExcelFile(...args) }));
// TipTap needs real layout APIs; a textarea stands in for it here.
vi.mock("../../components/admin/RichTextEditor", () => ({
  default: ({ value, onChange, label = "Article text" }) => <textarea aria-label={label} value={value} onChange={(e) => onChange(e.target.value)} />,
}));

const saved = [];
beforeEach(() => {
  saved.length = 0;
  vi.stubGlobal("URL", Object.assign(URL, { createObjectURL: vi.fn((blob) => (saved.push(blob), "blob:x")), revokeObjectURL: vi.fn() }));
});
afterEach(() => {
  vi.unstubAllGlobals();
  toFile.mockClear();
  writeExcelFile.mockClear();
});

const staff = { ...customer, id: "s1", name: "Sunil Staff", email: "staff@example.com", role: "staff" };
const EMPTY_CART = { items: [], lines: [], count: 0, subtotal: 0, discount: 0, shipping: 0, total: 0, coupon: null, issues: [], canCheckout: false };
function base(user, handlers = {}) {
  return {
    ...signedInAs(user),
    "GET /api/cart": () => [200, { cart: EMPTY_CART }],
    "GET /api/wishlist": () => [200, { products: [] }],
    "GET /api/notifications": () => [200, { notifications: [], unreadCount: 0 }],
    ...handlers,
  };
}
const lastCall = (fake, method, path) => fake.calls.filter((c) => c.method === method && c.path === path).at(-1);

describe("admin-only screens", () => {
  it("are closed to staff", async () => {
    installFakeApi(base(staff));
    renderRoute("/admin/users");
    expect(await screen.findByRole("heading", { name: "You don’t have access to this page" })).toBeInTheDocument();
  });
});

describe("users", () => {
  const user = (o = {}) => ({ id: "u2", name: "Kavya Iyer", email: "kavya@example.com", phone: null, role: "customer", isActive: true, deletedAt: null, createdAt: "2026-10-01T10:00:00Z", lastLoginAt: null, orders: 2, spent: 49900, ...o });
  function usersApi() {
    let current = user();
    return base(admin, {
      "GET /api/admin/users": () => [200, { users: [current], total: 1, page: 1, pages: 1, counts: { customer: 1, admin: 1 } }],
      "GET /api/admin/users/u2": () => [200, { user: current, recentOrders: [{ id: "o1", orderNumber: "MM261004-7KQ2X", status: "delivered", total: 49900, createdAt: "2026-10-04T10:00:00Z" }], addresses: 1 }],
      "PATCH /api/admin/users/u2": (body) => {
        current = { ...current, ...body };
        return [200, { user: current }];
      },
      "POST /api/admin/users": (body) => [201, { user: user({ id: "u3", ...body, orders: 0, spent: 0 }) }],
    });
  }

  it("filters, opens an account, changes its role and links to its orders", async () => {
    const fake = installFakeApi(usersApi());
    const u = userEvent.setup();
    const { router } = renderRoute("/admin/users");
    await u.selectOptions(await screen.findByLabelText("Role"), "customer");
    await waitFor(() => expect(router.state.location.search).toBe("?role=customer"));
    await u.click(await screen.findByRole("button", { name: "Kavya Iyer" }));
    const panel = await screen.findByRole("dialog", { name: "Kavya Iyer" });
    expect(await within(panel).findByRole("link", { name: "MM261004-7KQ2X" })).toHaveAttribute("href", "/admin/orders?q=MM261004-7KQ2X");
    await u.selectOptions(within(panel).getByLabelText("Role"), "staff");
    await waitFor(() => expect(lastCall(fake, "PATCH", "/api/admin/users/u2")?.body).toEqual({ role: "staff" }));
    await u.click(within(panel).getByRole("button", { name: "Deactivate" }));
    await waitFor(() => expect(lastCall(fake, "PATCH", "/api/admin/users/u2").body).toEqual({ isActive: false }));
    expect(await within(panel).findByRole("button", { name: "Activate" })).toBeInTheDocument();
  });

  it("creates an account and exports the list to Excel", async () => {
    const fake = installFakeApi(usersApi());
    const u = userEvent.setup();
    renderRoute("/admin/users");
    await u.click(await screen.findByRole("button", { name: /New user/ }));
    const form = await screen.findByRole("form", { name: "New user" });
    await u.type(within(form).getByLabelText(/Full name/), "Meera Nair");
    await u.type(within(form).getByLabelText(/Email/), "meera@example.com");
    await u.selectOptions(within(form).getByLabelText("Role"), "staff");
    await u.click(within(form).getByRole("button", { name: "Create account" }));
    await waitFor(() => expect(lastCall(fake, "POST", "/api/admin/users")?.body).toEqual({ name: "Meera Nair", email: "meera@example.com", role: "staff" }));

    await u.click(screen.getByRole("button", { name: /Export to Excel/ }));
    await waitFor(() => expect(toFile).toHaveBeenCalledWith(expect.stringMatching(/^manushyam-users-\d{4}-\d{2}-\d{2}\.xlsx$/)));
    const [rows, { columns }] = writeExcelFile.mock.calls[0];
    expect(columns.find((c) => c.header.value === "Spent (₹)").cell(rows[0]).value).toBe(499);
  });
});

describe("coupons", () => {
  it("creates a coupon in paise, toggles it, and deactivates used coupons instead of deleting", async () => {
    const used = { id: "c1", code: "MONSOON15", type: "percent", value: 15, minOrder: 0, usedCount: 3, isActive: true, confirmedUses: 3, totalDiscount: 27000 };
    const fake = installFakeApi(
      base(admin, {
        "GET /api/admin/coupons": () => [200, { coupons: [used] }],
        "POST /api/admin/coupons": (body) => [201, { coupon: { id: "c2", usedCount: 0, isActive: true, ...body } }],
        "PATCH /api/admin/coupons/c1": (body) => [200, { coupon: { ...used, ...body } }],
        "DELETE /api/admin/coupons/c1": () => [200, { deleted: false }],
      })
    );
    const u = userEvent.setup();
    renderRoute("/admin/coupons");
    await u.click(await screen.findByRole("button", { name: /New coupon/ }));
    const form = await screen.findByRole("form", { name: "New coupon" });
    await u.type(within(form).getByLabelText("Prefix"), "diwali");
    await u.click(within(form).getByRole("button", { name: /Generate/ }));
    expect(within(form).getByLabelText(/^Code/).value).toMatch(/^DIWALI-[A-Z2-9]{6}$/);
    await u.selectOptions(within(form).getByLabelText("Discount type"), "flat");
    await u.clear(within(form).getByLabelText(/Amount off/));
    await u.type(within(form).getByLabelText(/Amount off/), "150");
    await u.type(within(form).getByLabelText("Minimum order (₹)"), "999");
    await u.click(within(form).getByRole("button", { name: "Create coupon" }));
    await waitFor(() => expect(lastCall(fake, "POST", "/api/admin/coupons")?.body).toMatchObject({ type: "flat", value: 15000, minOrder: 99900 }));

    await u.click(screen.getByRole("switch", { name: "MONSOON15 active" }));
    await waitFor(() => expect(lastCall(fake, "PATCH", "/api/admin/coupons/c1")?.body).toEqual({ isActive: false }));
    await u.click(screen.getByRole("button", { name: "Delete MONSOON15" }));
    expect(await screen.findByText(/has been used, so it was deactivated/)).toBeInTheDocument();
  });
});

describe("delivery", () => {
  const settings = { standard: { fee: 0, eta: { min: 3, max: 7 } }, freeShippingThreshold: 0, express: { enabled: false, fee: 9900, eta: { min: 1, max: 3 } }, cod: { enabled: true, fee: 0, maxOrder: 500000 }, minOrder: 0, serviceByDefault: true };
  const rules = [
    { id: "r1", pincode: "560001", city: "Bengaluru", state: "Karnataka", serviceable: true, codAvailable: false, isActive: true },
    { id: "r2", pincode: "110", serviceable: false, codAvailable: true, isActive: true },
  ];

  it("saves store rules in paise", async () => {
    const fake = installFakeApi(base(admin, { "GET /api/admin/delivery": () => [200, { settings, shiprocket: false }], "PUT /api/admin/delivery": (body) => [200, { settings: body }] }));
    const u = userEvent.setup();
    renderRoute("/admin/delivery");
    const form = await screen.findByRole("form", { name: "Delivery settings" });
    await u.clear(within(form).getByLabelText("COD fee (₹)"));
    await u.type(within(form).getByLabelText("COD fee (₹)"), "49");
    await u.click(within(form).getByRole("switch", { name: "Offer express" }));
    await u.click(within(form).getByRole("button", { name: "Save delivery settings" }));
    await waitFor(() => expect(lastCall(fake, "PUT", "/api/admin/delivery")?.body).toMatchObject({ cod: { enabled: true, fee: 4900, maxOrder: 500000 }, express: { enabled: true, fee: 9900 } }));
  });

  it("shows CSV import problems line by line and runs bulk actions on selected rules", async () => {
    const fake = installFakeApi(
      base(admin, {
        "GET /api/admin/delivery": () => [200, { settings, shiprocket: false }],
        "GET /api/admin/pincode-rules": () => [200, { rules }],
        "POST /api/admin/pincode-rules/import": () => [400, { error: { code: "VALIDATION_ERROR", message: "1 problem found — nothing was imported.", details: [{ path: "line 3", message: "state: “Atlantis” is not an Indian state or UT" }] } }],
        "POST /api/admin/pincode-rules/bulk": (body) => [200, { affected: body.ids.length }],
      })
    );
    const u = userEvent.setup();
    renderRoute("/admin/delivery");
    await u.click(await screen.findByRole("tab", { name: "PIN codes" }));
    expect(await screen.findByText("110xxx")).toBeInTheDocument();
    // FormData bodies aren't JSON; the fake API only records the call.
    const realParse = JSON.parse;
    vi.spyOn(JSON, "parse").mockImplementation((t, ...r) => (typeof t === "string" ? realParse(t, ...r) : undefined));
    await u.upload(screen.getByLabelText("CSV file to import"), new File(["pincode\n1"], "rules.csv", { type: "text/csv" }));
    const alert = await screen.findByText("1 problem found — nothing was imported.");
    expect(alert.closest("[role=alert]")).toHaveTextContent("line 3: state: “Atlantis” is not an Indian state or UT");
    JSON.parse.mockRestore();

    await u.click(screen.getByLabelText("Select 560001"));
    await u.click(screen.getByLabelText("Select 110"));
    await u.click(within(screen.getByRole("group", { name: "Bulk actions" })).getByRole("button", { name: "Deactivate" }));
    await waitFor(() => expect(lastCall(fake, "POST", "/api/admin/pincode-rules/bulk")?.body).toEqual({ ids: ["r1", "r2"], action: "deactivate" }));
  });
});

describe("content", () => {
  it("replaces a storefront image, and the store shows the override", async () => {
    let slots = {};
    const fake = installFakeApi(
      base(admin, {
        "GET /api/admin/appearance": () => [200, { slots }],
        "PUT /api/admin/appearance/aboutHero": (body) => {
          slots = { aboutHero: body };
          return [200, { slots }];
        },
        "GET /api/appearance": () => [200, { slots }],
      })
    );
    const u = userEvent.setup();
    const { router } = renderRoute("/admin/content?tab=images");
    const card = (await screen.findByRole("heading", { name: "About hero" })).closest("li");
    await u.click(within(card).getByRole("button", { name: "Replace" }));
    await u.type(within(card).getByLabelText("New image for About hero"), "https://res.cloudinary.com/demo/about.jpg");
    await u.clear(within(card).getByLabelText("New image for About hero alt text"));
    await u.type(within(card).getByLabelText("New image for About hero alt text"), "Copper pot");
    await u.click(within(card).getByRole("button", { name: "Save image" }));
    await waitFor(() => expect(lastCall(fake, "PUT", "/api/admin/appearance/aboutHero")?.body).toEqual({ url: "https://res.cloudinary.com/demo/about.jpg", alt: "Copper pot" }));
    expect(await within(card).findByText("Custom")).toBeInTheDocument();

    await router.navigate("/about");
    expect(await screen.findByRole("img", { name: "Copper pot" })).toHaveAttribute("src", "https://res.cloudinary.com/demo/about.jpg");
  });

  it("adds an FAQ", async () => {
    const fake = installFakeApi(base(admin, { "GET /api/admin/faqs": () => [200, { items: [] }], "POST /api/admin/faqs": (body) => [201, { item: { id: "f1", ...body } }] }));
    const u = userEvent.setup();
    renderRoute("/admin/content?tab=faqs");
    await u.click(await screen.findByRole("button", { name: /Add FAQ/ }));
    const form = await screen.findByRole("form", { name: "FAQ" });
    await u.type(within(form).getByLabelText(/Question/), "Can I use it daily?");
    await u.type(within(form).getByLabelText(/Answer/), "Yes, twice a week is ideal.");
    await u.selectOptions(within(form).getByLabelText("Topic"), "orders");
    await u.click(within(form).getByRole("button", { name: "Add FAQ" }));
    await waitFor(() => expect(lastCall(fake, "POST", "/api/admin/faqs")?.body).toEqual({ question: "Can I use it daily?", answer: "Yes, twice a week is ideal.", topic: "orders", isPublished: true, sortOrder: 0 }));
  });
});

describe("blog editor", () => {
  it("writes a draft with a slug from the title, then lands on the saved article", async () => {
    const post = { id: "b1", title: "Oiling 101", slug: "oiling-101", contentHtml: "<p>Warm the oil.</p>", status: "draft", tags: ["oil"], author: { name: "ManushyaM Ayurveda Team" }, category: "k1", isFeatured: false, updatedAt: "2026-10-16T10:00:00Z" };
    const fake = installFakeApi(
      base(admin, {
        "GET /api/admin/blog/categories": () => [200, { categories: [{ id: "k1", name: "Hair care", slug: "hair-care" }] }],
        "POST /api/admin/blog/posts": () => [201, { post }],
        "GET /api/admin/blog/posts/b1": () => [200, { post }],
      })
    );
    const u = userEvent.setup();
    const { router } = renderRoute("/admin/blog/new");
    const form = await screen.findByRole("form", { name: "Article" });
    await u.type(within(form).getByLabelText(/^Title/), "Oiling 101");
    expect(within(form).getByLabelText(/URL slug/)).toHaveValue("oiling-101");
    await u.type(await within(form).findByLabelText("Article text"), "<p>Warm the oil.</p>");
    await u.selectOptions(within(form).getByLabelText("Category"), "k1");
    await u.type(within(form).getByLabelText("Tags"), "Oil, ");
    await u.click(within(form).getByRole("button", { name: "Save draft" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/admin/blog/b1"));
    expect(lastCall(fake, "POST", "/api/admin/blog/posts").body).toMatchObject({ title: "Oiling 101", slug: "oiling-101", contentHtml: "<p>Warm the oil.</p>", category: "k1", tags: ["oil"], status: "draft", publishAt: null });
  });
});

describe("reviews", () => {
  it("hides a review with a note and links to its order", async () => {
    const review = { id: "r1", rating: 1, title: "Spam", body: "Buy followers at example dot com", authorName: "X Y.", status: "published", createdAt: "2026-10-10T10:00:00Z", product: { slug: "men", name: "Men Therapy" }, orderNumber: "MM261004-7KQ2X", customer: { name: "X Y", email: "x@example.com" } };
    const fake = installFakeApi(base(admin, { "GET /api/admin/reviews": () => [200, { reviews: [review], page: 1, pages: 1, total: 1 }], "PATCH /api/admin/reviews/r1": (body) => [200, { review: { ...review, status: body.status } }] }));
    const u = userEvent.setup();
    renderRoute("/admin/reviews");
    expect(await screen.findByRole("link", { name: "View order MM261004-7KQ2X" })).toHaveAttribute("href", "/admin/orders?q=MM261004-7KQ2X");
    await u.type(screen.getByLabelText("Moderation note (internal)"), "spam link");
    await u.click(screen.getByRole("button", { name: "Hide" }));
    await waitFor(() => expect(lastCall(fake, "PATCH", "/api/admin/reviews/r1")?.body).toEqual({ status: "hidden", note: "spam link" }));
    expect(await screen.findByRole("button", { name: "Show" })).toBeInTheDocument();
  });
});

describe("sales analytics", () => {
  const report = (days = 30) => ({
    range: { from: "2026-09-17", to: "2026-10-16", days, granularity: "day", previous: { from: "2026-08-18", to: "2026-09-16" } },
    kpis: { orders: 5, cancelled: 1, revenue: 240000, units: 5, refunds: 10000, customers: 2, aov: 60000 },
    previous: { revenue: 120000, orders: 2, aov: 60000, customers: 1 },
    trend: Array.from({ length: days }, (_, i) => ({ key: `2026-10-${String((i % 28) + 1).padStart(2, "0")}`, orders: i % 3, revenue: (i % 3) * 49900 })),
    topProducts: [{ sku: "MM-MEN-THERAPY", name: "Men Therapy", variant: "Kit", slug: "men", qty: 3, revenue: 150000, orders: 2 }],
    customers: { new: { customers: 1, orders: 2, revenue: 140000 }, returning: { customers: 1, orders: 2, revenue: 100000 } },
    payments: [
      { method: "razorpay", orders: 2, revenue: 100000, aov: 50000 },
      { method: "cod", orders: 3, revenue: 140000, aov: 70000 },
    ],
    rto: { delivered: 3, rto: 1, codRto: 1, rate: 0.25 },
  });

  it("shows KPIs against the previous period, switches ranges and downloads the PDF", async () => {
    const fake = installFakeApi(base(admin, { "GET /api/admin/analytics/sales": () => [200, report()], "GET /api/admin/analytics/sales.pdf": () => [200, {}] }));
    const u = userEvent.setup();
    const { router } = renderRoute("/admin/analytics");
    const kpis = await screen.findByRole("list", { name: "Key figures" });
    expect(within(kpis).getByText("₹2,400")).toBeInTheDocument();
    expect(within(kpis).getByText("+100.0% vs previous 30 days")).toBeInTheDocument();
    expect(within(kpis).getByText("25.0%")).toBeInTheDocument();
    expect(screen.getByRole("figure", { name: "Net revenue by day" })).toBeInTheDocument();
    expect(screen.getByRole("figure", { name: "Confirmed orders by day" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "New vs returning customers" })).toHaveTextContent("58.3%");

    await u.click(screen.getByRole("button", { name: "7 days" }));
    await waitFor(() => expect(router.state.location.search).toBe("?range=7d"));
    const q = lastCall(fake, "GET", "/api/admin/analytics/sales").query;
    expect(q.to).toBe(new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date()));
    expect((Date.parse(q.to) - Date.parse(q.from)) / 86400000).toBe(6);

    await u.click(screen.getByRole("button", { name: /PDF report/ }));
    await waitFor(() => expect(lastCall(fake, "GET", "/api/admin/analytics/sales.pdf")?.query).toEqual(q));
  });
});

describe("audit log", () => {
  it("lists changes and expands an entry to show before and after", async () => {
    const entry = { id: "a1", actor: "u9", actorEmail: "admin@manushyam.com", actorRole: "admin", action: "coupon.update", resource: "coupon", resourceId: "c1", summary: "MONSOON15", before: { minOrder: 0 }, after: { minOrder: 50000 }, method: "PATCH", path: "/api/admin/coupons/c1", status: 200, ip: "203.0.113.9", requestId: "req-1", createdAt: "2026-10-16T09:00:00Z" };
    const fake = installFakeApi(base(admin, { "GET /api/admin/audit-logs": () => [200, { entries: [entry], total: 1, page: 1, pages: 1, facets: { resources: ["coupon", "settings"], actors: [{ id: "u9", email: "admin@manushyam.com", role: "admin" }] } }] }));
    const u = userEvent.setup();
    renderRoute("/admin/settings?tab=audit");
    await u.click(await screen.findByRole("button", { name: "coupon.update" }));
    const row = screen.getByText("minOrder").closest("tr");
    expect(row).toHaveTextContent("050000");
    expect(screen.getByText("203.0.113.9")).toBeInTheDocument();
    await u.selectOptions(screen.getByLabelText("Area"), "coupon");
    await waitFor(() => expect(lastCall(fake, "GET", "/api/admin/audit-logs").query).toMatchObject({ resource: "coupon" }));
  });
});

describe("orders export", () => {
  it("downloads the filtered orders as CSV, safe for spreadsheets", async () => {
    const row = { orderNumber: "MM261004-7KQ2X", placedAt: "2026-10-04T10:00:00Z", status: "delivered", paymentMethod: "cod", customer: "=cmd", email: "a@example.com", items: "MM-MEN-THERAPY × 1", units: 1, subtotal: 49900, discount: 0, shipping: 0, codFee: 0, total: 49900, refunded: 0 };
    const fake = installFakeApi(
      base(staff, {
        "GET /api/admin/orders": () => [200, { orders: [], page: 1, pages: 1, total: 0, counts: {} }],
        "GET /api/admin/orders-export": () => [200, { rows: [row], truncated: false, limit: 5000 }],
      })
    );
    const u = userEvent.setup();
    renderRoute("/admin/orders?status=delivered");
    await u.click(await screen.findByRole("button", { name: /Export/ }));
    const dialog = await screen.findByRole("dialog", { name: "Export orders" });
    await u.click(within(dialog).getByRole("button", { name: "Download CSV" }));
    await waitFor(() => expect(saved).toHaveLength(1));
    expect(lastCall(fake, "GET", "/api/admin/orders-export").query).toMatchObject({ status: "delivered" });
    const text = await saved[0].text();
    expect(text).toContain("MM261004-7KQ2X");
    expect(text).toContain("'=cmd");
    expect(text).toContain(",499,");
  });
});
