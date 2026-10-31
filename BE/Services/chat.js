const { Chat, ChatMessage } = require("../Models/Chat");
const { User } = require("../Models/User");
const { emit, userRoom, chatRoom, STAFF_ROOM } = require("./realtime");
const { notify } = require("./notifications");
const { AppError } = require("../Utils/AppError");

const MAX_MESSAGE = 2000;
const HISTORY_PAGE = 50;
const HISTORY_MAX = 500;

const isStaff = (user) => user.role === "staff" || user.role === "admin";
const firstName = (name) => String(name ?? "").trim().split(/\s+/)[0] || "Support";

// Customers see their own chats; admins see every chat; staff see the queue and chats assigned to them.
function canAccess(chat, user) {
  if (String(chat.customer?._id ?? chat.customer) === String(user.id)) return true;
  if (user.role === "admin") return true;
  if (user.role === "staff") return chat.status === "pending" || String(chat.assignedTo?._id ?? chat.assignedTo) === String(user.id);
  return false;
}

async function loadChat(chatId, user) {
  const chat = await Chat.findById(chatId).populate("assignedTo", "name").populate("customer", "name email phone");
  // Someone else's chat looks exactly like a missing one.
  if (!chat || !canAccess(chat, user)) throw AppError.notFound("Conversation not found");
  return chat;
}

function chatView(chat, viewer) {
  const staffView = viewer && isStaff(viewer) && String(chat.customer?._id ?? chat.customer) !== String(viewer.id);
  return {
    id: String(chat._id),
    status: chat.status,
    topic: chat.topic ?? null,
    orderNumber: chat.orderNumber ?? null,
    // Customers only ever see the agent's first name.
    agent: chat.assignedTo?.name ? { name: firstName(chat.assignedTo.name) } : null,
    ...(staffView
      ? {
          customer: chat.customer?.email ? { id: String(chat.customer._id), name: chat.customer.name, email: chat.customer.email, phone: chat.customer.phone ?? null } : null,
          assignedToId: chat.assignedTo ? String(chat.assignedTo._id ?? chat.assignedTo) : null,
          unread: chat.unread?.staff ?? 0,
        }
      : { unread: chat.unread?.customer ?? 0 }),
    lastMessageAt: chat.lastMessageAt,
    lastMessagePreview: chat.lastMessagePreview ?? "",
    messageCount: chat.messageCount,
    createdAt: chat.createdAt,
    closedAt: chat.closedAt ?? null,
  };
}

// Pushes the chat's new state to everyone who may be looking at it, viewed as each side would see it.
async function broadcastChat(chatId) {
  const chat = await Chat.findById(chatId).populate("assignedTo", "name").populate("customer", "name email phone");
  if (!chat) return;
  emit([userRoom(chat.customer._id)], "chat:updated", chatView(chat, { id: String(chat.customer._id), role: "customer" }));
  // Staff side (admin view shape; the staff UI filters by assignment itself).
  emit([STAFF_ROOM, chatRoom(chat._id)], "chat:staff-updated", chatView(chat, { id: "staff", role: "admin" }));
}

async function systemMessage(chat, body) {
  const msg = await ChatMessage.create({ chat: chat._id, senderRole: "system", body });
  await Chat.updateOne({ _id: chat._id }, { $set: { lastMessageAt: msg.createdAt }, $inc: { messageCount: 1 } });
  emit([chatRoom(chat._id), userRoom(chat.customer._id ?? chat.customer)], "chat:message", msg.toPublic());
  return msg;
}

// Returns the customer's open conversation, or starts a new one in the staff queue.
async function openChat(user, { message, topic, orderNumber, clientId } = {}) {
  let chat = await Chat.findOne({ customer: user.id, status: { $in: ["pending", "active"] } });
  let created = false;
  if (!chat) {
    try {
      chat = await Chat.create({ customer: user.id, topic, orderNumber });
      created = true;
    } catch (err) {
      // Two tabs opened a chat at the same moment: use the one that won.
      if (err?.code !== 11000) throw err;
      chat = await Chat.findOne({ customer: user.id, status: { $in: ["pending", "active"] } });
    }
  }
  if (message) await postMessage(chat._id, user, { body: message, clientId });
  if (created) emit(STAFF_ROOM, "queue:updated", { chatId: String(chat._id) });
  return loadChat(chat._id, user);
}

function cleanBody(body) {
  const text = String(body ?? "")
    // eslint-disable-next-line no-control-regex -- deliberately stripping control characters
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .trim();
  if (!text) throw AppError.badRequest("Type a message first.");
  if (text.length > MAX_MESSAGE) throw AppError.badRequest(`Messages can be up to ${MAX_MESSAGE} characters.`);
  return text;
}

