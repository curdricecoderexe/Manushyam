import { describe, it, expect, vi, afterEach } from "vitest";
import { screen, within, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderRoute } from "../../test/renderRoute";
import { installFakeApi, signedInAs, customer, admin } from "../../test/fakeApi";

const toFile = vi.fn(async () => {});
const writeExcelFile = vi.fn(() => ({ toFile }));
vi.mock("write-excel-file/browser", () => ({ default: (...args) => writeExcelFile(...args) }));

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

const days = ["2026-09-28", "2026-09-29", "2026-09-30", "2026-10-01", "2026-10-02", "2026-10-03", "2026-10-04"];
const dashboard = (withRevenue) => ({
  fulfilment: { toProcess: 3, processing: 1, packed: 2, inTransit: 4, needsAttention: 1 },
  today: { orders: 2, ...(withRevenue ? { revenue: 99800 } : {}) },
  ordersByDay: days.map((date, i) => ({ date, orders: i, ...(withRevenue ? { revenue: i * 49900 } : {}) })),
  stock: { healthy: 1, low: 1, critical: 1, out: 1, thresholds: { critical: 5, low: 20 }, watch: [{ productId: "p1", name: "Men Anti-Hairfall Therapy", slug: "men", sku: "MM-MEN-THERAPY", label: "Shampoo + Oil", stock: 0, level: "out", status: "published" }] },
  support: { pending: 2, active: 1, mine: 1 },
});

describe("staff dashboard", () => {
  it("shows workload, a 7-day order chart and stock health — without money figures for staff", async () => {
    installFakeApi(base(staff, { "GET /api/admin/dashboard": () => [200, dashboard(false)] }));
    renderRoute("/admin");
    expect(await screen.findByRole("heading", { name: "Namaste, Sunil" })).toBeInTheDocument();
    const workload = await screen.findByRole("list", { name: "Workload" });
    expect(within(workload).getByRole("link", { name: /To process\s*3/ })).toHaveAttribute("href", "/admin/orders?status=paid");
    expect(within(workload).getByText("1 assigned to you")).toBeInTheDocument();
    const chart = screen.getByRole("figure", { name: "Confirmed orders, last 7 days" });
    expect(within(chart).getAllByLabelText(/: \d+$/)).toHaveLength(7);
    expect(screen.queryByRole("figure", { name: /Order value/ })).not.toBeInTheDocument();
    const stock = screen.getByRole("region", { name: "Stock health" });
    expect(within(stock).getByRole("link", { name: "Men Anti-Hairfall Therapy" })).toHaveAttribute("href", "/admin/products/p1");
    expect(within(stock).getAllByText("Out of stock")).toHaveLength(2); // tile + row
  });

  it("adds the order value chart for admins and offers a table view", async () => {
    installFakeApi(base(admin, { "GET /api/admin/dashboard": () => [200, dashboard(true)] }));
    const user = userEvent.setup();
    renderRoute("/admin");
    const revenue = await screen.findByRole("figure", { name: "Order value, last 7 days" });
    await user.click(within(revenue).getByRole("button", { name: "Show table" }));
    expect(within(revenue).getByRole("table")).toHaveTextContent("₹2,994");
  });

  it("keeps customers out and hides admin-only sections from staff", async () => {
    installFakeApi(base(customer));
    renderRoute("/admin");
    expect(await screen.findByRole("heading", { name: "You don’t have access to this page" })).toBeInTheDocument();
  });

  it("shows staff only the sections they can use", async () => {
    installFakeApi(base(staff, { "GET /api/admin/dashboard": () => [200, dashboard(false)] }));
    renderRoute("/admin");
    await screen.findByRole("heading", { name: "Namaste, Sunil" });
    const nav = screen.getAllByRole("navigation")[0];
    for (const label of ["Dashboard", "Orders", "Inventory", "Support desk"]) expect(within(nav).getByRole("link", { name: label })).toBeInTheDocument();
    for (const label of ["Coupons", "Users", "Sales analytics", "Web analytics & cookies", "Settings & audit log", "Reviews", "Blog"]) expect(within(nav).queryByRole("link", { name: label })).not.toBeInTheDocument();
  });
});

const adminOrder = (overrides = {}) => ({
  id: "o1",
  orderNumber: "MM261004-7KQ2X",
  user: "u1",
  email: "ananya@example.com",
  customerName: "Ananya Sharma",
  items: [{ sku: "MM-MEN-THERAPY", name: "Men Anti-Hairfall Therapy", variantLabel: "Shampoo + Oil", price: 49900, qty: 2, lineTotal: 99800 }],
  address: { fullName: "Ananya Sharma", phone: "9876543210", line1: "12 MG Road", city: "Bengaluru", state: "Karnataka", pincode: "560001" },
  delivery: { method: "standard" },
  amounts: { subtotal: 99800, discount: 0, shipping: 0, codFee: 0, total: 99800 },
  paymentMethod: "cod",
  status: "cod_confirmed",
  history: [{ status: "cod_confirmed", at: "2026-10-04T10:00:00Z", source: "customer" }],
  payment: {},
  refund: { status: "none" },
  shipment: { events: [] },
  invoiceNumber: "MM/26-27/000001",
  createdAt: "2026-10-04T10:00:00Z",
  ...overrides,
});

