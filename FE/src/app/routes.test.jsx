import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { screen, within, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderRoute } from "../test/renderRoute";
import { installFakeApi } from "../test/fakeApi";
import { catalogApi } from "../test/catalogFixtures";
import { INTRO_KEY } from "../components/layout/IntroLoader";
import { navForRole } from "../data/adminNav";

describe("store shell", () => {
  beforeEach(() => installFakeApi(catalogApi()));
  afterEach(() => vi.unstubAllGlobals());

  it("renders header, footer and the WhatsApp button around a page", async () => {
    renderRoute("/about");
    expect(await screen.findByRole("heading", { level: 1, name: /About ManushyaM/ })).toBeInTheDocument();
    expect(screen.getAllByRole("navigation", { name: "Main" }).length).toBeGreaterThan(0);
    expect(screen.getByText("COD Available")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /WhatsApp/ })).toHaveAttribute("href", expect.stringContaining("wa.me/"));
    expect(screen.getByRole("contentinfo")).toBeInTheDocument();
  });

  it("marks the current page in the main nav", async () => {
    renderRoute("/faq");
    await screen.findByRole("heading", { level: 1, name: "Frequently Asked Questions" });
    const nav = screen.getAllByRole("navigation", { name: "Main" })[0];
    expect(within(nav).getByRole("link", { name: "FAQ" })).toHaveAttribute("aria-current", "page");
    expect(within(nav).getByRole("link", { name: "Home" })).not.toHaveAttribute("aria-current");
  });

  it("opens the Solutions menu with all four products and closes on Escape", async () => {
    renderRoute("/about");
    await screen.findByRole("heading", { level: 1 });
    const toggle = screen.getByRole("button", { name: /Solutions/ });
    await userEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(await screen.findByRole("link", { name: /Men Anti-Hairfall Therapy/ })).toHaveAttribute("href", "/solutions/men-anti-hairfall-therapy");
    expect(screen.getAllByRole("link", { name: /Anti-Hairfall/ })).toHaveLength(4);
    expect(screen.getByRole("link", { name: "Weak Roots" })).toHaveAttribute("href", "/solutions?concern=weak-roots");
    await userEvent.keyboard("{Escape}");
    expect(toggle).toHaveAttribute("aria-expanded", "false");
  });

  it("shows the 404 page for unknown URLs", async () => {
    renderRoute("/no-such-page");
    expect(await screen.findByRole("heading", { name: "This path has wandered off." })).toBeInTheDocument();
  });
});

describe("admin navigation by role", () => {
  it("hides admin-only sections from staff", () => {
    const labels = navForRole("staff").flatMap((g) => g.items.map((i) => i.label));
    expect(labels).toEqual(["Dashboard", "Orders", "Inventory", "Support desk", "Inbox"]);
  });
});

describe("intro loader", () => {
  beforeEach(() => installFakeApi());
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("shows once per session, then hides and remembers it", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    renderRoute("/about", { introSeen: false });
    expect(await screen.findByRole("status", { name: "Loading ManushyaM" })).toBeInTheDocument();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });
    // The glide timer starts after the re-render that follows the first one, so step until it's gone.
    for (let i = 0; i < 10 && screen.queryByRole("status", { name: "Loading ManushyaM" }); i += 1) {
      await act(async () => {
        await vi.advanceTimersByTimeAsync(200);
      });
    }
    expect(screen.queryByRole("status", { name: "Loading ManushyaM" })).not.toBeInTheDocument();
    expect(sessionStorage.getItem(INTRO_KEY)).toBe("1");
  });

  it("is skipped when already seen this session", async () => {
    renderRoute("/about", { introSeen: true });
    await screen.findByRole("heading", { level: 1 });
    expect(screen.queryByRole("status", { name: "Loading ManushyaM" })).not.toBeInTheDocument();
  });
});
