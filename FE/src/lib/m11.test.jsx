import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { HelmetProvider } from "react-helmet-async";
import { renderRoute } from "../test/renderRoute";
import { installFakeApi } from "../test/fakeApi";
import { catalogApi } from "../test/catalogFixtures";
import { Seo } from "../components/Seo";
import { ErrorBoundary } from "../components/ErrorBoundary";
import { imageUrl, responsiveImage } from "./images";
import { isCrawler } from "./crawler";
import { reportError, resetErrorReportsForTests } from "./reportError";
import { fetchQuery } from "./query";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  resetErrorReportsForTests();
  delete window.prerenderReady;
});

const CLD = "https://res.cloudinary.com/manushyam/image/upload/v1700000000/products/oil.jpg";

describe("responsive images", () => {
  it("adds automatic format, quality and widths to Cloudinary uploads", () => {
    expect(imageUrl(CLD, 640)).toBe("https://res.cloudinary.com/manushyam/image/upload/f_auto,q_auto,w_640,c_limit/v1700000000/products/oil.jpg");
    expect(imageUrl(CLD)).toBe("https://res.cloudinary.com/manushyam/image/upload/f_auto,q_auto/v1700000000/products/oil.jpg");
    const props = responsiveImage(CLD, "card", "50vw");
    expect(props.srcSet.split(", ")).toHaveLength(4);
    expect(props.srcSet).toContain("w_320,c_limit/v1700000000/products/oil.jpg 320w");
    expect(props).toMatchObject({ sizes: "50vw", decoding: "async" });
    expect(props.src).toContain("w_800");
  });

  it("leaves bundled and other images untouched", () => {
    expect(responsiveImage("/images/content/hero-man.jpg", "hero")).toEqual({ src: "/images/content/hero-man.jpg", decoding: "async" });
    expect(imageUrl("https://example.com/a.jpg", 400)).toBe("https://example.com/a.jpg");
    expect(responsiveImage(undefined)).toEqual({ src: undefined, decoding: "async" });
  });
});

describe("Seo", () => {
  const head = (sel) => document.head.querySelector(sel);
  function renderSeo(props) {
    return render(
      <HelmetProvider>
        <Seo {...props} />
      </HelmetProvider>
    );
  }

  it("writes canonical, Open Graph and Twitter tags with a default share image", async () => {
    renderSeo({ title: "About ManushyaM", description: "Our story", path: "/about" });
    await waitFor(() => expect(document.title).toBe("About ManushyaM | ManushyaM"));
    expect(head('link[rel="canonical"]').href).toBe("https://manushyam.com/about");
    expect(head('meta[property="og:type"]').content).toBe("website");
    expect(head('meta[property="og:locale"]').content).toBe("en_IN");
    expect(head('meta[property="og:image"]').content).toBe("https://manushyam.com/images/content/hero-man.jpg");
    expect(head('meta[name="twitter:card"]').content).toBe("summary_large_image");
    expect(head('meta[name="robots"]')).toBeNull();
  });

  it("noindex pages get no canonical", async () => {
    renderSeo({ title: "Your Cart", path: "/cart", noindex: true });
    await waitFor(() => expect(head('meta[name="robots"]')?.content).toBe("noindex,nofollow"));
    expect(head('link[rel="canonical"]')).toBeNull();
  });

  it("the home page describes the organisation and the site search", async () => {
    installFakeApi(catalogApi());
    renderRoute("/");
    await waitFor(() => expect(document.querySelectorAll('script[type="application/ld+json"]').length).toBeGreaterThan(1));
    const data = [...document.querySelectorAll('script[type="application/ld+json"]')].map((s) => JSON.parse(s.textContent));
    expect(data.find((d) => d["@type"] === "Organization")).toMatchObject({ name: "ManushyaM", contactPoint: [expect.objectContaining({ email: "care@manushyam.com" })] });
    expect(data.find((d) => d["@type"] === "WebSite").potentialAction.target.urlTemplate).toBe("https://manushyam.com/search?q={search_term_string}");
  });
});

describe("crawlers", () => {
  it("are recognised by user agent", () => {
    expect(isCrawler("Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)")).toBe(true);
    expect(isCrawler("Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 HeadlessChrome/129.0 Safari/537.36")).toBe(true);
    expect(isCrawler("Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/605.1.15 Version/17.5 Safari/605.1.15")).toBe(false);
  });

  it("shoppers see the intro on their first visit (control)", async () => {
    installFakeApi(catalogApi());
    renderRoute("/about", { introSeen: false });
    expect(await screen.findByLabelText("Loading ManushyaM")).toBeInTheDocument();
  });

  it("see the page without the intro animation or cookie banner", async () => {
    vi.spyOn(navigator, "userAgent", "get").mockReturnValue("Mozilla/5.0 (compatible; Googlebot/2.1)");
    installFakeApi(catalogApi());
    renderRoute("/about", { introSeen: false });
    expect(await screen.findByRole("heading", { level: 1 })).toBeInTheDocument();
    expect(screen.queryByLabelText("Loading ManushyaM")).not.toBeInTheDocument();
    expect(document.body.style.overflow).toBe("");
    await new Promise((r) => setTimeout(r, 1000));
    expect(screen.queryByRole("region", { name: "Your privacy, your choice" })).not.toBeInTheDocument();
  });
});

describe("prerender readiness", () => {
  it("turns true once page data has finished loading", async () => {
    let release;
    installFakeApi({ "GET /api/slow": () => new Promise((r) => (release = () => r([200, { ok: true }]))) });
    window.prerenderReady = false;
    const pending = fetchQuery("/api/slow");
    await new Promise((r) => setTimeout(r, 600));
    expect(window.prerenderReady).toBe(false);
    release();
    await pending;
    await waitFor(() => expect(window.prerenderReady).toBe(true), { timeout: 1500 });
  });
});

describe("client error reporting", () => {
  it("sends one report per message with the path only", async () => {
    const fake = installFakeApi({ "POST /api/client-errors": () => [204, null] });
    window.history.pushState({}, "", "/cart?email=a@b.com");
    reportError(new Error("x is undefined"), { kind: "render", componentStack: "at Cart" });
    reportError(new Error("x is undefined"));
    const calls = fake.calls.filter((c) => c.path === "/api/client-errors");
    expect(calls).toHaveLength(1);
    expect(calls[0].body).toMatchObject({ kind: "render", message: "x is undefined", componentStack: "at Cart", url: "http://localhost:3000/cart" });
    expect(calls[0].body.url).not.toContain("email");
    window.history.pushState({}, "", "/");
  });

  it("reports crashes caught by the app boundary", async () => {
    const fake = installFakeApi({ "POST /api/client-errors": () => [204, null] });
    vi.spyOn(console, "error").mockImplementation(() => {});
    function Boom() {
      throw new Error("render exploded");
    }
    render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>
    );
    expect(screen.getByText("Something went wrong")).toBeInTheDocument();
    await waitFor(() => expect(fake.calls.some((c) => c.path === "/api/client-errors" && c.body.message === "render exploded" && c.body.kind === "render")).toBe(true));
  });
});