function ordersApi(user, { order = adminOrder(), shiprocket = false } = {}) {
  const state = { order };
  return {
    state,
    handlers: base(user, {
      "GET /api/admin/orders": () => [200, { orders: [state.order], page: 1, pages: 1, total: 1, counts: { [state.order.status]: 1 } }],
      "GET /api/admin/orders/o1": () => [200, { order: state.order, shiprocket }],
      "POST /api/admin/orders/o1/status": (body) => {
        state.order = { ...state.order, status: body.status, ...(body.shipment ? { shipment: { ...state.order.shipment, ...body.shipment } } : {}), history: [...state.order.history, { status: body.status, at: "2026-10-04T11:00:00Z", source: user.role }] };
        return [200, { order: state.order }];
      },
      "POST /api/admin/orders/o1/refund": (body) => {
        state.order = { ...state.order, status: "refunded", refund: { status: "processed", amount: body.amount, reference: body.reference } };
        return [200, { order: state.order }];
      },
    }),
  };
}

describe("orders", () => {
  it("filters through the URL and moves an order through the allowed steps", async () => {
    const { handlers } = ordersApi(staff);
    const fake = installFakeApi(handlers);
    const user = userEvent.setup();
    const { router } = renderRoute("/admin/orders");
    await user.selectOptions(await screen.findByLabelText("Status"), "cod_confirmed");
    await waitFor(() => expect(router.state.location.search).toBe("?status=cod_confirmed"));
    expect(fake.calls.filter((c) => c.path === "/api/admin/orders").at(-1).query).toEqual({ page: "1", status: "cod_confirmed" });

    await user.click(await screen.findByRole("button", { name: "MM261004-7KQ2X" }));
    const panel = await screen.findByRole("dialog", { name: "Order MM261004-7KQ2X" });
    expect(within(panel).getByRole("link", { name: /Google Maps/ })).toHaveAttribute("href", expect.stringContaining("12%20MG%20Road"));
    // Staff can't cancel or refund.
    expect(within(panel).queryByRole("button", { name: "Cancel order" })).not.toBeInTheDocument();
    expect(within(panel).queryByRole("button", { name: "Refund" })).not.toBeInTheDocument();

    await user.click(await within(panel).findByRole("button", { name: "Start processing" }));
    await user.click(await within(panel).findByRole("button", { name: "Mark as packed" }));
    await user.click(await within(panel).findByRole("button", { name: "Mark as shipped" }));
    await user.type(within(panel).getByLabelText("Courier"), "Delhivery");
    await user.type(within(panel).getByLabelText("AWB number"), "AWB12345");
    await user.click(within(panel).getByRole("button", { name: "Confirm shipped" }));
    await within(panel).findByRole("button", { name: "Out for delivery" });
    const moves = fake.calls.filter((c) => c.path === "/api/admin/orders/o1/status").map((c) => c.body);
    expect(moves).toEqual([{ status: "processing" }, { status: "packed" }, { status: "shipped", shipment: { courier: "Delhivery", awb: "AWB12345" } }]);
  });

  it("opens an order straight from a notification deep link", async () => {
    installFakeApi(ordersApi(staff).handlers);
    renderRoute("/admin/orders?q=MM261004-7KQ2X");
    expect(await screen.findByRole("dialog", { name: "Order MM261004-7KQ2X" })).toBeInTheDocument();
  });

  it("lets admins record a COD refund with a payout reference", async () => {
    const { handlers } = ordersApi(admin, { order: adminOrder({ status: "delivered" }) });
    const fake = installFakeApi(handlers);
    const user = userEvent.setup();
    renderRoute("/admin/orders");
    await user.click(await screen.findByRole("button", { name: "MM261004-7KQ2X" }));
    const panel = await screen.findByRole("dialog", { name: "Order MM261004-7KQ2X" });
    await user.click(await within(panel).findByRole("button", { name: "Refund" }));
    const form = within(panel).getByRole("form", { name: "Refund" });
    await user.clear(within(form).getByLabelText("Amount (₹)"));
    await user.type(within(form).getByLabelText("Amount (₹)"), "499");
    await user.type(within(form).getByLabelText(/Bank \/ UPI reference/), "UPI-778899");
    await user.click(within(form).getByRole("button", { name: "Record refund" }));
    await waitFor(() => expect(fake.calls.find((c) => c.path === "/api/admin/orders/o1/refund")?.body).toEqual({ amount: 49900, reference: "UPI-778899" }));
  });
});

