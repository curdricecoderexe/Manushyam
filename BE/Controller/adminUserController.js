const crypto = require("crypto");
const { User } = require("../Models/User");
const { Order } = require("../Models/Order");
const { Address } = require("../Models/Address");
const { Cart, Wishlist } = require("../Models/Cart");
const { Notification } = require("../Models/Notification");
const { Chat, ChatMessage } = require("../Models/Chat");
const { RefreshToken } = require("../Models/RefreshToken");
const { Review } = require("../Models/Review");
const { hashPassword } = require("../Services/password");
const { revokeAllForUser } = require("../Services/tokens");
const { invalidateUser } = require("../Services/userCache");
const { sendMail, escapeHtml } = require("../Services/mailer");
const { enqueue } = require("../Services/mailQueue");
const { audit } = require("../Services/audit");
const { escapeRegex } = require("../Services/search");
const { getEnv } = require("../Config/runtime");
const { AppError } = require("../Utils/AppError");


function adminView(user, stats) {
  return {
    ...user.toPublic(),
    isActive: user.isActive,
    deletedAt: user.deletedAt ?? null,
    anonymizedAt: user.anonymizedAt ?? null,
    lastLoginAt: user.lastLoginAt ?? null,
    ...(stats ? { orders: stats.orders ?? 0, spent: stats.spent ?? 0, lastOrderAt: stats.lastOrderAt ?? null } : {}),
  };
}

async function statsFor(userIds) {
  const rows = await Order.aggregate([
    { $match: { user: { $in: userIds } } },
    {
      $group: {
        _id: "$user",
        orders: { $sum: 1 },
        spent: { $sum: { $cond: [{ $and: [{ $ifNull: ["$invoiceNumber", false] }, { $not: [{ $in: ["$status", ["cancelled", "refunded"]] }] }] }, "$amounts.total", 0] } },
        lastOrderAt: { $max: "$createdAt" },
      },
    },
  ]);
  return new Map(rows.map((r) => [String(r._id), r]));
}

async function loadUser(id) {
  const user = await User.findById(id);
  if (!user) throw AppError.notFound("User not found");
  return user;
}

// The store must always keep at least one admin who can sign in.
async function assertNotLastAdmin(user) {
  if (user.role !== "admin" || !user.isActive || user.deletedAt) return;
  const others = await User.countDocuments({ _id: { $ne: user._id }, role: "admin", isActive: true, deletedAt: { $exists: false } });
  if (others === 0) throw new AppError(409, "LAST_ADMIN", "This is the only active admin. Make someone else an admin first.");
}

function assertNotSelf(req, user, message) {
  if (String(user._id) === req.user.id) throw new AppError(409, "SELF_CHANGE", message);
}

async function listUsers(req, res) {
  const { q, role, status, page, limit } = req.validatedQuery;
  const filter = {};
  if (role) filter.role = role;
  if (status === "deleted") filter.deletedAt = { $exists: true };
  else if (status) Object.assign(filter, { isActive: status === "active", deletedAt: { $exists: false } });
  if (q) {
    const rx = new RegExp(escapeRegex(q), "i");
    filter.$or = [{ name: rx }, { email: rx }, { phone: rx }];
  }
  const [users, total, counts] = await Promise.all([
    User.find(filter)
      .sort({ createdAt: -1, _id: -1 })
      .skip((page - 1) * limit)
      .limit(limit),
    User.countDocuments(filter),
    User.aggregate([{ $match: { deletedAt: { $exists: false } } }, { $group: { _id: "$role", n: { $sum: 1 } } }]),
  ]);
  const stats = await statsFor(users.map((u) => u._id));
  res.json({
    users: users.map((u) => adminView(u, stats.get(String(u._id)) ?? {})),
    total,
    page,
    pages: Math.max(1, Math.ceil(total / limit)),
    counts: Object.fromEntries(counts.map((c) => [c._id, c.n])),
  });
}

async function getUser(req, res) {
  const user = await loadUser(req.params.id);
  const [stats, recent, addresses] = await Promise.all([
    statsFor([user._id]),
    Order.find({ user: user._id }).sort({ createdAt: -1 }).limit(10).select("orderNumber status paymentMethod amounts.total createdAt"),
    Address.countDocuments({ user: user._id }),
  ]);
  res.json({
    user: adminView(user, stats.get(String(user._id)) ?? {}),
    recentOrders: recent.map((o) => ({ id: String(o._id), orderNumber: o.orderNumber, status: o.status, paymentMethod: o.paymentMethod, total: o.amounts.total, createdAt: o.createdAt })),
    addresses,
  });
}

