import { describe, it, expect, vi, afterEach } from "vitest";
import { screen, within, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderRoute } from "../../test/renderRoute";
import { installFakeApi, signedInAs, customer, admin } from "../../test/fakeApi";
import { catalogApi } from "../../test/catalogFixtures";
import { POLICY_VERSION, saveConsent, getConsent, resetConsentForTests } from "../../lib/consent";
import { flush, initAnalytics, pendingEvents, track, trackPageview } from "../../lib/analytics";

afterEach(() => vi.unstubAllGlobals());

const consentCalls = (fake) => fake.calls.filter((c) => c.path === "/api/analytics/consent");
const collectCalls = (fake) => fake.calls.filter((c) => c.path === "/api/analytics/collect");
const banner = () => screen.findByRole("region", { name: "Your privacy, your choice" }, { timeout: 2000 });
const analyticsApi = (extra = {}) => catalogApi({ "POST /api/analytics/consent": () => [204, null], "POST /api/analytics/collect": () => [204, null], ...extra });

describe("analytics library", () => {
  it("holds events in memory until consent, sends nothing and stores no ids", () => {
    const fake = installFakeApi(analyticsApi());
    const stop = initAnalytics();
    trackPageview("/solutions", "Solutions");
    track("add_to_cart", { sku: "MM-MEN-THERAPY" });
    flush();
    expect(pendingEvents().map((e) => e.t)).toEqual(["pageview", "event"]);
    expect(collectCalls(fake)).toHaveLength(0);
    expect(localStorage.getItem("mm_vid")).toBeNull();
    expect(sessionStorage.getItem("mm_sid")).toBeNull();
    stop();
  });

  it("drops held events when the visitor chooses essential only", () => {
    const fake = installFakeApi(analyticsApi());
    const stop = initAnalytics();
    trackPageview("/about");
    saveConsent({ action: "essential_only", analytics: false });
    expect(pendingEvents()).toEqual([]);
    track("click", { label: "x" });
    flush();
    expect(pendingEvents()).toEqual([]);
    expect(collectCalls(fake)).toHaveLength(0);
    expect(consentCalls(fake)[0].body).toMatchObject({ action: "essential_only", analytics: false, policyVersion: POLICY_VERSION });
    stop();
  });

  it("sends held events once analytics is allowed, de-duplicating repeat page views", () => {
    const fake = installFakeApi(analyticsApi());
    const stop = initAnalytics();
    trackPageview("/about", "About");
    trackPageview("/about", "About");
    saveConsent({ action: "accept_all", analytics: true });
    flush();
    const [call] = collectCalls(fake);
    expect(call.headers["Content-Type"]).toBe("text/plain");
    expect(call.body.events).toEqual([expect.objectContaining({ t: "pageview", path: "/about", title: "About" })]);
    expect(call.body.vid).toBe(localStorage.getItem("mm_vid"));
    expect(call.body.sid).toBe(JSON.parse(sessionStorage.getItem("mm_sid")).id);
    stop();
  });

  it("forgets a saved choice when the policy version changes", () => {
    localStorage.setItem("mm_consent", JSON.stringify({ v: "2020-01", analytics: true, action: "accept_all", at: Date.now() }));
    resetConsentForTests();
    expect(getConsent()).toBeNull();
  });
});