const product = (overrides = {}) => ({
  id: "p1",
  slug: "men-anti-hairfall-therapy",
  name: "Men Anti-Hairfall Therapy",
  status: "published",
  audience: "men",
  type: "therapy",
  images: [],
  variants: [{ sku: "MM-MEN-THERAPY", label: "Shampoo + Oil", price: 49900, stock: 4, isDefault: true }],
  ...overrides,
});

describe("inventory", () => {
  it("edits stock inline and exports every variant to Excel (no cost fields for staff)", async () => {
    let current = product();
    const fake = installFakeApi(
      base(staff, {
        "GET /api/admin/products": () => [200, { products: [current], total: 1, page: 1, pages: 1 }],
        "PATCH /api/admin/products/p1/stock": (body) => {
          current = product({ variants: [{ ...current.variants[0], stock: body.stock }] });
          return [200, { product: current }];
        },
      })
    );
    const user = userEvent.setup();
    renderRoute("/admin/products");
    const input = await screen.findByLabelText("Stock for MM-MEN-THERAPY");
    expect(screen.getByLabelText("Critical")).toBeInTheDocument();
    await user.clear(input);
    await user.type(input, "40");
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(screen.getByLabelText("Healthy")).toBeInTheDocument());
    expect(fake.calls.find((c) => c.method === "PATCH").body).toEqual({ sku: "MM-MEN-THERAPY", stock: 40 });

    await user.click(screen.getByRole("button", { name: /Export to Excel/ }));
    await waitFor(() => expect(toFile).toHaveBeenCalledWith(expect.stringMatching(/^manushyam-inventory-\d{4}-\d{2}-\d{2}\.xlsx$/)));
    const [rows, { columns }] = writeExcelFile.mock.calls[0];
    expect(rows).toHaveLength(1);
    expect(columns.map((c) => c.header.value)).not.toContain("Cost (₹)");
    expect(columns.find((c) => c.header.value === "Price (₹)").cell(rows[0]).value).toBe(499);
  });

  it("creates a product with variants (slug from the name) and shows server validation errors", async () => {
    let attempts = 0;
    const fake = installFakeApi(
      base(staff, {
        "POST /api/admin/products": () => {
          attempts += 1;
          return attempts === 1 ? [409, { error: { code: "CONFLICT", message: "That slug is taken", details: [{ path: "slug", message: "Already in use" }] } }] : [201, { product: product({ id: "p9", name: "Neem Scalp Oil", slug: "neem-scalp-oil-2" }) }];
        },
        "GET /api/admin/products/p9": () => [200, { product: product({ id: "p9", name: "Neem Scalp Oil", slug: "neem-scalp-oil-2" }) }],
      })
    );
    const user = userEvent.setup();
    const { router } = renderRoute("/admin/products/new");
    const form = await screen.findByRole("form", { name: "Product details" });
    expect(within(form).queryByRole("region", { name: /Internal/ })).not.toBeInTheDocument();
    await user.type(within(form).getByLabelText(/^Name/), "Neem Scalp Oil");
    expect(within(form).getByLabelText(/URL slug/)).toHaveValue("neem-scalp-oil");
    await user.type(within(form).getByLabelText(/^SKU/), "mm-neem-oil");
    await user.type(within(form).getByLabelText(/^Label/), "Hair oil 100 ml");
    await user.type(within(form).getByLabelText(/^Price ₹/), "349");
    await user.clear(within(form).getByLabelText(/^Stock/));
    await user.type(within(form).getByLabelText(/^Stock/), "60");
    await user.type(within(form).getByLabelText("Benefits"), "Soothes the scalp{Enter}Reduces flaking");
    await user.click(within(form).getByLabelText("Hair fall"));
    await user.click(within(form).getByRole("button", { name: "Create product" }));
    expect(await within(form).findByRole("alert")).toHaveTextContent("slug: Already in use");

    const body = fake.calls.find((c) => c.path === "/api/admin/products" && c.method === "POST").body;
    expect(body).toMatchObject({
      name: "Neem Scalp Oil",
      slug: "neem-scalp-oil",
      status: "draft",
      variants: [{ sku: "MM-NEEM-OIL", label: "Hair oil 100 ml", price: 34900, stock: 60, isDefault: true }],
      benefits: ["Soothes the scalp", "Reduces flaking"],
      concerns: ["hair-fall"],
    });
    expect(body.internal).toBeUndefined();

    await user.clear(within(form).getByLabelText(/URL slug/));
    await user.type(within(form).getByLabelText(/URL slug/), "neem-scalp-oil-2");
    await user.click(within(form).getByRole("button", { name: "Create product" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/admin/products/p9"));
  });
});
