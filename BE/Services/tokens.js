const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const { RefreshToken } = require("../Models/RefreshToken");
const { getEnv } = require("../Config/runtime");
const { AppError } = require("../Utils/AppError");

const ACCESS_TTL = "15m";
const REFRESH_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const REFRESH_COOKIE = "mm_rt";
const JWT_OPTS = { issuer: "manushyam-api", audience: "manushyam-web", algorithm: "HS256" };

function signAccessToken(user) {
  return jwt.sign({ sub: user._id.toString(), role: user.role, tv: user.tokenVersion }, getEnv().JWT_ACCESS_SECRET, {
    ...JWT_OPTS,
    expiresIn: ACCESS_TTL,
  });
}

function verifyAccessToken(token) {
  // Pinning the algorithm rejects alg:none and algorithm-confusion tokens.
  return jwt.verify(token, getEnv().JWT_ACCESS_SECRET, { ...JWT_OPTS, algorithms: ["HS256"] });
}

function hashToken(token) {
  return crypto.createHmac("sha256", getEnv().JWT_REFRESH_SECRET).update(token).digest("hex");
}

async function issueRefreshToken(user, { familyId, req }) {
  const token = crypto.randomBytes(48).toString("base64url");
  await RefreshToken.create({
    user: user._id,
    familyId: familyId ?? crypto.randomUUID(),
    tokenHash: hashToken(token),
    expiresAt: new Date(Date.now() + REFRESH_TTL_MS),
    userAgent: req?.get?.("user-agent")?.slice(0, 300),
    ip: req?.ip,
  });
  return token;
}

// Rotates a refresh token. Reuse of an already-rotated token revokes the whole session family.
async function rotateRefreshToken(token, req) {
  if (!token) throw AppError.unauthorized("Session expired. Please sign in again.");
  const doc = await RefreshToken.findOne({ tokenHash: hashToken(token) });
  if (!doc || doc.expiresAt < new Date()) throw AppError.unauthorized("Session expired. Please sign in again.");

  if (doc.rotatedAt || doc.revokedAt) {
    await RefreshToken.updateMany({ familyId: doc.familyId, revokedAt: { $exists: false } }, { $set: { revokedAt: new Date() } });
    req?.log?.warn({ userId: doc.user.toString(), familyId: doc.familyId }, "Refresh token reuse detected — session revoked");
    throw AppError.unauthorized("Session expired. Please sign in again.");
  }

  // Atomic claim so two concurrent refreshes can't both succeed with the same token.
  const claimed = await RefreshToken.findOneAndUpdate({ _id: doc._id, rotatedAt: { $exists: false } }, { $set: { rotatedAt: new Date() } });
  if (!claimed) throw AppError.unauthorized("Session expired. Please sign in again.");
  return doc;
}

async function revokeFamilyByToken(token) {
  if (!token) return;
  const doc = await RefreshToken.findOne({ tokenHash: hashToken(token) });
  if (doc) await RefreshToken.updateMany({ familyId: doc.familyId }, { $set: { revokedAt: new Date() } });
}

async function revokeAllForUser(userId) {
  await RefreshToken.updateMany({ user: userId, revokedAt: { $exists: false } }, { $set: { revokedAt: new Date() } });
}

function refreshCookieOptions() {
  const env = getEnv();
  return {
    httpOnly: true,
    secure: env.isProd,
    sameSite: "strict",
    path: "/api/auth",
    maxAge: REFRESH_TTL_MS,
  };
}

module.exports = {
  signAccessToken,
  verifyAccessToken,
  issueRefreshToken,
  rotateRefreshToken,
  revokeFamilyByToken,
  revokeAllForUser,
  refreshCookieOptions,
  REFRESH_COOKIE,
};
