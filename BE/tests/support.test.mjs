import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from "vitest";
import request from "supertest";
import http from "http";
import { io as connect } from "socket.io-client";
import { createRequire } from "module";
import { buildApp, startDb, stopDb, clearDb, registerUser, registerAs, bearer, testEnvVars } from "./helpers.mjs";

const require = createRequire(import.meta.url);
const { loadEnv } = require("../Config/env.js");
const { attachSocketServer } = require("../Sockets/index.js");
const { setIo } = require("../Services/realtime.js");
const { Chat, ChatMessage } = require("../Models/Chat.js");
const { Notification } = require("../Models/Notification.js");
const { User } = require("../Models/User.js");
const { invalidateUser } = require("../Services/userCache.js");
const { drainMailQueue } = require("../Services/mailQueue.js");
const orderEvents = require("../Services/orderEvents.js");

const app = buildApp();
let server;
let url;
const sockets = [];

beforeAll(async () => {
  await startDb();
  await Promise.all([Chat.syncIndexes(), ChatMessage.syncIndexes(), Notification.syncIndexes()]);
  server = http.createServer(app);
  attachSocketServer(server, loadEnv(testEnvVars));
  await new Promise((r) => server.listen(0, r));
  url = `http://localhost:${server.address().port}`;
});
afterAll(async () => {
  setIo(null);
  await new Promise((r) => server.close(r));
  await stopDb();
});
beforeEach(clearDb);
afterEach(async () => {
  sockets.splice(0).forEach((s) => s.disconnect());
  await drainMailQueue();
});

function socketFor(token) {
  const s = connect(url, { auth: { token }, transports: ["websocket"], reconnection: false, forceNew: true });
  sockets.push(s);
  return s;
}
const connected = (s) => new Promise((resolve, reject) => (s.connected ? resolve() : (s.once("connect", resolve), s.once("connect_error", reject))));
const ask = (s, event, payload) => new Promise((resolve) => s.emit(event, payload, resolve));
const next = (s, event) => new Promise((resolve) => s.once(event, resolve));

describe("notifications", () => {
  const order = (userId) => ({ user: userId, orderNumber: "MM261004-ABCDE", paymentMethod: "cod", amounts: { subtotal: 49900, discount: 0, shipping: 0, codFee: 0, total: 49900 }, items: [], address: { city: "Bengaluru", fullName: "A B" }, email: "a@example.com" });

  it("creates customer and staff notifications for order events; users only see and mark their own", async () => {
    const customer = await registerUser(app);
    const staff = await registerAs(app, "staff");
    orderEvents.orderConfirmed(order(customer.user.id));
    await drainMailQueue();

    const mine = await request(app).get("/api/notifications").set(bearer(customer.accessToken));
    expect(mine.body.unreadCount).toBe(1);
    expect(mine.body.notifications[0]).toMatchObject({ type: "order", title: "Order confirmed", body: "Order MM261004-ABCDE · ₹499", link: "/account/orders/MM261004-ABCDE", read: false });
    const team = await request(app).get("/api/notifications").set(bearer(staff.accessToken));
    expect(team.body.notifications[0]).toMatchObject({ title: "New order MM261004-ABCDE", link: "/admin/orders?q=MM261004-ABCDE" });

    const id = mine.body.notifications[0].id;
    expect((await request(app).post(`/api/notifications/${id}/read`).set(bearer(staff.accessToken))).status).toBe(404);
    expect((await request(app).post(`/api/notifications/${id}/read`).set(bearer(customer.accessToken))).body.notification.read).toBe(true);

    orderEvents.orderShipped({ ...order(customer.user.id), shipment: { courier: "Delhivery" } });
    orderEvents.orderOutForDelivery(order(customer.user.id));
    await drainMailQueue();
    expect((await request(app).get("/api/notifications?unread=1").set(bearer(customer.accessToken))).body.notifications.map((n) => n.title)).toEqual(["Out for delivery today", "Your order has shipped"]);
    expect((await request(app).post("/api/notifications/read-all").set(bearer(customer.accessToken))).status).toBe(204);
    expect((await request(app).get("/api/notifications").set(bearer(customer.accessToken))).body.unreadCount).toBe(0);
    expect((await request(app).get("/api/notifications")).status).toBe(401);
  });

  it("pushes new notifications to the user's open tabs", async () => {
    const customer = await registerUser(app);
    const s = socketFor(customer.accessToken);
    await connected(s);
    const pushed = next(s, "notification:new");
    orderEvents.orderDelivered({ ...order(customer.user.id), invoiceNumber: null });
    await drainMailQueue();
    expect(await pushed).toMatchObject({ title: "Delivered — how was it?", read: false });
  });
});

