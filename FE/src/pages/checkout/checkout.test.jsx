import { describe, it, expect, vi, afterEach } from "vitest";
import { screen, within, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderRoute } from "../../test/renderRoute";
import { installFakeApi, signedInAs, customer } from "../../test/fakeApi";
import { catalogApi, priceItems } from "../../test/catalogFixtures";

afterEach(() => {
  vi.unstubAllGlobals();
  delete window.Razorpay;
});

const MEN = "MEN-ANTI-HAIRFALL-THERAPY";
const N = "MM261004-7KQ2X";
const address = { id: "a1", label: "Home", fullName: "Ananya Sharma", phone: "9876543210", line1: "12 MG Road", city: "Bengaluru", state: "Karnataka", pincode: "560001", isDefault: true };

const delivery = {
  pincode: "560001",
  serviceable: true,
  codAvailable: true,
  courier: null,
  methods: [{ id: "standard", label: "Standard delivery", fee: 0, etaMinDays: 3, etaMaxDays: 7 }],
  cod: { fee: 0, maxOrder: 500000 },
  belowMinOrder: false,
  message: null,
};

function order(overrides = {}) {
  return {
    id: "o1",
    orderNumber: N,
    status: "cod_confirmed",
    paymentMethod: "cod",
    items: [{ sku: MEN, slug: "men-anti-hairfall-therapy", name: "Men Anti-Hairfall Therapy", variantLabel: "Shampoo + Oil", image: null, price: 49900, mrp: null, qty: 2, lineTotal: 99800 }],
    address,
    delivery: { method: "standard", etaMinDays: 3, etaMaxDays: 7 },
    amounts: { subtotal: 99800, discount: 0, shipping: 0, codFee: 0, total: 99800 },
    coupon: null,
    history: [
      { status: "cod_pending_confirmation", at: "2026-10-04T10:00:00Z" },
      { status: "cod_confirmed", at: "2026-10-04T10:02:00Z" },
    ],
    shipment: null,
    refund: null,
    reservedUntil: null,
    razorpayOrderId: null,
    canCancel: true,
    hasInvoice: true,
    cancelReason: null,
    createdAt: "2026-10-04T10:00:00Z",
    deliveredAt: null,
    ...overrides,
  };
}

// Signed-in customer with two units in the cart and a default address.
function checkoutApi(overrides = {}) {
  const state = { items: [{ sku: MEN, qty: 2 }], order: null };
  const quote = (body) => {
    const cart = priceItems(state.items);
    const codFee = body.paymentMethod === "cod" ? 0 : 0;
    return { cart, delivery, selection: { deliveryMethod: "standard", shipping: 0, codFee, total: cart.total + codFee }, payment: { razorpay: { available: true }, cod: { available: true, fee: 0, reason: null } } };
  };
  return {
    state,
    handlers: catalogApi({
      ...signedInAs(customer),
      "GET /api/cart": () => [200, { cart: priceItems(state.items) }],
      "GET /api/wishlist": () => [200, { products: [] }],
      "GET /api/addresses": () => [200, { addresses: [address] }],
      "POST /api/checkout/quote": (body) => [200, quote(body)],
      [`GET /api/orders/${N}`]: () => [200, { order: state.order ?? order() }],
      ...overrides,
    }),
  };
}

async function walkToReview(user, payment = "Cash on Delivery") {
  await user.click(await screen.findByRole("button", { name: "Deliver here" }));
  await user.click(await screen.findByRole("button", { name: "Continue to payment" }));
  await user.click(await screen.findByRole("radio", { name: new RegExp(payment) }));
  await user.click(screen.getByRole("button", { name: "Review order" }));
}

