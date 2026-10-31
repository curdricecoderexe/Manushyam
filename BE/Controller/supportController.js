const { Notification } = require("../Models/Notification");
const { Chat } = require("../Models/Chat");
const chat = require("../Services/chat");
const { emit, userRoom } = require("../Services/realtime");
const { AppError } = require("../Utils/AppError");

// --- Notifications (always scoped to the signed-in user) ---------------------------------------

async function listNotifications(req, res) {
  const { unread, limit } = req.validatedQuery;
  const filter = { user: req.user.id, ...(unread === "1" ? { readAt: { $exists: false } } : {}) };
  const [list, unreadCount] = await Promise.all([Notification.find(filter).sort({ createdAt: -1, _id: -1 }).limit(limit), Notification.countDocuments({ user: req.user.id, readAt: { $exists: false } })]);
  res.set("Cache-Control", "no-store");
  res.json({ notifications: list.map((n) => n.toPublic()), unreadCount });
}

async function markNotificationRead(req, res) {
  const n = await Notification.findOneAndUpdate({ _id: req.params.id, user: req.user.id }, { $set: { readAt: new Date() } }, { new: true });
  if (!n) throw AppError.notFound("Notification not found");
  emit(userRoom(req.user.id), "notification:read", { id: String(n._id) });
  res.json({ notification: n.toPublic() });
}

async function markAllRead(req, res) {
  await Notification.updateMany({ user: req.user.id, readAt: { $exists: false } }, { $set: { readAt: new Date() } });
  emit(userRoom(req.user.id), "notification:read", { all: true });
  res.status(204).end();
}

// --- Chat: customer -----------------------------------------------------------------------------

async function openChat(req, res) {
  const c = await chat.openChat(req.user, req.body);
  res.status(201).json({ chat: chat.chatView(c, req.user) });
}

async function myChats(req, res) {
  const list = await Chat.find({ customer: req.user.id }).sort({ lastMessageAt: -1 }).limit(50).populate("assignedTo", "name");
  res.set("Cache-Control", "no-store");
  res.json({ chats: list.map((c) => chat.chatView(c, req.user)) });
}

async function getChat(req, res) {
  const c = await chat.loadChat(req.params.id, req.user);
  res.json({ chat: chat.chatView(c, req.user) });
}

async function chatMessages(req, res) {
  res.set("Cache-Control", "no-store");
  res.json(await chat.history(req.params.id, req.user, req.validatedQuery));
}

// REST fallback for sending (the widget uses the socket when connected).
async function sendMessage(req, res) {
  const msg = await chat.postMessage(req.params.id, req.user, req.body);
  res.status(201).json({ message: msg.toPublic() });
}

async function closeChat(req, res) {
  res.json({ chat: chat.chatView(await chat.closeChat(req.params.id, req.user), req.user) });
}

async function reopenChat(req, res) {
  res.json({ chat: chat.chatView(await chat.reopenChat(req.params.id, req.user), req.user) });
}

async function readChat(req, res) {
  await chat.markRead(req.params.id, req.user);
  res.status(204).end();
}

// --- Chat: staff desk ---------------------------------------------------------------------------

const withPeople = (q) => q.populate("assignedTo", "name").populate("customer", "name email phone");

async function queue(req, res) {
  const list = await withPeople(Chat.find({ status: "pending" }).sort({ createdAt: 1 }).limit(100));
  res.set("Cache-Control", "no-store");
  res.json({ chats: list.map((c) => chat.chatView(c, req.user)) });
}

async function myActive(req, res) {
  const list = await withPeople(Chat.find({ status: "active", assignedTo: req.user.id }).sort({ lastMessageAt: -1 }).limit(100));
  res.set("Cache-Control", "no-store");
  res.json({ chats: list.map((c) => chat.chatView(c, req.user)) });
}

async function acceptChat(req, res) {
  res.json({ chat: chat.chatView(await chat.acceptChat(req.params.id, req.user), req.user) });
}

// Admin: every conversation (any status, any agent).
async function allChats(req, res) {
  const { status, page } = req.validatedQuery;
  const filter = status ? { status } : {};
  const [list, total] = await Promise.all([
    withPeople(
      Chat.find(filter)
        .sort({ lastMessageAt: -1 })
        .skip((page - 1) * 30)
        .limit(30)
    ),
    Chat.countDocuments(filter),
  ]);
  res.json({ chats: list.map((c) => chat.chatView(c, req.user)), page, pages: Math.max(1, Math.ceil(total / 30)), total });
}

module.exports = { listNotifications, markNotificationRead, markAllRead, openChat, myChats, getChat, chatMessages, sendMessage, closeChat, reopenChat, readChat, queue, myActive, acceptChat, allChats };
