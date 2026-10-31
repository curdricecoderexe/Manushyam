import { describe, it, expect, vi, afterEach } from "vitest";
import { screen, within, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderRoute } from "../../test/renderRoute";
import { installFakeApi, signedInAs, customer } from "../../test/fakeApi";
import { catalogApi, cards, priceItems } from "../../test/catalogFixtures";
import { CART_COUPON_KEY, CART_KEY } from "../../cart/context";

afterEach(() => vi.unstubAllGlobals());

const MEN = "MEN-ANTI-HAIRFALL-THERAPY";
const COMBO = "MEN-ANTI-HAIRFALL-COMBO";
const cartLink = () => screen.getByRole("link", { name: /^Cart, / });
const saveGuestCart = (items, coupon) => {
  localStorage.setItem(CART_KEY, JSON.stringify(items));
  if (coupon) localStorage.setItem(CART_COUPON_KEY, coupon);
};

// A stateful fake of the signed-in cart + wishlist endpoints.
function accountApi({ items = [], wishlist = [], stock } = {}) {
  const state = { items: [...items], coupon: null, wishlist: [...wishlist] };
  const priced = () => ({ cart: priceItems(state.items, { couponCode: state.coupon, stock }) });
  const wish = () => ({ products: state.wishlist.map((slug) => cards.find((c) => c.slug === slug)) });
  return {
    state,
    handlers: {
      ...signedInAs(customer),
      "GET /api/cart": () => [200, priced()],
      "POST /api/cart/merge": (body) => {
        for (const i of body.items) {
          const line = state.items.find((x) => x.sku === i.sku);
          if (line) line.qty = Math.min(10, line.qty + i.qty);
          else state.items.push({ ...i });
        }
        return [200, priced()];
      },
      "PUT /api/cart/items": (body) => {
        state.items = state.items.filter((i) => i.sku !== body.sku);
        if (body.qty > 0) state.items.push({ sku: body.sku, qty: body.qty });
        return [200, priced()];
      },
      "POST /api/cart/coupon": (body) => {
        if (body.code !== "RITUAL10") return [400, { error: { code: "COUPON_INVALID", message: "This code isn’t valid." } }];
        state.coupon = body.code;
        return [200, priced()];
      },
      "GET /api/wishlist": () => [200, wish()],
      "POST /api/wishlist": (body) => {
        state.wishlist.unshift(body.slug);
        return [201, wish()];
      },
    },
  };
}