describe("checkout", () => {
  it("sends guests to sign in first", async () => {
    installFakeApi(catalogApi());
    const { router } = renderRoute("/checkout");
    await waitFor(() => expect(router.state.location.pathname).toBe("/login"));
    expect(router.state.location.search).toBe("?next=%2Fcheckout");
  });

  it("walks Address → Delivery → Payment → Review and confirms a COD order with the emailed code", async () => {
    const { state, handlers } = checkoutApi();
    const fake = installFakeApi({
      ...handlers,
      "POST /api/orders": () => {
        state.order = order({ status: "cod_pending_confirmation", hasInvoice: false });
        return [201, { order: state.order, next: { type: "cod_otp", challengeId: "c1", sentTo: "an••••@example.com" }, replayed: false }];
      },
      [`POST /api/orders/${N}/cod/confirm`]: (body) => {
        if (body.code !== "123456") return [400, { error: { code: "BAD_REQUEST", message: "The code is incorrect or has expired." } }];
        state.items = [];
        state.order = order();
        return [200, { order: state.order }];
      },
    });
    const user = userEvent.setup();
    const { router } = renderRoute("/checkout");

    expect(await screen.findByRole("list", { name: "Checkout progress" })).toBeInTheDocument();
    expect(await screen.findByRole("radio", { name: /Ananya Sharma/ })).toBeChecked();
    await walkToReview(user);
    const summary = screen.getByRole("complementary", { name: "Order summary" });
    expect(within(summary).getAllByText("₹998").length).toBeGreaterThan(0);

    await user.click(screen.getByRole("button", { name: "Place order (Cash on Delivery)" }));
    const placed = fake.calls.find((c) => c.path === "/api/orders" && c.method === "POST");
    expect(placed.body).toEqual({ addressId: "a1", deliveryMethod: "standard", paymentMethod: "cod", expectedTotal: 99800 });
    expect(placed.headers["Idempotency-Key"]).toMatch(/^[A-Za-z0-9-]{16,64}$/);

    const dialog = await screen.findByRole("dialog", { name: "Confirm your order" });
    expect(within(dialog).getByText(/an••••@example.com/)).toBeInTheDocument();
    const boxes = within(dialog).getAllByRole("textbox");
    await user.click(boxes[0]);
    await user.paste("111111");
    await user.click(within(dialog).getByRole("button", { name: "Confirm order" }));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent("incorrect");

    await user.click(boxes[0]);
    for (const b of boxes) await user.clear(b);
    await user.click(boxes[0]);
    await user.paste("123456");
    await user.click(within(dialog).getByRole("button", { name: "Confirm order" }));
    await waitFor(() => expect(router.state.location.pathname).toBe(`/checkout/success/${N}`));
    expect(await screen.findByRole("heading", { name: "Thank you for your order" })).toBeInTheDocument();
  });

  it("pays with Razorpay, verifies the signature and lands on the success page", async () => {
    const { state, handlers } = checkoutApi();
    const fake = installFakeApi({
      ...handlers,
      "POST /api/orders": () => [
        201,
        { order: order({ status: "payment_pending", paymentMethod: "razorpay" }), next: { type: "razorpay", keyId: "rzp_test_1", razorpayOrderId: "order_ABC123", amount: 99800, currency: "INR", prefill: {} }, replayed: false },
      ],
      [`POST /api/orders/${N}/payment/verify`]: () => {
        state.order = order({ status: "paid", paymentMethod: "razorpay" });
        state.items = [];
        return [200, { order: state.order }];
      },
    });
    let options;
    window.Razorpay = vi.fn(function Razorpay(o) {
      options = o;
      this.on = vi.fn();
      this.open = () => o.handler({ razorpay_order_id: "order_ABC123", razorpay_payment_id: "pay_XYZ789", razorpay_signature: "f".repeat(64) });
    });
    const user = userEvent.setup();
    const { router } = renderRoute("/checkout");
    await walkToReview(user, "Pay online");
    await user.click(screen.getByRole("button", { name: "Pay ₹998 securely" }));

    await waitFor(() => expect(router.state.location.pathname).toBe(`/checkout/success/${N}`));
    expect(options).toMatchObject({ key: "rzp_test_1", order_id: "order_ABC123", amount: 99800, currency: "INR", name: "ManushyaM" });
    expect(fake.calls.find((c) => c.path.endsWith("/payment/verify")).body).toEqual({ razorpay_order_id: "order_ABC123", razorpay_payment_id: "pay_XYZ789", razorpay_signature: "f".repeat(64) });
    expect(await screen.findByRole("heading", { name: "Thank you for your order" })).toBeInTheDocument();
  });

  it("releases the order and shows the failure page when the payment window is closed", async () => {
    const { handlers } = checkoutApi();
    const fake = installFakeApi({
      ...handlers,
      "POST /api/orders": () => [201, { order: order({ status: "payment_pending", paymentMethod: "razorpay" }), next: { type: "razorpay", keyId: "k", razorpayOrderId: "order_ABC123", amount: 99800, currency: "INR", prefill: {} } }],
      [`POST /api/orders/${N}/payment/abandon`]: () => [200, { order: order({ status: "cancelled" }) }],
    });
    window.Razorpay = vi.fn(function Razorpay(o) {
      this.on = (event, cb) => event === "payment.failed" && (this.fail = cb);
      this.open = () => {
        this.fail({ error: { description: "Your bank declined the payment." } });
        o.modal.ondismiss();
      };
    });
    const user = userEvent.setup();
    const { router } = renderRoute("/checkout");
    await walkToReview(user, "Pay online");
    await user.click(screen.getByRole("button", { name: /Pay ₹998/ }));
    await waitFor(() => expect(router.state.location.pathname).toBe(`/checkout/failed/${N}`));
    expect(fake.calls.some((c) => c.path === `/api/orders/${N}/payment/abandon`)).toBe(true);
    expect(await screen.findByText(/Your bank declined the payment\. No money was taken for order/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Try again" })).toHaveAttribute("href", "/checkout");
  });

  it("re-quotes and explains when the total changed, keeping a fresh key for the retry", async () => {
    const { handlers } = checkoutApi();
    let attempts = 0;
    const fake = installFakeApi({
      ...handlers,
      "POST /api/orders": () => {
        attempts += 1;
        return [409, { error: { code: "PRICE_CHANGED", message: "Your total changed to ₹1,098. Please review your order." } }];
      },
    });
    const user = userEvent.setup();
    renderRoute("/checkout");
    await walkToReview(user);
    const quotesBefore = fake.calls.filter((c) => c.path === "/api/checkout/quote").length;
    await user.click(screen.getByRole("button", { name: "Place order (Cash on Delivery)" }));
    expect(await screen.findByText("Your total changed to ₹1,098. Please review your order.")).toBeInTheDocument();
    await waitFor(() => expect(fake.calls.filter((c) => c.path === "/api/checkout/quote").length).toBeGreaterThan(quotesBefore));
    await user.click(screen.getByRole("button", { name: "Place order (Cash on Delivery)" }));
    const keys = fake.calls.filter((c) => c.path === "/api/orders").map((c) => c.headers["Idempotency-Key"]);
    expect(attempts).toBe(2);
    expect(keys[0]).not.toBe(keys[1]);
  });

  it("explains when an address can't be delivered to", async () => {
    const { handlers } = checkoutApi({
      "POST /api/checkout/quote": () => [
        200,
        { cart: priceItems([{ sku: MEN, qty: 1 }]), delivery: { ...delivery, serviceable: false, methods: [], message: "We don’t deliver to this PIN code yet." }, selection: { deliveryMethod: null, shipping: 0, codFee: 0, total: 49900 }, payment: { razorpay: { available: true }, cod: { available: false, fee: 0, reason: "We don’t deliver to this PIN code yet." } } },
      ],
    });
    installFakeApi(handlers);
    const user = userEvent.setup();
    renderRoute("/checkout");
    await user.click(await screen.findByRole("button", { name: "Deliver here" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("We don’t deliver to this PIN code yet.");
    expect(screen.getByRole("button", { name: "Choose another address" })).toBeInTheDocument();
  });
});

describe("my orders", () => {
  it("lists orders and opens one with its timeline, invoice and cancel", async () => {
    const { state, handlers } = checkoutApi({
      "GET /api/orders": () => [200, { orders: [order()], page: 1, pages: 1, total: 1 }],
      [`POST /api/orders/${N}/cancel`]: (body) => {
        state.order = order({ status: "cancelled", canCancel: false, cancelReason: body.reason, history: [...order().history, { status: "cancelled", at: "2026-10-04T11:00:00Z" }] });
        return [200, { order: state.order }];
      },
    });
    installFakeApi(handlers);
    const user = userEvent.setup();
    renderRoute("/account");
    const card = (await screen.findByText(N)).closest("li");
    expect(within(card).getByText("Confirmed")).toBeInTheDocument();
    await user.click(within(card).getByRole("link", { name: `View order ${N}` }));

    expect(await screen.findByRole("heading", { name: `Order ${N}` })).toBeInTheDocument();
    const timeline = screen.getByRole("list", { name: "Order progress" });
    expect(within(timeline).getByText("Order confirmed")).toBeInTheDocument();
    expect(within(timeline).getByRole("listitem", { current: "step" })).toHaveTextContent("Order confirmed");
    expect(screen.getByRole("button", { name: "Download GST invoice" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Cancel order" }));
    await user.selectOptions(screen.getByLabelText("Why are you cancelling?"), "Ordered twice");
    await user.click(screen.getByRole("button", { name: "Yes, cancel order" }));
    expect(await screen.findAllByText("Cancelled")).not.toHaveLength(0);
    expect(screen.getByText("Ordered twice")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Cancel order" })).not.toBeInTheDocument();
  });

  it("shows an empty state when there are no orders", async () => {
    installFakeApi(checkoutApi({ "GET /api/orders": () => [200, { orders: [], page: 1, pages: 1, total: 0 }] }).handlers);
    renderRoute("/account/orders");
    expect(await screen.findByText(/You haven’t placed any orders yet/)).toBeInTheDocument();
  });
});

describe("track order", () => {
  it("validates input and shows the tracking timeline with courier scans", async () => {
    const fake = installFakeApi(
      catalogApi({
        "POST /api/track-order": (body) =>
          body.email === "ananya@example.com"
            ? [
                200,
                {
                  order: {
                    orderNumber: N,
                    status: "shipped",
                    paymentMethod: "cod",
                    items: [{ name: "Men Anti-Hairfall Therapy", qty: 2, image: null }],
                    destination: { city: "Bengaluru", state: "Karnataka" },
                    delivery: { method: "standard", etaMinDays: 3, etaMaxDays: 7 },
                    total: 99800,
                    history: [{ status: "cod_confirmed", at: "2026-10-04T10:02:00Z" }, { status: "packed", at: "2026-10-04T15:00:00Z" }, { status: "shipped", at: "2026-10-05T09:00:00Z" }],
                    shipment: { awb: "SR123", courier: "Delhivery", trackingUrl: "https://shiprocket.co/tracking/SR123", events: [{ at: "2026-10-05T09:00:00Z", status: "PICKED UP", location: "Bengaluru", activity: "Shipment picked up" }] },
                    createdAt: "2026-10-04T10:00:00Z",
                  },
                },
              ]
            : [404, { error: { code: "NOT_FOUND", message: "We couldn’t find an order with those details." } }],
      })
    );
    const user = userEvent.setup();
    renderRoute("/track-order");
    const form = within(await screen.findByRole("form", { name: "Find your order" }));
    await user.click(form.getByRole("button", { name: "Track order" }));
    expect(screen.getByText("Enter your order number, e.g. MM261004-7KQ2X")).toBeInTheDocument();
    expect(fake.calls.some((c) => c.path === "/api/track-order")).toBe(false);

    await user.type(form.getByLabelText("Order number"), N.toLowerCase());
    await user.type(form.getByLabelText("Email address"), "someone@example.com");
    await user.click(form.getByRole("button", { name: "Track order" }));
    expect(await form.findByRole("alert")).toHaveTextContent("We couldn’t find an order");

    await user.clear(form.getByLabelText("Email address"));
    await user.type(form.getByLabelText("Email address"), "ananya@example.com");
    await user.click(form.getByRole("button", { name: "Track order" }));
    const result = await screen.findByRole("region", { name: `Order ${N}` });
    expect(within(result).getByRole("listitem", { current: "step" })).toHaveTextContent("Shipped");
    expect(within(result).getByText("Shipment picked up")).toBeInTheDocument();
    expect(within(result).getByRole("link", { name: /Track with courier/ })).toHaveAttribute("href", "https://shiprocket.co/tracking/SR123");
    expect(fake.calls.find((c) => c.path === "/api/track-order").body.orderNumber).toBe(N);
  });
});

describe("product page delivery check", () => {
  it("shows the delivery estimate and COD availability for a PIN", async () => {
    installFakeApi(catalogApi({ "GET /api/delivery/check": (_b, req) => [200, { delivery: { ...delivery, pincode: req.query.pincode, codAvailable: false } }] }));
    const user = userEvent.setup();
    renderRoute("/solutions/men-anti-hairfall-therapy");
    const pin = await screen.findByLabelText("Delivery PIN code");
    await user.type(pin, "56");
    await user.click(screen.getByRole("button", { name: "Check" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Enter a valid 6-digit PIN code");
    await user.type(pin, "0001");
    await user.click(screen.getByRole("button", { name: "Check" }));
    const status = await screen.findByText(/Delivery by/);
    expect(status.closest("[role=status]")).toHaveTextContent("Free · Prepaid only");
    expect(localStorage.getItem("mm_pin")).toBe("560001");
  });
});