// The sender always comes from the authenticated session, never from the payload.
async function postMessage(chatId, user, { body, clientId }) {
  const chat = await loadChat(chatId, user);
  const text = cleanBody(body);
  if (chat.status === "closed") throw new AppError(409, "CHAT_CLOSED", "This conversation is closed. Reopen it to continue.");
  const fromCustomer = String(chat.customer._id) === String(user.id);
  if (!fromCustomer && chat.status === "pending") throw new AppError(409, "CHAT_NOT_ACCEPTED", "Accept this conversation before replying.");
  if (!fromCustomer && user.role === "staff" && String(chat.assignedTo?._id) !== String(user.id)) throw AppError.notFound("Conversation not found");

  const me = await User.findById(user.id).select("name role");
  let msg;
  try {
    msg = await ChatMessage.create({ chat: chat._id, sender: user.id, senderRole: fromCustomer ? "customer" : me.role, senderName: fromCustomer ? me.name : firstName(me.name), body: text, clientId });
  } catch (err) {
    // A retried send with the same client id: return the stored message instead of a duplicate.
    if (err?.code === 11000 && clientId) return ChatMessage.findOne({ chat: chat._id, clientId });
    throw err;
  }
  await Chat.updateOne(
    { _id: chat._id },
    { $set: { lastMessageAt: msg.createdAt, lastMessagePreview: text.slice(0, 140) }, $inc: { messageCount: 1, [fromCustomer ? "unread.staff" : "unread.customer"]: 1 } }
  );
  const rooms = [chatRoom(chat._id), userRoom(chat.customer._id)];
  if (chat.assignedTo) rooms.push(userRoom(chat.assignedTo._id));
  emit(rooms, "chat:message", msg.toPublic());
  if (chat.status === "pending") emit(STAFF_ROOM, "queue:updated", { chatId: String(chat._id) });
  return msg;
}

async function acceptChat(chatId, user) {
  if (!isStaff(user)) throw AppError.forbidden();
  const me = await User.findById(user.id).select("name");
  const chat = await Chat.findOneAndUpdate({ _id: chatId, status: "pending" }, { $set: { status: "active", assignedTo: user.id, acceptedAt: new Date() } }, { new: true });
  if (!chat) {
    const exists = await Chat.exists({ _id: chatId });
    throw exists ? new AppError(409, "CHAT_TAKEN", "Another team member has already picked up this conversation.") : AppError.notFound("Conversation not found");
  }
  await systemMessage(chat, `${firstName(me.name)} from ManushyaM has joined the chat.`);
  notify(chat.customer, { type: "chat", title: "Support has joined your chat", body: `${firstName(me.name)} is ready to help.`, link: "/account?chat=open" });
  emit(STAFF_ROOM, "queue:updated", { chatId: String(chat._id) });
  await broadcastChat(chat._id);
  return loadChat(chat._id, user);
}

async function closeChat(chatId, user) {
  const chat = await loadChat(chatId, user);
  if (chat.status === "closed") return chat;
  const byCustomer = String(chat.customer._id) === String(user.id);
  if (!byCustomer && user.role === "staff" && String(chat.assignedTo?._id) !== String(user.id)) throw AppError.forbidden("Only the assigned team member can close this conversation.");
  const updated = await Chat.findOneAndUpdate({ _id: chat._id, status: { $ne: "closed" } }, { $set: { status: "closed", closedAt: new Date(), closedBy: byCustomer ? "customer" : user.role } }, { new: true });
  if (updated) {
    await systemMessage(updated, byCustomer ? "You closed this conversation." : "This conversation was closed by ManushyaM support. Reopen it any time if you need more help.");
    if (chat.status === "pending") emit(STAFF_ROOM, "queue:updated", { chatId: String(chat._id) });
    await broadcastChat(chat._id);
  }
  return loadChat(chat._id, user);
}

// Customers reopen a closed conversation; it goes back to the queue for whoever is free.
async function reopenChat(chatId, user) {
  const chat = await loadChat(chatId, user);
  if (String(chat.customer._id) !== String(user.id)) throw AppError.forbidden("Only the customer can reopen a conversation.");
  if (chat.status !== "closed") return chat;
  try {
    await Chat.updateOne({ _id: chat._id, status: "closed" }, { $set: { status: "pending" }, $unset: { assignedTo: "", closedAt: "", closedBy: "", acceptedAt: "" } });
  } catch (err) {
    if (err?.code === 11000) throw new AppError(409, "CHAT_ALREADY_OPEN", "You already have an open conversation with us.");
    throw err;
  }
  await systemMessage(chat, "Conversation reopened. A team member will be with you shortly.");
  emit(STAFF_ROOM, "queue:updated", { chatId: String(chat._id) });
  await broadcastChat(chat._id);
  return loadChat(chat._id, user);
}

async function markRead(chatId, user) {
  const chat = await loadChat(chatId, user);
  const side = String(chat.customer._id) === String(user.id) ? "customer" : "staff";
  await Chat.updateOne({ _id: chat._id }, { $set: { [`unread.${side}`]: 0 } });
}

// Newest page first (up to 500 messages back), returned oldest → newest for display.
async function history(chatId, user, { before } = {}) {
  const chat = await loadChat(chatId, user);
  const filter = { chat: chat._id, ...(before ? { createdAt: { $lt: before } } : {}) };
  const page = await ChatMessage.find(filter).sort({ createdAt: -1, _id: -1 }).limit(HISTORY_PAGE);
  const older = before ? await ChatMessage.countDocuments({ chat: chat._id, createdAt: { $gte: before } }) : 0;
  return { messages: page.reverse().map((m) => m.toPublic()), hasMore: page.length === HISTORY_PAGE && older + page.length < HISTORY_MAX };
}

module.exports = { canAccess, loadChat, chatView, openChat, postMessage, acceptChat, closeChat, reopenChat, markRead, history, isStaff, MAX_MESSAGE };
