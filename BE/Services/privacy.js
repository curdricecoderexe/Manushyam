const crypto = require("crypto");
const mongoose = require("mongoose");
const { User } = require("../Models/User");
const { Address } = require("../Models/Address");
const { Order } = require("../Models/Order");
const { Cart, Wishlist } = require("../Models/Cart");
const { Review } = require("../Models/Review");
const { Notification } = require("../Models/Notification");
const { Chat, ChatMessage } = require("../Models/Chat");
const { RefreshToken } = require("../Models/RefreshToken");
const { OtpChallenge } = require("../Models/OtpChallenge");
const { NewsletterSubscriber, ContactMessage } = require("../Models/Engagement");
const { ConsentRecord } = require("../Models/Analytics");
// Registers the Product model for populate() below.
require("../Models/Product");
const { recomputeRating } = require("./reviews");
const { AppError } = require("../Utils/AppError");

// DPDP Act 2023: a customer can download everything we hold about them, and erase it. Orders are the
// exception — GST law makes us keep invoices — so those are anonymised instead of deleted.

// Orders still moving (or owed a refund) need the customer's contact details to finish.
const FINISHED = ["delivered", "cancelled", "rto", "refunded"];
const openOrderFilter = (userId) => ({ user: userId, $or: [{ status: { $nin: FINISHED } }, { "refund.status": { $in: ["requested", "pending"] } }] });

async function exportUserData(userId) {
  const user = await User.findById(userId);
  if (!user) throw AppError.unauthorized();
  const [addresses, orders, reviews, cart, wishlist, notifications, chats, newsletter, contactMessages, consents] = await Promise.all([
    Address.find({ user: userId }).sort({ createdAt: 1 }),
    Order.find({ user: userId }).sort({ createdAt: 1 }),
    Review.find({ user: userId }).populate("product", "name slug").sort({ createdAt: 1 }),
    Cart.findOne({ user: userId }).lean(),
    Wishlist.findOne({ user: userId }).populate("products", "name slug").lean(),
    Notification.find({ user: userId }).sort({ createdAt: 1 }),
    Chat.find({ customer: userId }).sort({ createdAt: 1 }).lean(),
    NewsletterSubscriber.findOne({ email: user.email }).lean(),
    ContactMessage.find({ email: user.email }).sort({ createdAt: 1 }).lean(),
    ConsentRecord.find({ user: userId }).sort({ at: 1 }).lean(),
  ]);
  const messages = await ChatMessage.find({ chat: { $in: chats.map((c) => c._id) } }).sort({ createdAt: 1 }).lean();

  return {
    format: "ManushyaM personal data export",
    generatedAt: new Date().toISOString(),
    note: "Everything ManushyaM holds about your account. Payment card/UPI details are held by Razorpay, never by us. Website analytics are not linked to your account.",
    profile: { ...user.toPublic(), lastLoginAt: user.lastLoginAt ?? null },
    addresses: addresses.map((a) => a.toPublic()),
    orders: orders.map((o) => {
      const { id, canCancel, razorpayOrderId, reservedUntil, hasInvoice, ...rest } = o.toCustomer();
      return { ...rest, invoiceNumber: o.invoiceNumber ?? null, email: o.email };
    }),
    reviews: reviews.map((r) => ({ product: r.product?.name ?? null, rating: r.rating, title: r.title ?? null, body: r.body ?? null, displayedAs: r.authorName, status: r.status, createdAt: r.createdAt })),
    cart: (cart?.items ?? []).map((i) => ({ sku: i.sku, qty: i.qty, addedAt: i.addedAt })),
    wishlist: (wishlist?.products ?? []).map((p) => ({ name: p.name, slug: p.slug })),
    notifications: notifications.map((n) => n.toPublic()),
    supportChats: chats.map((c) => ({
      topic: c.topic ?? null,
      orderNumber: c.orderNumber ?? null,
      status: c.status,
      createdAt: c.createdAt,
      messages: messages.filter((m) => String(m.chat) === String(c._id)).map((m) => ({ from: m.senderRole, name: m.senderName ?? null, text: m.body, at: m.createdAt })),
    })),
    newsletter: newsletter ? { status: newsletter.status, confirmedAt: newsletter.confirmedAt ?? null, unsubscribedAt: newsletter.unsubscribedAt ?? null } : null,
    contactMessages: contactMessages.map((m) => ({ subject: m.subject, message: m.message, phone: m.phone ?? null, sentAt: m.createdAt })),
    cookieConsents: consents.map((c) => ({ choice: c.action, analytics: c.analytics, policyVersion: c.policyVersion, at: c.at })),
  };
}

