const mongoose = require("mongoose");

const CHAT_STATUSES = ["pending", "active", "closed"];

// A support conversation ("ticket"). pending = waiting in the staff queue; active = a staff member
// accepted it; closed = finished (the customer can reopen it, which puts it back in the queue).
const chatSchema = new mongoose.Schema(
  {
    customer: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: "User", index: true },
    status: { type: String, enum: CHAT_STATUSES, default: "pending", index: true },
    topic: { type: String, trim: true, maxlength: 80 },
    // Optional context, e.g. the order the customer opened the chat from.
    orderNumber: { type: String, maxlength: 20 },
    lastMessageAt: { type: Date, default: Date.now },
    lastMessagePreview: { type: String, maxlength: 140 },
    messageCount: { type: Number, default: 0 },
    // Unread counts per side, reset when that side reads the chat.
    unread: { _id: false, customer: { type: Number, default: 0 }, staff: { type: Number, default: 0 } },
    acceptedAt: Date,
    closedAt: Date,
    closedBy: { type: String, enum: ["customer", "staff", "admin", "system"] },
  },
  { timestamps: true }
);
chatSchema.index({ status: 1, lastMessageAt: -1 });
// At most one open (pending or active) conversation per customer.
chatSchema.index({ customer: 1 }, { unique: true, partialFilterExpression: { status: { $in: ["pending", "active"] } }, name: "one_open_chat_per_customer" });

const MESSAGE_SENDERS = ["customer", "staff", "admin", "system"];

const chatMessageSchema = new mongoose.Schema(
  {
    chat: { type: mongoose.Schema.Types.ObjectId, ref: "Chat", required: true },
    sender: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    senderRole: { type: String, enum: MESSAGE_SENDERS, required: true },
    // Display name captured at send time (staff show by first name only).
    senderName: { type: String, maxlength: 60 },
    body: { type: String, required: true, maxlength: 2000 },
    // Client-generated id so a retried send isn't stored twice.
    clientId: { type: String, maxlength: 64 },
    createdAt: { type: Date, default: Date.now },
  },
  { versionKey: false }
);
chatMessageSchema.index({ chat: 1, createdAt: -1 });
chatMessageSchema.index({ chat: 1, clientId: 1 }, { unique: true, partialFilterExpression: { clientId: { $type: "string" } } });

chatMessageSchema.methods.toPublic = function toPublic() {
  return { id: String(this._id), chatId: String(this.chat), senderId: this.sender ? String(this.sender) : null, senderRole: this.senderRole, senderName: this.senderName ?? null, body: this.body, clientId: this.clientId ?? null, createdAt: this.createdAt };
};

const Chat = mongoose.models.Chat || mongoose.model("Chat", chatSchema);
const ChatMessage = mongoose.models.ChatMessage || mongoose.model("ChatMessage", chatMessageSchema);

module.exports = { Chat, ChatMessage, CHAT_STATUSES };
