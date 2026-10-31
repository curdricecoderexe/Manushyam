const mongoose = require("mongoose");
const { User } = require("../Models/User");
const { Address, MAX_ADDRESSES } = require("../Models/Address");
const { hashPassword, verifyPassword } = require("../Services/password");
const tokens = require("../Services/tokens");
const mailer = require("../Services/mailer");
const { invalidateUser } = require("../Services/userCache");
const { startSession } = require("./authController");
const { AppError } = require("../Utils/AppError");

async function loadMe(req) {
  const user = await User.findById(req.user.id);
  if (!user) throw AppError.unauthorized();
  return user;
}

// --- Profile -----------------------------------------------------------------------------------

async function getMe(req, res) {
  res.json({ user: (await loadMe(req)).toPublic() });
}

async function updateMe(req, res) {
  const user = await loadMe(req);
  // Only whitelisted fields reach here (validated with a strict schema).
  Object.assign(user, req.body);
  await user.save();
  res.json({ user: user.toPublic() });
}

async function changePassword(req, res) {
  const user = await User.findById(req.user.id).select("+passwordHash");
  if (!user || !(await verifyPassword(req.body.currentPassword, user.passwordHash))) {
    throw AppError.badRequest("Your current password is incorrect.", [{ path: "currentPassword", message: "Incorrect password" }]);
  }
  user.passwordHash = await hashPassword(req.body.newPassword);
  user.tokenVersion += 1;
  await user.save();
  await tokens.revokeAllForUser(user._id);
  invalidateUser(user._id);
  await mailer.sendPasswordChangedEmail({ to: user.email });
  // Other devices are signed out; this one gets a fresh session.
  res.json(await startSession(res, user, req));
}

async function logoutEverywhere(req, res) {
  await User.updateOne({ _id: req.user.id }, { $inc: { tokenVersion: 1 } });
  await tokens.revokeAllForUser(req.user.id);
  invalidateUser(req.user.id);
  res.clearCookie(tokens.REFRESH_COOKIE, { ...tokens.refreshCookieOptions(), maxAge: undefined });
  res.status(204).end();
}

// --- Addresses (every query is scoped to the signed-in user to prevent IDOR) ------------------

async function listAddresses(req, res) {
  const items = await Address.find({ user: req.user.id }).sort({ isDefault: -1, updatedAt: -1 });
  res.json({ addresses: items.map((a) => a.toPublic()) });
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

async function createAddress(req, res) {
  const address = await withTransaction(async (session) => {
    const count = await Address.countDocuments({ user: req.user.id }).session(session);
    if (count >= MAX_ADDRESSES) throw AppError.badRequest(`You can save up to ${MAX_ADDRESSES} addresses.`);
    const isDefault = count === 0 || Boolean(req.body.isDefault);
    if (isDefault) await Address.updateMany({ user: req.user.id }, { $set: { isDefault: false } }, { session });
    const [doc] = await Address.create([{ ...req.body, isDefault, user: req.user.id }], { session });
    return doc;
  });
  res.status(201).json({ address: address.toPublic() });
}

async function updateAddress(req, res) {
  const address = await withTransaction(async (session) => {
    const doc = await Address.findOne({ _id: req.params.id, user: req.user.id }).session(session);
    if (!doc) throw AppError.notFound("Address not found");
    const { isDefault, ...fields } = req.body;
    Object.assign(doc, fields);
    if (isDefault && !doc.isDefault) {
      await Address.updateMany({ user: req.user.id }, { $set: { isDefault: false } }, { session });
      doc.isDefault = true;
    }
    await doc.save({ session });
    return doc;
  });
  res.json({ address: address.toPublic() });
}

async function setDefaultAddress(req, res) {
  const address = await withTransaction(async (session) => {
    const doc = await Address.findOne({ _id: req.params.id, user: req.user.id }).session(session);
    if (!doc) throw AppError.notFound("Address not found");
    await Address.updateMany({ user: req.user.id }, { $set: { isDefault: false } }, { session });
    doc.isDefault = true;
    await doc.save({ session });
    return doc;
  });
  res.json({ address: address.toPublic() });
}

async function deleteAddress(req, res) {
  await withTransaction(async (session) => {
    const doc = await Address.findOneAndDelete({ _id: req.params.id, user: req.user.id }, { session });
    if (!doc) throw AppError.notFound("Address not found");
    if (doc.isDefault) {
      // Promote the most recently used remaining address so the user always has a default.
      const next = await Address.findOne({ user: req.user.id }).sort({ updatedAt: -1 }).session(session);
      if (next) await Address.updateOne({ _id: next._id }, { $set: { isDefault: true } }, { session });
    }
  });
  res.status(204).end();
}

module.exports = { getMe, updateMe, changePassword, logoutEverywhere, listAddresses, createAddress, updateAddress, setDefaultAddress, deleteAddress };
