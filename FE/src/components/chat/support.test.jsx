import { describe, it, expect, vi, afterEach } from "vitest";
import { screen, within, waitFor, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderRoute } from "../../test/renderRoute";
import { installFakeApi, signedInAs, customer } from "../../test/fakeApi";
import { catalogApi } from "../../test/catalogFixtures";
import { lastSocket, onClientEvent } from "../../test/fakeSocket";
import { openSupportChat } from "../../lib/chat";

afterEach(() => vi.unstubAllGlobals());

const staff = { ...customer, id: "s1", name: "Sunil Staff", email: "staff@example.com", role: "staff" };
const EMPTY_CART = { items: [], lines: [], count: 0, subtotal: 0, discount: 0, shipping: 0, total: 0, coupon: null, issues: [], canCheckout: false };
const notification = (id, overrides = {}) => ({ id, type: "order", title: `Note ${id}`, body: "", link: "/account/orders/MM261004-7KQ2X", read: false, createdAt: "2026-10-04T10:00:00Z", ...overrides });

function signedIn(user, handlers = {}) {
  return catalogApi({
    ...signedInAs(user),
    "GET /api/cart": () => [200, { cart: EMPTY_CART }],
    "GET /api/wishlist": () => [200, { products: [] }],
    "GET /api/notifications": () => [200, { notifications: [], unreadCount: 0 }],
    "GET /api/chat/mine": () => [200, { chats: [] }],
    ...handlers,
  });
}