describe("cookie banner", () => {
  it("appears after first paint and records an essential-only choice", async () => {
    const fake = installFakeApi(analyticsApi());
    renderRoute("/about");
    const region = await banner();
    await userEvent.setup().click(within(region).getByRole("button", { name: "Essential only" }));
    expect(screen.queryByRole("region", { name: "Your privacy, your choice" })).not.toBeInTheDocument();
    await waitFor(() => expect(consentCalls(fake)).toHaveLength(1));
    expect(consentCalls(fake)[0].body).toMatchObject({ action: "essential_only", analytics: false });
    expect(JSON.parse(localStorage.getItem("mm_consent"))).toMatchObject({ analytics: false, v: POLICY_VERSION });
    expect(localStorage.getItem("mm_vid")).toBeNull();
  });

  it("accepting all sends the page view that was held", async () => {
    const fake = installFakeApi(analyticsApi());
    renderRoute("/about");
    const region = await banner();
    await userEvent.setup().click(within(region).getByRole("button", { name: "Accept all" }));
    await waitFor(() => expect(collectCalls(fake).length).toBeGreaterThan(0), { timeout: 3500 });
    expect(collectCalls(fake)[0].body.events[0]).toMatchObject({ t: "pageview", path: "/about" });
    expect(consentCalls(fake)[0].body).toMatchObject({ action: "accept_all", analytics: true });
  });

  it("can be customised, and reopened from the footer to withdraw consent", async () => {
    const fake = installFakeApi(analyticsApi());
    renderRoute("/about");
    const user = userEvent.setup();
    await user.click(within(await banner()).getByRole("button", { name: "Customize" }));
    const settings = screen.getByRole("region", { name: "Cookie settings" });
    expect(within(settings).getByRole("switch", { name: "Essential cookies (always on)" })).toBeDisabled();
    const analyticsSwitch = within(settings).getByRole("switch", { name: "Analytics cookies" });
    expect(analyticsSwitch).toHaveAttribute("aria-checked", "false");
    await user.click(analyticsSwitch);
    await user.click(within(settings).getByRole("button", { name: "Save choices" }));
    expect(consentCalls(fake)[0].body).toMatchObject({ action: "custom", analytics: true });
    expect(localStorage.getItem("mm_vid")).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Cookie settings" }));
    const reopened = screen.getByRole("region", { name: "Cookie settings" });
    expect(within(reopened).getByRole("switch", { name: "Analytics cookies" })).toHaveAttribute("aria-checked", "true");
    await user.click(within(reopened).getByRole("switch", { name: "Analytics cookies" }));
    await user.click(within(reopened).getByRole("button", { name: "Save choices" }));
    expect(consentCalls(fake)[1].body).toMatchObject({ action: "withdraw", analytics: false });
    expect(localStorage.getItem("mm_vid")).toBeNull();
  });

  it("stays hidden once a choice was made", async () => {
    saveConsent({ action: "accept_all", analytics: true });
    installFakeApi(analyticsApi());
    renderRoute("/about");
    await screen.findByRole("button", { name: "Cookie settings" });
    await new Promise((r) => setTimeout(r, 1000));
    expect(screen.queryByRole("region", { name: "Your privacy, your choice" })).not.toBeInTheDocument();
  });
});