// Admin-created accounts get an unusable random password; the invite email sends them to
// "Forgot password" to choose their own (which also proves they own the address).
async function createUser(req, res) {
  const { name, email, phone, role } = req.body;
  if (await User.exists({ email })) throw new AppError(409, "CONFLICT", "An account with this email already exists", [{ path: "email", message: "Already registered" }]);
  const passwordHash = await hashPassword(crypto.randomBytes(32).toString("base64url"));
  let user;
  try {
    user = await User.create({ name, email, phone, role, passwordHash, emailVerifiedAt: new Date() });
  } catch (err) {
    if (err?.code === 11000) throw new AppError(409, "CONFLICT", "An account with this email already exists", [{ path: "email", message: "Already registered" }]);
    throw err;
  }
  const link = `${getEnv().APP_URL}/forgot-password`;
  enqueue("account-invite", () =>
    sendMail({
      to: email,
      subject: "Your ManushyaM account is ready",
      heading: `Welcome, ${escapeHtml(name.split(" ")[0])}`,
      bodyHtml: `<p>An account has been created for you at ManushyaM${role !== "customer" ? ` with <strong>${role}</strong> access` : ""}.</p><p>To choose your password, open <a href="${link}">${link}</a> and enter this email address. We’ll send you a code to confirm it’s you.</p>`,
      text: `An account has been created for you at ManushyaM. Choose your password at ${link} using this email address.`,
      meta: { kind: "invite" },
    })
  );
  audit(req, { action: "user.create", resourceId: user._id, after: { name, email, phone, role }, summary: email });
  res.status(201).json({ user: adminView(user, {}) });
}

async function updateUser(req, res) {
  const user = await loadUser(req.params.id);
  if (user.deletedAt) throw new AppError(409, "USER_DELETED", "Restore this account before changing it.");
  const { role, isActive } = req.body;
  const demoting = role !== undefined && role !== user.role;
  const deactivating = isActive === false && user.isActive;
  if (demoting || deactivating) {
    assertNotSelf(req, user, "You can’t change your own role or deactivate yourself.");
    if (user.role === "admin") await assertNotLastAdmin(user);
  }
  const before = { name: user.name, phone: user.phone ?? null, role: user.role, isActive: user.isActive };
  if (req.body.phone === null) {
    user.phone = undefined;
    delete req.body.phone;
  }
  user.set(req.body);
  // A role change or deactivation ends every session, so new access tokens carry the new role.
  if (demoting || deactivating) user.tokenVersion += 1;
  await user.save();
  if (demoting || deactivating) await revokeAllForUser(user._id);
  invalidateUser(user._id);
  const after = { name: user.name, phone: user.phone ?? null, role: user.role, isActive: user.isActive };
  const action = demoting ? "user.role" : isActive !== undefined && isActive !== before.isActive ? (isActive ? "user.activate" : "user.deactivate") : "user.update";
  audit(req, { action, resourceId: user._id, before, after, summary: user.email });
  res.json({ user: adminView(user) });
}

// Soft delete (default): the account can't sign in and is hidden, but orders and history stay intact.
// Hard delete: removes the account and its personal data — only for accounts with no orders,
// because orders (GST invoices) must be kept.
async function deleteUser(req, res) {
  const user = await loadUser(req.params.id);
  assertNotSelf(req, user, "You can’t delete your own account here.");
  await assertNotLastAdmin(user);
  const { mode } = req.validatedQuery;

  if (mode === "hard") {
    if (await Order.exists({ user: user._id })) throw new AppError(409, "HAS_ORDERS", "This customer has orders, which must be kept for GST. Use a soft delete instead.");
    const chats = await Chat.find({ customer: user._id }).select("_id");
    await Promise.all([
      Address.deleteMany({ user: user._id }),
      Cart.deleteMany({ user: user._id }),
      Wishlist.deleteMany({ user: user._id }),
      Notification.deleteMany({ user: user._id }),
      RefreshToken.deleteMany({ user: user._id }),
      Review.deleteMany({ user: user._id }),
      ChatMessage.deleteMany({ chat: { $in: chats.map((c) => c._id) } }),
      Chat.deleteMany({ customer: user._id }),
    ]);
    await User.deleteOne({ _id: user._id });
    invalidateUser(user._id);
    audit(req, { action: "user.hardDelete", resourceId: user._id, before: { name: user.name, email: user.email, role: user.role }, summary: user.email });
    return res.json({ deleted: "hard" });
  }

  if (user.deletedAt) return res.json({ deleted: "soft" });
  user.set({ deletedAt: new Date(), isActive: false, tokenVersion: user.tokenVersion + 1 });
  await user.save();
  await revokeAllForUser(user._id);
  invalidateUser(user._id);
  audit(req, { action: "user.softDelete", resourceId: user._id, before: { isActive: true, deletedAt: null }, after: { isActive: false, deletedAt: user.deletedAt }, summary: user.email });
  return res.json({ deleted: "soft" });
}

async function restoreUser(req, res) {
  const user = await loadUser(req.params.id);
  if (!user.deletedAt) return res.json({ user: adminView(user) });
  if (user.anonymizedAt) throw new AppError(409, "ANONYMIZED", "This customer deleted their account and their details were erased, so it can’t be restored.");
  const deletedAt = user.deletedAt;
  user.deletedAt = undefined;
  user.isActive = true;
  await user.save();
  invalidateUser(user._id);
  audit(req, { action: "user.restore", resourceId: user._id, before: { deletedAt }, after: { deletedAt: null, isActive: true }, summary: user.email });
  return res.json({ user: adminView(user) });
}

module.exports = { listUsers, getUser, createUser, updateUser, deleteUser, restoreUser };
