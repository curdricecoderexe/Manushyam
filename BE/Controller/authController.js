const crypto = require("crypto");
const { User } = require("../Models/User");
const { OtpChallenge } = require("../Models/OtpChallenge");
const { hashPassword, verifyPassword } = require("../Services/password");
const otp = require("../Services/otp");
const tokens = require("../Services/tokens");
const mailer = require("../Services/mailer");
const { invalidateUser } = require("../Services/userCache");
const { AppError } = require("../Utils/AppError");

const MAX_FAILED_LOGINS = 8;
const LOCK_MS = 15 * 60 * 1000;

function maskEmail(email) {
  const [local, domain] = email.split("@");
  return `${local.slice(0, 2)}${"•".repeat(Math.max(1, local.length - 2))}@${domain}`;
}

async function startSession(res, user, req, familyId) {
  const accessToken = tokens.signAccessToken(user);
  const refreshToken = await tokens.issueRefreshToken(user, { familyId, req });
  res.cookie(tokens.REFRESH_COOKIE, refreshToken, tokens.refreshCookieOptions());
  return { user: user.toPublic(), accessToken };
}

// --- Registration: details → emailed code → account created ---------------------------------

async function registerStart(req, res) {
  const { name, email, password } = req.body;
  const existing = await User.exists({ email });
  if (existing) {
    // Same response as a new signup so the form can't be used to discover registered emails.
    await mailer.sendAccountExistsEmail({ to: email });
    return res.status(202).json({ challengeId: crypto.randomUUID(), email: maskEmail(email), expiresIn: otp.OTP_TTL_MS / 1000 });
  }
  const passwordHash = await hashPassword(password);
  const { challenge, code } = await otp.createChallenge({ purpose: "register", email, payload: { name, passwordHash } });
  await mailer.sendOtpEmail({ to: email, code, purpose: "register" });
  return res.status(202).json({ challengeId: challenge.challengeId, email: maskEmail(email), expiresIn: otp.OTP_TTL_MS / 1000 });
}

async function registerVerify(req, res) {
  const challenge = await otp.verifyChallenge({ ...req.body, purpose: "register" });
  const { name, passwordHash } = challenge.payload || {};
  let user;
  try {
    user = await User.create({ name, email: challenge.email, passwordHash, emailVerifiedAt: new Date(), lastLoginAt: new Date() });
  } catch (err) {
    if (err.code === 11000) throw AppError.conflict("An account with this email already exists. Please sign in.");
    throw err;
  }
  return res.status(201).json(await startSession(res, user, req));
}

// --- Login: password → (emailed code) → session ----------------------------------------------

async function login(req, res) {
  const { email, password } = req.body;
  const user = await User.findOne({ email }).select("+passwordHash +failedLoginCount +lockUntil");

  if (user?.lockUntil && user.lockUntil > new Date()) {
    throw new AppError(429, "ACCOUNT_LOCKED", "Too many failed attempts. Try again in 15 minutes or reset your password.");
  }

  const ok = await verifyPassword(password, user?.passwordHash);
  if (!user || !ok || !user.isActive || user.deletedAt) {
    if (user && !ok) {
      const failed = (user.failedLoginCount || 0) + 1;
      const update = failed >= MAX_FAILED_LOGINS ? { failedLoginCount: 0, lockUntil: new Date(Date.now() + LOCK_MS) } : { failedLoginCount: failed };
      await User.updateOne({ _id: user._id }, { $set: update });
    }
    throw new AppError(401, "INVALID_CREDENTIALS", "Email or password is incorrect.");
  }

  if (user.failedLoginCount || user.lockUntil) {
    await User.updateOne({ _id: user._id }, { $set: { failedLoginCount: 0 }, $unset: { lockUntil: 1 } });
  }

  const needsOtp = user.role !== "customer" || req.app.locals.env.CUSTOMER_LOGIN_OTP;
  if (needsOtp) {
    const { challenge, code } = await otp.createChallenge({ purpose: "login", email: user.email, user: user._id });
    await mailer.sendOtpEmail({ to: user.email, code, purpose: "login" });
    return res.json({ otpRequired: true, challengeId: challenge.challengeId, email: maskEmail(user.email), expiresIn: otp.OTP_TTL_MS / 1000 });
  }

  await User.updateOne({ _id: user._id }, { $set: { lastLoginAt: new Date() } });
  return res.json({ otpRequired: false, ...(await startSession(res, user, req)) });
}

async function loginVerify(req, res) {
  const challenge = await otp.verifyChallenge({ ...req.body, purpose: "login" });
  const user = await User.findById(challenge.user);
  if (!user || !user.isActive || user.deletedAt) throw new AppError(401, "INVALID_CREDENTIALS", "This account is not available.");
  user.lastLoginAt = new Date();
  await user.save();
  return res.json(await startSession(res, user, req));
}

async function resendCode(req, res) {
  const { challenge, code } = await otp.resendChallenge(req.body.challengeId);
  await mailer.sendOtpEmail({ to: challenge.email, code, purpose: challenge.purpose });
  return res.json({ ok: true, expiresIn: otp.OTP_TTL_MS / 1000 });
}

// --- Session ------------------------------------------------------------------------------------

async function refresh(req, res) {
  const old = await tokens.rotateRefreshToken(req.cookies?.[tokens.REFRESH_COOKIE], req);
  const user = await User.findById(old.user);
  if (!user || !user.isActive || user.deletedAt) {
    res.clearCookie(tokens.REFRESH_COOKIE, { ...tokens.refreshCookieOptions(), maxAge: undefined });
    throw AppError.unauthorized("Session expired. Please sign in again.");
  }
  return res.json(await startSession(res, user, req, old.familyId));
}

async function logout(req, res) {
  await tokens.revokeFamilyByToken(req.cookies?.[tokens.REFRESH_COOKIE]);
  res.clearCookie(tokens.REFRESH_COOKIE, { ...tokens.refreshCookieOptions(), maxAge: undefined });
  return res.status(204).end();
}

// --- Password reset ----------------------------------------------------------------------------

const RESET_RESPONSE = { message: "If an account exists for this email, we’ve sent a 6-digit reset code." };

async function forgotPassword(req, res) {
  const { email } = req.body;
  const user = await User.findOne({ email, isActive: true, deletedAt: { $exists: false } });
  if (user) {
    const recent = await OtpChallenge.exists({ email, purpose: "reset", consumedAt: { $exists: false }, lastSentAt: { $gt: new Date(Date.now() - otp.RESEND_COOLDOWN_MS) } });
    if (!recent) {
      const { code } = await otp.createChallenge({ purpose: "reset", email, user: user._id });
      await mailer.sendOtpEmail({ to: email, code, purpose: "reset" });
    }
  }
  return res.status(202).json(RESET_RESPONSE);
}

async function resetPassword(req, res) {
  const { email, code, password } = req.body;
  const challenge = await otp.verifyChallenge({ purpose: "reset", email, code });
  const passwordHash = await hashPassword(password);
  await User.updateOne(
    { _id: challenge.user },
    { $set: { passwordHash, failedLoginCount: 0 }, $unset: { lockUntil: 1 }, $inc: { tokenVersion: 1 } }
  );
  await tokens.revokeAllForUser(challenge.user);
  invalidateUser(challenge.user);
  await mailer.sendPasswordChangedEmail({ to: email });
  return res.json({ message: "Your password has been reset. Please sign in." });
}

module.exports = { registerStart, registerVerify, login, loginVerify, resendCode, refresh, logout, forgotPassword, resetPassword, startSession };