describe("guest cart", () => {
  it("opens the mini cart with server-priced lines after Add to Cart", async () => {
    installFakeApi(catalogApi());
    renderRoute("/solutions/men-anti-hairfall-therapy");
    const buy = await screen.findByRole("region", { name: "Purchase" });
    await userEvent.click(within(buy).getByRole("button", { name: "Add to Cart" }));
    const drawer = await screen.findByRole("dialog", { name: "Your Cart (1)" });
    expect(await within(drawer).findByRole("link", { name: "Men Anti-Hairfall Therapy" })).toBeInTheDocument();
    expect(within(drawer).getByText("Added to cart · Free shipping unlocked")).toBeInTheDocument();
    expect(within(drawer).getAllByText("₹499")).toHaveLength(2); // line + subtotal
    expect(within(drawer).getByRole("link", { name: "View cart" })).toHaveAttribute("href", "/cart");
    expect(cartLink()).toHaveAccessibleName("Cart, 1 item");
  });

  it("shows the cart page with totals and updates quantities through the server", async () => {
    saveGuestCart([{ sku: MEN, qty: 2 }, { sku: COMBO, qty: 1 }]);
    const fake = installFakeApi(catalogApi());
    renderRoute("/cart");
    const items = await screen.findByRole("region", { name: "Cart items" });
    expect(await within(items).findByRole("link", { name: "Men Anti-Hairfall Therapy" })).toBeInTheDocument();
    const summary = screen.getByRole("complementary", { name: "Order summary" });
    expect(within(summary).getAllByText("₹1,797")).toHaveLength(2); // subtotal + total

    await userEvent.click(within(items).getByRole("button", { name: "Remove Men Anti-Hairfall Combo" }));
    await waitFor(() => expect(within(summary).getAllByText("₹998")).toHaveLength(2));
    const validates = fake.calls.filter((c) => c.path === "/api/cart/validate");
    expect(validates.at(-1).body).toEqual({ items: [{ sku: MEN, qty: 2 }] });
    expect(validates.every((c) => !JSON.stringify(c.body).includes("price"))).toBe(true);

    await userEvent.click(within(items).getByRole("button", { name: "Decrease quantity" }));
    await waitFor(() => expect(within(summary).getAllByText("₹499").length).toBeGreaterThan(0));
    expect(JSON.parse(localStorage.getItem(CART_KEY))).toEqual([{ sku: MEN, qty: 1 }]);
  });

  it("applies a valid coupon, remembers it, and explains an invalid one", async () => {
    saveGuestCart([{ sku: COMBO, qty: 1 }]);
    installFakeApi(catalogApi());
    renderRoute("/cart");
    const user = userEvent.setup();
    const box = await screen.findByLabelText("Coupon code");
    await user.type(box, "nope1");
    await user.click(screen.getByRole("button", { name: "Apply" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("This code isn’t valid.");

    await user.clear(box);
    await user.type(box, "ritual10");
    await user.click(screen.getByRole("button", { name: "Apply" }));
    expect(await screen.findByText("RITUAL10 applied — 10% off")).toBeInTheDocument();
    const summary = screen.getByRole("complementary", { name: "Order summary" });
    expect(within(summary).getByText("− ₹79.90")).toBeInTheDocument();
    expect(within(summary).getByText("₹719.10")).toBeInTheDocument();
    expect(localStorage.getItem(CART_COUPON_KEY)).toBe("RITUAL10");

    await user.click(screen.getByRole("button", { name: "Remove" }));
    await waitFor(() => expect(localStorage.getItem(CART_COUPON_KEY)).toBeNull());
  });

  it("shows stock notices and blocks checkout while something is out of stock", async () => {
    saveGuestCart([{ sku: MEN, qty: 5 }, { sku: COMBO, qty: 1 }]);
    installFakeApi(catalogApi({ "POST /api/cart/validate": (body) => [200, { cart: priceItems(body.items, { stock: { [MEN]: 3, [COMBO]: 0 } }) }] }));
    renderRoute("/cart");
    expect(await screen.findByText("Only 3 left of Men Anti-Hairfall Therapy — quantity adjusted.")).toBeInTheDocument();
    expect(screen.getByText("Out of stock — remove it or save it for later")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Secure Checkout/ })).toHaveAttribute("aria-disabled", "true");
    expect(screen.getByText("Remove out-of-stock items to continue.")).toBeInTheDocument();
    await waitFor(() => expect(JSON.parse(localStorage.getItem(CART_KEY))).toEqual([{ sku: MEN, qty: 3 }, { sku: COMBO, qty: 1 }]));
  });

  it("offers sign-in to save items for later", async () => {
    saveGuestCart([{ sku: MEN, qty: 1 }]);
    installFakeApi(catalogApi());
    renderRoute("/cart");
    expect(await screen.findByRole("link", { name: "Sign in to save for later" })).toHaveAttribute("href", "/login?next=%2Fcart");
  });

  it("shows the empty state and upsell-free page with no items", async () => {
    const fake = installFakeApi(catalogApi());
    renderRoute("/cart");
    expect(await screen.findByRole("heading", { name: "Your cart is empty" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Shop therapy/ })).toHaveAttribute("href", "/solutions");
    expect(fake.calls.some((c) => c.path === "/api/cart/validate")).toBe(false);
  });

  it("adds an upsell product without leaving the page", async () => {
    saveGuestCart([{ sku: MEN, qty: 1 }]);
    installFakeApi(catalogApi());
    renderRoute("/cart");
    const upsell = await screen.findByRole("region", { name: "Complete the ritual" });
    await userEvent.click(within(upsell).getByRole("button", { name: "Add Women Anti-Hairfall Therapy" }));
    await waitFor(() => expect(cartLink()).toHaveAccessibleName("Cart, 2 items"));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});

describe("signed-in cart", () => {
  it("merges the guest cart into the account once and clears the local copy", async () => {
    saveGuestCart([{ sku: MEN, qty: 2 }]);
    const account = accountApi({ items: [{ sku: MEN, qty: 1 }, { sku: COMBO, qty: 1 }] });
    const fake = installFakeApi({ ...catalogApi(), ...account.handlers });
    renderRoute("/cart");
    const items = await screen.findByRole("region", { name: "Cart items" });
    expect(await within(items).findByRole("link", { name: "Men Anti-Hairfall Combo" })).toBeInTheDocument();
    expect(fake.calls.filter((c) => c.path === "/api/cart/merge")).toHaveLength(1);
    expect(fake.calls.find((c) => c.path === "/api/cart/merge").body).toEqual({ items: [{ sku: MEN, qty: 2 }] });
    expect(cartLink()).toHaveAccessibleName("Cart, 4 items");
    expect(JSON.parse(localStorage.getItem(CART_KEY))).toEqual([]);
  });

  it("changes quantities and coupons on the server cart", async () => {
    const account = accountApi({ items: [{ sku: COMBO, qty: 1 }] });
    const fake = installFakeApi({ ...catalogApi(), ...account.handlers });
    renderRoute("/cart");
    const user = userEvent.setup();
    const items = await screen.findByRole("region", { name: "Cart items" });
    await within(items).findByRole("link", { name: "Men Anti-Hairfall Combo" });
    await user.click(within(items).getByRole("button", { name: "Increase quantity" }));
    await waitFor(() => expect(cartLink()).toHaveAccessibleName("Cart, 2 items"));
    expect(fake.calls.find((c) => c.method === "PUT").body).toEqual({ sku: COMBO, qty: 2 });

    await user.type(screen.getByLabelText("Coupon code"), "WRONG1");
    await user.click(screen.getByRole("button", { name: "Apply" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("This code isn’t valid.");
    await user.clear(screen.getByLabelText("Coupon code"));
    await user.type(screen.getByLabelText("Coupon code"), "RITUAL10");
    await user.click(screen.getByRole("button", { name: "Apply" }));
    expect(await screen.findByText("RITUAL10 applied — 10% off")).toBeInTheDocument();
  });

  it("moves a cart line to the wishlist", async () => {
    const account = accountApi({ items: [{ sku: COMBO, qty: 1 }] });
    installFakeApi({ ...catalogApi(), ...account.handlers });
    renderRoute("/cart");
    const items = await screen.findByRole("region", { name: "Cart items" });
    await userEvent.click(await within(items).findByRole("button", { name: "Move to wishlist" }));
    expect(await screen.findByText("Moved Men Anti-Hairfall Combo to your wishlist.")).toBeInTheDocument();
    expect(account.state).toMatchObject({ items: [], wishlist: ["men-anti-hairfall-combo"] });
    expect(await screen.findByRole("heading", { name: "Your cart is empty" })).toBeInTheDocument();
  });
});

describe("wishlist", () => {
  it("sends guests to sign in from the heart button", async () => {
    installFakeApi(catalogApi());
    const { router } = renderRoute("/solutions");
    await userEvent.click(await screen.findByRole("button", { name: "Add Men Anti-Hairfall Therapy to wishlist" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/login"));
    expect(router.state.location.search).toBe("?next=%2Fsolutions");
  });

  it("protects the wishlist page", async () => {
    installFakeApi(catalogApi());
    const { router } = renderRoute("/wishlist");
    await waitFor(() => expect(router.state.location.pathname).toBe("/login"));
  });

  it("saves from a product card and lists it on the wishlist page", async () => {
    const account = accountApi();
    installFakeApi({ ...catalogApi(), ...account.handlers });
    const { router } = renderRoute("/solutions");
    const heart = await screen.findByRole("button", { name: "Add Women Anti-Hairfall Combo to wishlist" });
    await userEvent.click(heart);
    expect(await screen.findByText("Saved to your wishlist.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Remove Women Anti-Hairfall Combo from wishlist" })).toHaveAttribute("aria-pressed", "true");

    await router.navigate("/wishlist");
    expect(await screen.findByRole("heading", { level: 2, name: "Women Anti-Hairfall Combo" })).toBeInTheDocument();
    expect(screen.getByText("1 saved therapy · synced to your account")).toBeInTheDocument();
  });

  it("moves a saved product to the cart", async () => {
    const account = accountApi({ wishlist: ["women-anti-hairfall-therapy"] });
    const fake = installFakeApi({ ...catalogApi(), ...account.handlers, "DELETE /api/wishlist/women-anti-hairfall-therapy": () => [200, { products: [] }] });
    renderRoute("/wishlist");
    await userEvent.click(await screen.findByRole("button", { name: "Move to cart" }));
    expect(await screen.findByText("Moved Women Anti-Hairfall Therapy to your cart.")).toBeInTheDocument();
    expect(fake.calls.find((c) => c.method === "PUT" && c.path === "/api/cart/items").body).toEqual({ sku: "WOMEN-ANTI-HAIRFALL-THERAPY", qty: 1 });
    expect(await screen.findByRole("heading", { name: "Nothing saved yet" })).toBeInTheDocument();
  });
});