describe("notification bell", () => {
  it("shows unread notifications, marks them read on click and takes the user to the link", async () => {
    const fake = installFakeApi(signedIn(customer, { "GET /api/notifications": () => [200, { notifications: [notification("n1"), notification("n2", { read: true, title: "Older" })], unreadCount: 1 }] }));
    fake.set("POST /api/notifications/n1/read", () => [200, { notification: notification("n1", { read: true }) }]);
    fake.set("GET /api/orders/MM261004-7KQ2X", () => [404, { error: { code: "NOT_FOUND", message: "Order not found" } }]);
    const user = userEvent.setup();
    const { router } = renderRoute("/faq");
    const bell = await screen.findByRole("button", { name: "Notifications, 1 unread" });
    await user.click(bell);
    const panel = screen.getByRole("region", { name: "Notifications" });
    expect(within(panel).getByText("Note n1")).toHaveTextContent("(unread)");
    await user.click(within(panel).getByRole("button", { name: /Note n1/ }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/account/orders/MM261004-7KQ2X"));
    expect(fake.calls.some((c) => c.path === "/api/notifications/n1/read" && c.method === "POST")).toBe(true);
    expect(screen.getByRole("button", { name: "Notifications" })).toBeInTheDocument();
  });

  it("updates instantly when the server pushes a new notification", async () => {
    installFakeApi(signedIn(customer));
    renderRoute("/faq");
    await screen.findByRole("button", { name: "Notifications" });
    await waitFor(() => expect(lastSocket()?.connected).toBe(true));
    act(() => lastSocket().serverEmit("notification:new", notification("n9", { title: "Your order has shipped" })));
    expect(await screen.findByRole("button", { name: "Notifications, 1 unread" })).toBeInTheDocument();
  });

  it("isn't shown to guests", async () => {
    installFakeApi(catalogApi());
    renderRoute("/faq");
    await screen.findByRole("heading", { level: 1 });
    expect(screen.queryByRole("button", { name: /^Notifications/ })).not.toBeInTheDocument();
  });
});

describe("customer chat widget", () => {
  it("asks guests to sign in (or use WhatsApp)", async () => {
    installFakeApi(catalogApi());
    const user = userEvent.setup();
    renderRoute("/faq");
    await user.click(await screen.findByRole("button", { name: "Chat with ManushyaM support" }));
    const panel = screen.getByRole("dialog", { name: "ManushyaM support chat" });
    expect(within(panel).getByRole("link", { name: "Sign in to chat" })).toHaveAttribute("href", "/login?next=%2Ffaq%3Fchat%3Dopen");
    expect(within(panel).getByRole("link", { name: /WhatsApp/ })).toHaveAttribute("href", "https://wa.me/917829600018");
  });

  it("starts a conversation with the first message, then chats live over the socket", async () => {
    const chat = { id: "c1", status: "pending", agent: null, unread: 0, lastMessageAt: "2026-10-04T10:00:00Z", lastMessagePreview: "", messageCount: 1 };
    const history = [{ id: "m1", chatId: "c1", senderRole: "customer", senderName: "Ananya", body: "Where is my order?", clientId: "x", createdAt: "2026-10-04T10:00:00Z" }];
    const fake = installFakeApi(
      signedIn(customer, {
        "POST /api/chat": (body) => {
          history[0].clientId = body.clientId;
          return [201, { chat }];
        },
        "GET /api/chat/c1/messages": () => [200, { messages: history, hasMore: false }],
      })
    );
    onClientEvent("chat:send", (p) => (p.body === "too fast" ? { ok: false, error: { code: "RATE_LIMITED", message: "You’re sending messages too fast. Please slow down." } } : { ok: true, message: { id: "m3", chatId: "c1", senderRole: "customer", body: p.body, clientId: p.clientId, createdAt: "2026-10-04T10:02:00Z" } }));
    const user = userEvent.setup();
    renderRoute("/faq");
    await user.click(await screen.findByRole("button", { name: "Chat with ManushyaM support" }));
    const panel = screen.getByRole("dialog", { name: "ManushyaM support chat" });
    expect(await within(panel).findByText("Namaste! How can we help?")).toBeInTheDocument();

    await user.type(within(panel).getByLabelText("Type your message"), "Where is my order?{Enter}");
    expect(fake.calls.find((c) => c.path === "/api/chat" && c.method === "POST").body).toEqual({ message: "Where is my order?", clientId: expect.any(String) });
    expect(await within(panel).findByText("Waiting for the next available team member…")).toBeInTheDocument();
    expect(within(panel).getAllByText("Where is my order?")).toHaveLength(1);

    // Staff accepts and replies (pushed by the server).
    act(() => {
      lastSocket().serverEmit("chat:updated", { ...chat, status: "active", agent: { name: "Sunil" } });
      lastSocket().serverEmit("chat:message", { id: "m2", chatId: "c1", senderRole: "staff", senderName: "Sunil", body: "Let me check that for you.", createdAt: "2026-10-04T10:01:00Z" });
    });
    expect(await within(panel).findByText("Chatting with Sunil")).toBeInTheDocument();
    expect(within(panel).getByText("Let me check that for you.")).toBeInTheDocument();
    expect(lastSocket().sent.some((e) => e.event === "chat:read")).toBe(true);

    await user.type(within(panel).getByLabelText("Type your message"), "Thanks!{Enter}");
    expect(await within(panel).findByText("Thanks!")).toBeInTheDocument();
    expect(lastSocket().sent.find((e) => e.event === "chat:send").payload).toMatchObject({ chatId: "c1", body: "Thanks!" });

    await user.type(within(panel).getByLabelText("Type your message"), "too fast{Enter}");
    expect(await within(panel).findByRole("alert")).toHaveTextContent("sending messages too fast");
    expect(within(panel).getByLabelText("Type your message")).toHaveValue("too fast");
  });

  it("resumes an open chat with an unread badge, and opens from other pages with order context", async () => {
    installFakeApi(
      signedIn(customer, {
        "GET /api/chat/mine": () => [200, { chats: [{ id: "c1", status: "active", agent: { name: "Sunil" }, unread: 2, lastMessageAt: "2026-10-04T10:00:00Z", lastMessagePreview: "Hi", messageCount: 3 }] }],
        "GET /api/chat/c1/messages": () => [200, { messages: [{ id: "m1", chatId: "c1", senderRole: "staff", senderName: "Sunil", body: "Your parcel ships today.", createdAt: "2026-10-04T10:00:00Z" }], hasMore: false }],
      })
    );
    renderRoute("/faq");
    expect(await screen.findByRole("button", { name: "Chat with ManushyaM support, 2 new" })).toBeInTheDocument();
    act(() => openSupportChat({ orderNumber: "MM261004-7KQ2X" }));
    const panel = await screen.findByRole("dialog", { name: "ManushyaM support chat" });
    expect(await within(panel).findByText("Your parcel ships today.")).toBeInTheDocument();
    expect(within(panel).getByText("Chatting with Sunil")).toBeInTheDocument();
  });

  it("is hidden for staff (they use the support desk)", async () => {
    installFakeApi(signedIn(staff));
    renderRoute("/faq");
    await screen.findByRole("button", { name: /^Notifications/ });
    expect(screen.queryByRole("button", { name: /Chat with ManushyaM support/ })).not.toBeInTheDocument();
  });
});

describe("support desk", () => {
  it("lets staff pick up a waiting conversation and reply", async () => {
    const waiting = { id: "c1", status: "pending", agent: null, customer: { id: "u1", name: "Ananya Sharma", email: "ananya@example.com", phone: "9876543210" }, assignedToId: null, unread: 1, orderNumber: "MM261004-7KQ2X", lastMessageAt: "2026-10-04T10:00:00Z", lastMessagePreview: "Where is my order?", messageCount: 1 };
    const state = { chat: waiting, mine: [] };
    const fake = installFakeApi(
      signedIn(staff, {
        "GET /api/chat/staff/queue": () => [200, { chats: state.chat.status === "pending" ? [state.chat] : [] }],
        "GET /api/chat/staff/active": () => [200, { chats: state.mine }],
        "GET /api/chat/c1": () => [200, { chat: state.chat }],
        "GET /api/chat/c1/messages": () => [200, { messages: [{ id: "m1", chatId: "c1", senderRole: "customer", body: "Where is my order?", createdAt: "2026-10-04T10:00:00Z" }], hasMore: false }],
        "POST /api/chat/c1/read": () => [204, null],
        "POST /api/chat/c1/accept": () => {
          state.chat = { ...waiting, status: "active", agent: { name: "Sunil" }, assignedToId: "s1", unread: 0 };
          state.mine = [state.chat];
          return [200, { chat: state.chat }];
        },
      })
    );
    onClientEvent("chat:send", (p) => ({ ok: true, message: { id: "m9", chatId: "c1", senderId: "s1", senderRole: "staff", senderName: "Sunil", body: p.body, clientId: p.clientId, createdAt: "2026-10-04T10:05:00Z" } }));
    const user = userEvent.setup();
    renderRoute("/admin/support");
    expect(await screen.findByRole("heading", { name: "Support desk" })).toBeInTheDocument();
    await user.click(await screen.findByRole("button", { name: /Ananya Sharma/ }));
    expect(await screen.findByText("ananya@example.com · +91 9876543210")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Order MM261004-7KQ2X" })).toHaveAttribute("href", "/admin/orders?q=MM261004-7KQ2X");
    expect(screen.getByText("Accept this conversation to reply.")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Accept" }));
    await user.type(await screen.findByLabelText("Reply"), "On its way today!{Enter}");
    expect(await screen.findByText("On its way today!")).toBeInTheDocument();
    expect(fake.calls.some((c) => c.path === "/api/chat/c1/accept")).toBe(true);
    expect(screen.getByRole("tab", { name: "My chats (1)" })).toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: /All chats/ })).not.toBeInTheDocument();
  });
});