async function withTransaction(fn) {
  const session = await mongoose.startSession();
  try {
    let result;
    await session.withTransaction(async () => {
      result = await fn(session);
    });
    return result;
  } finally {
    await session.endSession();
  }
}

// Erases a customer's account. Returns { mode: "deleted" | "anonymized", anonymizedOrders, email }.
async function deleteAccount(userId) {
  const user = await User.findById(userId);
  if (!user || user.deletedAt) throw AppError.unauthorized();
  if (user.role !== "customer") throw AppError.forbidden("Staff and admin accounts are removed by an admin.");
  if (await Order.exists(openOrderFilter(user._id))) {
    throw new AppError(409, "ORDERS_IN_PROGRESS", "You have an order that’s still in progress or awaiting a refund. You can delete your account once it’s finished.");
  }

  const email = user.email;
  const reviewedProducts = await Review.distinct("product", { user: user._id });
  const chatIds = (await Chat.find({ customer: user._id }).select("_id")).map((c) => c._id);

  const anonymizedOrders = await withTransaction(async (session) => {
    const opts = { session };
    await Promise.all([
      Address.deleteMany({ user: user._id }, opts),
      Cart.deleteMany({ user: user._id }, opts),
      Wishlist.deleteMany({ user: user._id }, opts),
      Notification.deleteMany({ user: user._id }, opts),
      Review.deleteMany({ user: user._id }, opts),
      ChatMessage.deleteMany({ chat: { $in: chatIds } }, opts),
      Chat.deleteMany({ customer: user._id }, opts),
      RefreshToken.deleteMany({ user: user._id }, opts),
      OtpChallenge.deleteMany({ $or: [{ user: user._id }, { email }] }, opts),
      NewsletterSubscriber.deleteMany({ email }, opts),
      ContactMessage.deleteMany({ email }, opts),
      // The consent records stay as evidence, but no longer point at a person.
      ConsentRecord.updateMany({ user: user._id }, { $unset: { user: "" } }, opts),
    ]);

    // GST invoices must be kept: strip who/where from the order, keeping city/state/PIN (place of supply).
    const { modifiedCount } = await Order.updateMany(
      { user: user._id },
      {
        $set: { email: `deleted-${user._id}@deleted.invalid`, customerName: "Deleted customer", "address.fullName": "Deleted customer" },
        $unset: { "address.phone": "", "address.line1": "", "address.line2": "", "address.landmark": "" },
      },
      opts
    );

    if (!modifiedCount) {
      await User.deleteOne({ _id: user._id }, opts);
      return 0;
    }
    // Orders still reference the account (sales history), so it stays as an empty, locked shell.
    await User.updateOne(
      { _id: user._id },
      {
        $set: {
          name: "Deleted customer",
          email: `deleted-${user._id}@deleted.invalid`,
          passwordHash: `!deleted:${crypto.randomBytes(16).toString("hex")}`,
          isActive: false,
          deletedAt: new Date(),
          anonymizedAt: new Date(),
          tokenVersion: user.tokenVersion + 1,
        },
        $unset: { phone: "", emailVerifiedAt: "", lastLoginAt: "" },
      },
      opts
    );
    return modifiedCount;
  });

  // Ratings shown on product pages no longer include the removed reviews.
  await Promise.all(reviewedProducts.map((id) => recomputeRating(id)));
  return { mode: anonymizedOrders ? "anonymized" : "deleted", anonymizedOrders, email };
}

module.exports = { exportUserData, deleteAccount, openOrderFilter };