describe("chat over REST", () => {
  it("runs the lifecycle: open → queue → accept → reply → close → reopen", async () => {
    const customer = await registerUser(app, { name: "Chitra Customer" });
    const c = bearer(customer.accessToken);
    const staffA = await registerAs(app, "staff");
    await User.updateOne({ _id: staffA.user.id }, { $set: { name: "Sunil Kumar" } });
    const staffB = await registerAs(app, "staff");
    const admin = await registerAs(app, "admin");
    const a = bearer(staffA.accessToken);
    const b = bearer(staffB.accessToken);

    const opened = await request(app).post("/api/chat").set(c).send({ message: "Where is my order?", orderNumber: "mm261004-abcde" });
    expect(opened.status).toBe(201);
    expect(opened.body.chat).toMatchObject({ status: "pending", agent: null, orderNumber: "MM261004-ABCDE", lastMessagePreview: "Where is my order?", unread: 0 });
    expect(opened.body.chat.customer).toBeUndefined();
    const id = opened.body.chat.id;
    // Opening again resumes the same conversation.
    expect((await request(app).post("/api/chat").set(c).send({})).body.chat.id).toBe(id);

    const q = await request(app).get("/api/chat/staff/queue").set(a);
    expect(q.body.chats).toEqual([expect.objectContaining({ id, customer: expect.objectContaining({ name: "Chitra Customer", email: customer.email }), unread: 1 })]);
    expect((await request(app).post(`/api/chat/${id}/messages`).set(a).send({ body: "Hi!" })).body.error.code).toBe("CHAT_NOT_ACCEPTED");
    expect((await request(app).get("/api/chat/staff/queue").set(c)).status).toBe(403);

    const accepted = await request(app).post(`/api/chat/${id}/accept`).set(a);
    expect(accepted.body.chat).toMatchObject({ status: "active", agent: { name: "Sunil" }, assignedToId: staffA.user.id });
    expect((await request(app).post(`/api/chat/${id}/accept`).set(b)).body.error.code).toBe("CHAT_TAKEN");
    // Another staff member can't read someone else's active chat; admins can read everything.
    expect((await request(app).get(`/api/chat/${id}/messages`).set(b)).status).toBe(404);
    expect((await request(app).get(`/api/chat/${id}/messages`).set(bearer(admin.accessToken))).status).toBe(200);

    await request(app).post(`/api/chat/${id}/messages`).set(a).send({ body: "Let me check that for you." });
    const view = await request(app).get(`/api/chat/${id}`).set(c);
    expect(view.body.chat).toMatchObject({ agent: { name: "Sunil" }, unread: 1 });
    await request(app).post(`/api/chat/${id}/read`).set(c);
    expect((await request(app).get(`/api/chat/${id}`).set(c)).body.chat.unread).toBe(0);

    const hist = await request(app).get(`/api/chat/${id}/messages`).set(c);
    expect(hist.body.messages.map((m) => [m.senderRole, m.body])).toEqual([
      ["customer", "Where is my order?"],
      ["system", "Sunil from ManushyaM has joined the chat."],
      ["staff", "Let me check that for you."],
    ]);
    expect(hist.body.messages[2].senderName).toBe("Sunil");

    expect((await request(app).post(`/api/chat/${id}/close`).set(b)).status).toBe(404);
    expect((await request(app).post(`/api/chat/${id}/close`).set(c)).body.chat.status).toBe("closed");
    expect((await request(app).post(`/api/chat/${id}/messages`).set(c).send({ body: "One more thing" })).body.error.code).toBe("CHAT_CLOSED");
    expect((await request(app).post(`/api/chat/${id}/reopen`).set(a)).status).toBe(403);
    const reopened = await request(app).post(`/api/chat/${id}/reopen`).set(c);
    expect(reopened.body.chat).toMatchObject({ status: "pending", agent: null });

    const all = await request(app).get("/api/chat/admin/all").set(bearer(admin.accessToken));
    expect(all.body.total).toBe(1);
    expect((await request(app).get("/api/chat/admin/all").set(a)).status).toBe(403);
    const mine = await request(app).get("/api/chat/mine").set(c);
    expect(mine.body.chats).toHaveLength(1);

    await drainMailQueue();
    expect((await Notification.findOne({ user: customer.user.id })).title).toBe("Support has joined your chat");
  });

  it("keeps chats private, validates messages and de-duplicates retried sends", async () => {
    const owner = await registerUser(app);
    const stranger = await registerUser(app);
    const o = bearer(owner.accessToken);
    const id = (await request(app).post("/api/chat").set(o).send({})).body.chat.id;
    expect((await request(app).get(`/api/chat/${id}`).set(bearer(stranger.accessToken))).status).toBe(404);
    expect((await request(app).post(`/api/chat/${id}/messages`).set(bearer(stranger.accessToken)).send({ body: "hi" })).status).toBe(404);

    expect((await request(app).post(`/api/chat/${id}/messages`).set(o).send({ body: "x".repeat(2001) })).status).toBe(400);
    expect((await request(app).post(`/api/chat/${id}/messages`).set(o).send({ body: "   " })).status).toBe(400);
    expect((await request(app).post(`/api/chat/${id}/messages`).set(o).send({ body: "hi", senderRole: "staff" })).status).toBe(400);

    const send = () => request(app).post(`/api/chat/${id}/messages`).set(o).send({ body: "Hello there", clientId: "client-123456" });
    const [m1, m2] = [await send(), await send()];
    expect(m1.body.message.id).toBe(m2.body.message.id);
    expect(await ChatMessage.countDocuments({ chat: id })).toBe(1);
  });

  it("allows only one open conversation per customer, even when two tabs race", async () => {
    const customer = await registerUser(app);
    const c = bearer(customer.accessToken);
    const [x, y] = await Promise.all([request(app).post("/api/chat").set(c).send({}), request(app).post("/api/chat").set(c).send({})]);
    expect(x.body.chat.id).toBe(y.body.chat.id);
    expect(await Chat.countDocuments()).toBe(1);
  });
});

