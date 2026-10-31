import { describe, it, expect, vi, afterEach } from "vitest";
import { screen, within, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderRoute } from "../../test/renderRoute";
import { installFakeApi } from "../../test/fakeApi";
import { catalogApi, cards } from "../../test/catalogFixtures";
import { formatPaise } from "../../lib/cn";
import { withQuery } from "../../lib/query";
import { CART_KEY } from "../../cart/context";

afterEach(() => vi.unstubAllGlobals());

const cartLink = () => screen.getByRole("link", { name: /^Cart, / });
const productCalls = (fake) => fake.calls.filter((c) => c.path === "/api/products");

describe("helpers", () => {
  it("formats paise as rupees", () => {
    expect(formatPaise(49900)).toBe("₹499");
    expect(formatPaise(129900)).toBe("₹1,299");
    expect(formatPaise(49950)).toBe("₹499.50");
  });

  it("builds query strings without empty values", () => {
    expect(withQuery("/api/products", { for: "men", type: ["therapy", "combo"], q: "", page: undefined, concern: [] })).toBe("/api/products?for=men&type=therapy%2Ccombo");
    expect(withQuery("/api/products")).toBe("/api/products");
  });
});

describe("home", () => {
  it("renders the hero, bestseller and product grid from the API", async () => {
    installFakeApi(catalogApi());
    renderRoute("/");
    // The placeholder hero h1 is swapped for the carousel once slides load.
    expect(await screen.findByRole("link", { name: /Shop Therapy/ })).toHaveAttribute("href", "/solutions");
    expect(screen.getByRole("heading", { level: 1, name: /Rooted in\s*Ritual\./ })).toBeInTheDocument();
    expect(await screen.findByRole("heading", { level: 2, name: "Men Anti-Hairfall Therapy" })).toBeInTheDocument();
    const grid = screen.getByRole("heading", { name: "Shop the Therapy" }).closest("section");
    expect(within(grid).getAllByRole("article")).toHaveLength(4);
    expect(within(grid).getByText("₹899")).toBeInTheDocument();
  });

  it("adds to the cart and updates the header count", async () => {
    installFakeApi(catalogApi());
    renderRoute("/");
    const grid = (await screen.findByRole("heading", { name: "Shop the Therapy" })).closest("section");
    const [first] = await within(grid).findAllByRole("button", { name: "Add to Cart" });
    expect(cartLink()).toHaveAccessibleName("Cart, 0 items");
    await userEvent.click(first);
    expect(cartLink()).toHaveAccessibleName("Cart, 1 item");
    expect(JSON.parse(localStorage.getItem(CART_KEY))).toEqual([{ sku: "MEN-ANTI-HAIRFALL-THERAPY", qty: 1 }]);
  });

  it("lets the shopper pause and pick hero slides", async () => {
    installFakeApi(catalogApi());
    renderRoute("/");
    await screen.findByRole("heading", { level: 1 });
    await userEvent.click(screen.getByRole("button", { name: "Pause slideshow" }));
    expect(screen.getByRole("button", { name: "Play slideshow" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Show slide 2 of 2" }));
    expect(screen.getByRole("heading", { level: 1, name: /Stronger Roots/ })).toBeInTheDocument();
  });

  it("offers a retry when products fail to load", async () => {
    installFakeApi(catalogApi({ "GET /api/products": () => [500, { error: { message: "Down" } }] }));
    renderRoute("/");
    expect(await screen.findByText(/couldn’t load the products/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
  });
});

describe("solutions listing", () => {
  it("shows all products with a count", async () => {
    installFakeApi(catalogApi());
    renderRoute("/solutions");
    expect(await screen.findByRole("heading", { level: 1, name: "Solutions" })).toBeInTheDocument();
    const results = screen.getByRole("region", { name: "Products" });
    expect(await within(results).findAllByRole("article")).toHaveLength(4);
    expect(within(results).getByText(/Showing/)).toHaveTextContent("Showing 4 therapies");
  });

  it("reads filters from the URL and sends them to the API (prices in paise)", async () => {
    const fake = installFakeApi(catalogApi());
    renderRoute("/solutions?for=women&type=combo&min=500&max=1000&inStock=1&sort=price_asc&concern=thinning,bogus");
    expect(await screen.findByRole("heading", { level: 1, name: "Solutions for Women" })).toBeInTheDocument();
    await waitFor(() => expect(productCalls(fake).length).toBeGreaterThan(0));
    expect(productCalls(fake).at(-1).query).toEqual({ for: "women", type: "combo", concern: "thinning", minPrice: "50000", maxPrice: "100000", inStock: "true", sort: "price_asc", limit: "12" });
    const filters = screen.getByRole("complementary", { name: "Filters" });
    expect(within(filters).getByLabelText("Thinning hair")).toBeChecked();
    expect(within(filters).getByLabelText("Min")).toHaveValue("500");
  });

  it("updates the URL from chips, checkboxes and sort, resetting to page 1", async () => {
    const fake = installFakeApi(catalogApi());
    const { router } = renderRoute("/solutions?page=2");
    const user = userEvent.setup();
    await screen.findAllByRole("article");

    await user.click(screen.getByRole("button", { name: "Women" }));
    expect(router.state.location.search).toBe("?for=women");
    expect(screen.getByRole("button", { name: "Women" })).toHaveAttribute("aria-pressed", "true");

    const filters = screen.getByRole("complementary", { name: "Filters" });
    await user.click(within(filters).getByLabelText("Weak roots"));
    expect(router.state.location.search).toBe("?for=women&concern=weak-roots");

    await user.selectOptions(screen.getByLabelText("Sort by"), "price_desc");
    expect(router.state.location.search).toBe("?for=women&concern=weak-roots&sort=price_desc");
    await waitFor(() => expect(productCalls(fake).at(-1).query).toMatchObject({ for: "women", concern: "weak-roots", sort: "price_desc" }));

    await user.click(within(filters).getByRole("button", { name: "Clear all" }));
    expect(router.state.location.search).toBe("?sort=price_desc");
  });

  it("applies the price range on Enter", async () => {
    installFakeApi(catalogApi());
    const { router } = renderRoute("/solutions");
    const user = userEvent.setup();
    const filters = await screen.findByRole("complementary", { name: "Filters" });
    await user.type(within(filters).getByLabelText("Max"), "700{Enter}");
    expect(router.state.location.search).toBe("?max=700");
  });

  it("shows an empty state that clears filters", async () => {
    installFakeApi(catalogApi({ "GET /api/products": () => [200, { products: [], total: 0, page: 1, pages: 1, match: "browse" }] }));
    const { router } = renderRoute("/solutions?concern=dandruff");
    expect(await screen.findByRole("heading", { name: "No therapies match these filters" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Clear all filters" }));
    expect(router.state.location.search).toBe("");
  });

  it("opens the filter drawer on small screens", async () => {
    installFakeApi(catalogApi());
    renderRoute("/solutions");
    await screen.findAllByRole("article");
    await userEvent.click(screen.getByRole("button", { name: /^Filters/ }));
    const dialog = screen.getByRole("dialog", { name: "Filters" });
    expect(within(dialog).getByLabelText("Weak roots")).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole("button", { name: "Show 4 results" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});

describe("product detail", () => {
  it("renders price, benefits, trust row, tabs and related products", async () => {
    installFakeApi(catalogApi());
    renderRoute("/solutions/men-anti-hairfall-therapy");
    expect(await screen.findByRole("heading", { level: 1, name: "Men Anti-Hairfall Therapy" })).toBeInTheDocument();
    const buy = screen.getByRole("region", { name: "Purchase" });
    expect(within(buy).getByText("₹499")).toBeInTheDocument();
    expect(within(buy).getByText("Strengthens hair roots")).toBeInTheDocument();
    expect(within(buy).getByText("GST Invoice Available")).toBeInTheDocument();
    expect(within(buy).getByText("Trusted by 10,000+ customers across India")).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "Breadcrumb" })).toHaveTextContent("Home›Solutions›Men Anti-Hairfall Therapy");
    expect(screen.getByRole("tabpanel")).toHaveTextContent("Paraben Free");
    const related = screen.getByRole("region", { name: "You may also like" });
    expect(within(related).getAllByRole("article")).toHaveLength(3);
  });

  it("supports arrow-key tab navigation", async () => {
    installFakeApi(catalogApi());
    renderRoute("/solutions/men-anti-hairfall-therapy");
    const description = await screen.findByRole("tab", { name: "Description" });
    description.focus();
    await userEvent.keyboard("{ArrowRight}");
    expect(screen.getByRole("tab", { name: "Benefits" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: "Benefits" })).toHaveFocus();
    await userEvent.keyboard("{End}");
    expect(screen.getByRole("tabpanel")).toHaveTextContent("When will I see results?");
  });

  it("adds the chosen quantity and Buy Now goes to checkout", async () => {
    installFakeApi(catalogApi());
    const { router } = renderRoute("/solutions/men-anti-hairfall-therapy");
    const buy = await screen.findByRole("region", { name: "Purchase" });
    const user = userEvent.setup();
    await user.click(within(buy).getAllByRole("button", { name: "Increase quantity" })[0]);
    await user.click(within(buy).getByRole("button", { name: "Add to Cart" }));
    expect(cartLink()).toHaveAccessibleName("Cart, 2 items");
    expect(within(buy).getByText("Added to cart ✓")).toBeInTheDocument();
    await user.click(within(buy).getByRole("button", { name: /Buy Now/ }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/checkout"));
    expect(cartLink()).toHaveAccessibleName("Cart, 4 items");
  });

  it("opens and closes the zoom view", async () => {
    installFakeApi(catalogApi());
    renderRoute("/solutions/men-anti-hairfall-therapy");
    await userEvent.click(await screen.findByRole("button", { name: "Zoom" }));
    const dialog = screen.getByRole("dialog");
    await userEvent.click(within(dialog).getByRole("button", { name: "Next image" }));
    expect(dialog).toHaveAccessibleName(/image 2 of 2/);
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("records recently viewed products", async () => {
    localStorage.setItem("mm_recently_viewed", JSON.stringify(["women-anti-hairfall-combo"]));
    installFakeApi(catalogApi());
    renderRoute("/solutions/men-anti-hairfall-therapy");
    const recent = await screen.findByRole("region", { name: "Recently viewed" });
    expect(within(recent).getByRole("heading", { name: "Women Anti-Hairfall Combo" })).toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem("mm_recently_viewed"))).toEqual(["men-anti-hairfall-therapy", "women-anti-hairfall-combo"]);
  });

  it("publishes Product structured data with prices in rupees", async () => {
    installFakeApi(catalogApi());
    renderRoute("/solutions/men-anti-hairfall-therapy");
    await screen.findByRole("heading", { level: 1 });
    // React 19 renders JSON-LD scripts in place (not hoisted to <head>); search engines read them anywhere.
    await waitFor(() => expect(document.querySelectorAll('script[type="application/ld+json"]').length).toBeGreaterThan(0));
    const data = [...document.querySelectorAll('script[type="application/ld+json"]')].map((s) => JSON.parse(s.textContent));
    const product = data.find((d) => d["@type"] === "Product");
    expect(product.offers[0]).toMatchObject({ price: "499.00", priceCurrency: "INR", availability: "https://schema.org/InStock" });
    expect(product.image[0]).toMatch(/^https:\/\/.+\/images\/products\//);
  });

  it("shows the 404 page for unknown products", async () => {
    installFakeApi(catalogApi());
    renderRoute("/solutions/no-such-thing");
    expect(await screen.findByRole("heading", { name: "This path has wandered off." })).toBeInTheDocument();
  });
});

describe("search", () => {
  it("suggests products as you type and opens one with the keyboard", async () => {
    installFakeApi(catalogApi());
    const { router } = renderRoute("/search");
    const box = await screen.findByRole("combobox", { name: "Search products" });
    const user = userEvent.setup();
    await user.type(box, "women");
    const list = await screen.findByRole("listbox", { name: "Suggestions" });
    expect(within(list).getAllByRole("option")).toHaveLength(2);
    await user.keyboard("{ArrowDown}{Enter}");
    await waitFor(() => expect(router.state.location.pathname).toBe("/solutions/women-anti-hairfall-therapy"));
  });

  it("shows results for ?q= and an empty state", async () => {
    installFakeApi(
      catalogApi({
        "GET /api/products": (_b, req) => (req.query.q === "combo" ? [200, { products: cards.slice(2), total: 2, page: 1, pages: 1, match: "fuzzy" }] : [200, { products: [], total: 0, page: 1, pages: 1, match: "fuzzy" }]),
      })
    );
    const { router } = renderRoute("/search?q=combo");
    expect(await screen.findByText("2 products — showing close matches")).toBeInTheDocument();
    expect(screen.getAllByRole("article")).toHaveLength(2);
    await router.navigate("/search?q=lipstick");
    expect(await screen.findByRole("heading", { name: "Nothing found for “lipstick”" })).toBeInTheDocument();
  });

  it("opens from the header search button", async () => {
    installFakeApi(catalogApi());
    renderRoute("/about");
    await screen.findByRole("heading", { level: 1 });
    await userEvent.click(screen.getByRole("button", { name: "Search" }));
    expect(screen.getAllByRole("combobox", { name: "Search products" })[0]).toHaveFocus();
  });
});

describe("FAQ", () => {
  it("groups questions by topic with the first one open", async () => {
    installFakeApi(catalogApi());
    renderRoute("/faq");
    const first = await screen.findByRole("button", { name: /When will I see results/ });
    expect(first).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText(/after the 3rd application/)).toBeVisible();
    expect(screen.queryByText("Is Cash on Delivery available?")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /Payments & COD/ }));
    expect(screen.getByRole("button", { name: /Is Cash on Delivery available/ })).toHaveAttribute("aria-expanded", "true");
  });

  it("searches across all topics", async () => {
    installFakeApi(catalogApi());
    renderRoute("/faq");
    await screen.findByRole("button", { name: /When will I see results/ });
    await userEvent.type(screen.getByLabelText("Search questions"), "refunds");
    expect(screen.getByText("1 answer for “refunds”")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /How long do refunds take/ })).toBeInTheDocument();
    await userEvent.clear(screen.getByLabelText("Search questions"));
    await userEvent.type(screen.getByLabelText("Search questions"), "xyzzy");
    expect(screen.getByText(/No questions match/)).toBeInTheDocument();
  });
});

describe("policies", () => {
  it("renders a policy from the CMS with the policy menu", async () => {
    installFakeApi(catalogApi());
    renderRoute("/policies/privacy");
    expect(await screen.findByRole("heading", { level: 1, name: "Privacy Policy" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: "Cookies" })).toBeInTheDocument();
    expect(screen.getByText("Analytics cookies are optional.")).toBeInTheDocument();
    expect(screen.getByText(/Last updated: 30 September 2026/)).toBeInTheDocument();
    const menu = screen.getByRole("navigation", { name: "Policies" });
    expect(await within(menu).findByRole("link", { name: "Privacy Policy" })).toHaveAttribute("aria-current", "page");
  });

  it("shows 404 for unknown policies", async () => {
    installFakeApi(catalogApi());
    renderRoute("/policies/unknown");
    expect(await screen.findByRole("heading", { name: "This path has wandered off." })).toBeInTheDocument();
  });
});

describe("static content pages", () => {
  it("renders How it Works & Ingredients with concern links", async () => {
    installFakeApi(catalogApi());
    renderRoute("/ingredients");
    expect(await screen.findByRole("heading", { level: 1, name: /How\s*ManushyaM™ Works/ })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "DHT BLOCKER" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Shop now — Dandruff & Itchy Scalp/ })).toHaveAttribute("href", "/solutions?concern=dandruff");
    expect(screen.getByText("Korean Ginseng Extract")).toBeInTheDocument();
  });
});

describe("guest cart storage", () => {
  it("ignores tampered or malformed saved carts and caps quantities", async () => {
    localStorage.setItem(CART_KEY, JSON.stringify([{ sku: "MEN-ANTI-HAIRFALL-THERAPY", qty: 99 }, { sku: 1, qty: 1 }, { sku: "<script>", qty: 1 }, { sku: "WOMEN-ANTI-HAIRFALL-COMBO", qty: -2 }, "junk"]));
    installFakeApi(catalogApi());
    renderRoute("/about");
    await screen.findByRole("heading", { level: 1 });
    expect(cartLink()).toHaveAccessibleName("Cart, 10 items");
  });
});