describe("account privacy page", () => {
  const privacyApi = (extra = {}) => analyticsApi({ ...signedInAs(customer), "POST /api/auth/logout": () => [204, null], ...extra });

  it("downloads my data", async () => {
    const fake = installFakeApi(privacyApi({ "GET /api/me/data-export": () => [200, { profile: {} }] }));
    URL.createObjectURL = vi.fn(() => "blob:x");
    URL.revokeObjectURL = vi.fn();
    renderRoute("/account/privacy");
    await userEvent.setup().click(await screen.findByRole("button", { name: "Download my data" }));
    await waitFor(() => expect(fake.calls.some((c) => c.path === "/api/me/data-export")).toBe(true));
    expect(URL.createObjectURL).toHaveBeenCalled();
  });

  it("deletes the account only with the password and DELETE typed, then signs out", async () => {
    let attempt = 0;
    const fake = installFakeApi(
      privacyApi({
        "POST /api/me/delete": () => {
          attempt += 1;
          return attempt === 1
            ? [409, { error: { code: "ORDERS_IN_PROGRESS", message: "You have an order that’s still in progress or awaiting a refund." } }]
            : [200, { deleted: "anonymized", anonymizedOrders: 2 }];
        },
      })
    );
    const { router } = renderRoute("/account/privacy");
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Delete my account" }));
    const form = screen.getByRole("form", { name: "Confirm account deletion" });
    await user.click(within(form).getByRole("button", { name: "Permanently delete my account" }));
    expect(within(form).getByText("Enter your password")).toBeInTheDocument();
    expect(within(form).getByText("Type DELETE to confirm")).toBeInTheDocument();

    await user.type(within(form).getByLabelText("Your password"), "Ritual2025");
    await user.type(within(form).getByLabelText("Confirm by typing DELETE"), "DELETE");
    await user.click(within(form).getByRole("button", { name: "Permanently delete my account" }));
    expect(await within(form).findByRole("alert")).toHaveTextContent("still in progress");
    expect(within(form).getByRole("link", { name: "View my orders" })).toBeInTheDocument();

    await user.click(within(form).getByRole("button", { name: "Permanently delete my account" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/"));
    expect(fake.calls.filter((c) => c.path === "/api/me/delete").at(-1).body).toEqual({ password: "Ritual2025", confirm: "DELETE" });
    expect(await screen.findByText(/Your account has been deleted/)).toBeInTheDocument();
  });
});

describe("web analytics dashboard", () => {
  const report = {
    range: { from: "2026-09-18", to: "2026-10-17", days: 30, granularity: "day", timezone: "Asia/Kolkata" },
    retentionDays: 90,
    kpis: { pageviews: 1200, sessions: 400, visitors: 350, bounceRate: 0.4, avgSessionMs: 125000, pagesPerSession: 3 },
    previous: { pageviews: 1000, sessions: 0, visitors: 0, bounceRate: 0, avgSessionMs: 0, pagesPerSession: 0 },
    trend: [{ key: "2026-10-16", pageviews: 600, sessions: 200, visitors: 180 }, { key: "2026-10-17", pageviews: 600, sessions: 200, visitors: 170 }],
    topPages: [{ key: "/solutions", count: 500 }, { key: "/", count: 400 }],
    sources: [{ key: "direct", count: 250 }, { key: "instagram", count: 150 }],
    devices: { types: [{ key: "mobile", count: 300 }, { key: "desktop", count: 100 }], browsers: [{ key: "Chrome", count: 400 }], os: [{ key: "Android", count: 300 }] },
    events: [{ key: "add_to_cart", count: 42 }],
    vitals: [
      { name: "LCP", count: 100, average: 2100, good: 80, needsImprovement: 15, poor: 5 },
      { name: "FCP", count: 0, average: null, good: 0, needsImprovement: 0, poor: 0 },
      { name: "CLS", count: 100, average: 0.31, good: 50, needsImprovement: 20, poor: 30 },
      { name: "TTFB", count: 100, average: 900, good: 40, needsImprovement: 50, poor: 10 },
      { name: "INP", count: 100, average: 150, good: 90, needsImprovement: 10, poor: 0 },
    ],
    consent: { total: 50, acceptAll: 30, essentialOnly: 15, custom: 5, withdraw: 1, analyticsOn: 33 },
  };

  it("shows traffic, live visitors, vitals with a status label, and consent", async () => {
    const fake = installFakeApi({ ...signedInAs(admin), "GET /api/admin/analytics/web": () => [200, report], "GET /api/admin/analytics/live": () => [200, { activeNow: 7, pages: [{ key: "/solutions", count: 4 }], windowMinutes: 5 }] });
    renderRoute("/admin/web-analytics");
    const figures = await screen.findByRole("list", { name: "Key figures" });
    expect(within(figures).getByText("1,200")).toBeInTheDocument();
    expect(within(figures).getByText("+20.0% vs previous 30 days")).toBeInTheDocument();
    expect(within(figures).getByText("No visits in the previous 30 days")).toBeInTheDocument();
    expect(await within(figures).findByText("7")).toBeInTheDocument();
    expect(within(figures).getByText(/Most on \/solutions/)).toBeInTheDocument();
    expect(within(figures).getByText("2m 05s")).toBeInTheDocument();
    expect(within(figures).getByText("66.0%")).toBeInTheDocument();

    const vitals = screen.getByRole("list", { name: "Core Web Vitals" });
    expect(within(vitals).getByText("2.10 s")).toBeInTheDocument();
    expect(within(vitals).getAllByText("Good")).toHaveLength(2);
    expect(within(vitals).getByText("Poor")).toBeInTheDocument();
    expect(within(vitals).getByText("Needs improvement")).toBeInTheDocument();
    expect(within(vitals).getByText("No measurements yet")).toBeInTheDocument();

    expect(screen.getByRole("table", { name: "Most viewed pages" })).toHaveTextContent("/solutions");
    expect(screen.getByRole("region", { name: "Cookie consent" })).toHaveTextContent("Essential only15");
    expect(fake.calls.find((c) => c.path === "/api/admin/analytics/web").query).toMatchObject({ from: expect.any(String), to: expect.any(String) });
  });

  it("is listed in the admin menu", async () => {
    installFakeApi({ ...signedInAs(admin), "GET /api/admin/analytics/web": () => [200, report], "GET /api/admin/analytics/live": () => [200, { activeNow: 0, pages: [], windowMinutes: 5 }] });
    renderRoute("/admin/web-analytics");
    expect(await screen.findByRole("link", { name: "Web analytics & cookies" })).toHaveAttribute("aria-current", "page");
  });
});