describe("chat over Socket.IO", () => {
  it("rejects connections without a valid token", async () => {
    const s = socketFor("not-a-token");
    await expect(connected(s)).rejects.toThrow("UNAUTHORIZED");
  });

  it("delivers messages live between the customer and the assigned agent, with access checks on join", async () => {
    const customer = await registerUser(app);
    const agent = await registerAs(app, "staff");
    const stranger = await registerUser(app);
    const id = (await request(app).post("/api/chat").set(bearer(customer.accessToken)).send({})).body.chat.id;

    const cs = socketFor(customer.accessToken);
    const as = socketFor(agent.accessToken);
    const xs = socketFor(stranger.accessToken);
    await Promise.all([connected(cs), connected(as), connected(xs)]);

    // Staff hear about new queue activity.
    const queued = next(as, "queue:updated");
    expect((await ask(cs, "chat:send", { chatId: id, body: "Hello?" })).ok).toBe(true);
    expect(await queued).toEqual({ chatId: id });

    expect((await ask(xs, "chat:join", { chatId: id })).error.code).toBe("NOT_FOUND");
    expect((await ask(cs, "chat:join", { chatId: id })).ok).toBe(true);
    await request(app).post(`/api/chat/${id}/accept`).set(bearer(agent.accessToken));
    expect((await ask(as, "chat:join", { chatId: id })).ok).toBe(true);

    const toCustomer = next(cs, "chat:message");
    const ack = await ask(as, "chat:send", { chatId: id, body: "Hi, I'm here to help.", clientId: "agent-msg-0001" });
    expect(ack.message).toMatchObject({ senderRole: "staff", body: "Hi, I'm here to help." });
    expect(await toCustomer).toMatchObject({ body: "Hi, I'm here to help.", senderId: agent.user.id });

    const typing = next(as, "chat:typing");
    await ask(cs, "chat:typing", { chatId: id });
    expect(await typing).toEqual({ chatId: id, role: "customer" });

    expect((await ask(cs, "chat:send", { chatId: id, body: "x".repeat(2001) })).error.code).toBe("BAD_REQUEST");
    expect((await ask(cs, "chat:send", { chatId: id, body: "hi", senderRole: "staff" })).error.code).toBe("VALIDATION_ERROR");
  });

  it("rate-limits each socket (burst of 10, then about one per second)", async () => {
    const customer = await registerUser(app);
    const id = (await request(app).post("/api/chat").set(bearer(customer.accessToken)).send({})).body.chat.id;
    const s = socketFor(customer.accessToken);
    await connected(s);
    const results = await Promise.all(Array.from({ length: 13 }, (_, i) => ask(s, "chat:send", { chatId: id, body: `msg ${i}` })));
    const limited = results.filter((r) => r.error?.code === "RATE_LIMITED");
    expect(limited.length).toBeGreaterThanOrEqual(2);
    expect(results.filter((r) => r.ok).length).toBeLessThanOrEqual(11);
  });

  it("cuts off a socket once the session is revoked", async () => {
    const customer = await registerUser(app);
    const id = (await request(app).post("/api/chat").set(bearer(customer.accessToken)).send({})).body.chat.id;
    const s = socketFor(customer.accessToken);
    await connected(s);
    await User.updateOne({ _id: customer.user.id }, { $inc: { tokenVersion: 1 } });
    invalidateUser(customer.user.id);
    const expired = next(s, "auth:expired");
    s.emit("chat:send", { chatId: id, body: "still here?" }, () => {});
    expect(await expired).toEqual({ reason: "revoked" });
    await new Promise((r) => (s.connected ? s.once("disconnect", r) : r()));
    expect(s.connected).toBe(false);
    expect(await ChatMessage.countDocuments({ chat: id })).toBe(0);
  });
});
