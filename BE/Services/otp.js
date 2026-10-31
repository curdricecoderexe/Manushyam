const crypto = require("crypto");
const { OtpChallenge } = require("../Models/OtpChallenge");
const { getEnv } = require("../Config/runtime");
const { AppError } = require("../Utils/AppError");

const OTP_TTL_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 5;
const RESEND_COOLDOWN_MS = 30 * 1000;
const MAX_SENDS = 5;

function generateCode() {
  return crypto.randomInt(0, 1_000_000).toString().padStart(6, "0");
}

function hashCode(code) {
  return crypto.createHash("sha256").update(`${code}:${getEnv().OTP_PEPPER}`).digest("hex");
}

function safeEqualHex(a, b) {
  const ab = Buffer.from(a, "hex");
  const bb = Buffer.from(b, "hex");
  return ab.length === bb.length && crypto.timingSafeEqual(ab, bb);
}

// Creates a challenge and returns { challenge, code }. The caller emails the code.
async function createChallenge({ purpose, email, user, payload }) {
  // One live challenge per email+purpose: starting again replaces the old one.
  await OtpChallenge.deleteMany({ email, purpose, consumedAt: { $exists: false } });
  const code = generateCode();
  const now = new Date();
  const challenge = await OtpChallenge.create({
    challengeId: crypto.randomUUID(),
    purpose,
    email,
    user,
    payload,
    codeHash: hashCode(code),
    lastSentAt: now,
    expiresAt: new Date(now.getTime() + OTP_TTL_MS),
  });
  return { challenge, code };
}

// Issues a fresh code for an existing challenge, respecting a cooldown and a send cap.
async function resendChallenge(challengeId) {
  const challenge = await OtpChallenge.findOne({ challengeId, consumedAt: { $exists: false } });
  if (!challenge || challenge.expiresAt < new Date()) throw AppError.badRequest("This code has expired. Please start again.");
  const wait = challenge.lastSentAt.getTime() + RESEND_COOLDOWN_MS - Date.now();
  if (wait > 0) throw new AppError(429, "OTP_COOLDOWN", `Please wait ${Math.ceil(wait / 1000)} seconds before requesting a new code.`);
  if (challenge.sendCount >= MAX_SENDS) throw new AppError(429, "OTP_SEND_LIMIT", "Too many codes requested. Please start again later.");
  const code = generateCode();
  challenge.codeHash = hashCode(code);
  challenge.attempts = 0;
  challenge.lastSentAt = new Date();
  challenge.sendCount += 1;
  challenge.expiresAt = new Date(Date.now() + OTP_TTL_MS);
  await challenge.save();
  return { challenge, code };
}

// Verifies a code. Wrong guesses are counted atomically; after MAX_ATTEMPTS the challenge is dead.
async function verifyChallenge({ challengeId, purpose, email, code }) {
  const filter = { purpose, consumedAt: { $exists: false }, expiresAt: { $gt: new Date() } };
  if (challengeId) filter.challengeId = challengeId;
  else filter.email = email;

  const challenge = await OtpChallenge.findOneAndUpdate(
    { ...filter, attempts: { $lt: MAX_ATTEMPTS } },
    { $inc: { attempts: 1 } },
    { new: true }
  ).select("+payload");

  const invalid = AppError.badRequest("The code is incorrect or has expired.");
  if (!challenge) throw invalid;

  if (!safeEqualHex(challenge.codeHash, hashCode(String(code)))) {
    if (challenge.attempts >= MAX_ATTEMPTS) {
      throw new AppError(429, "OTP_LOCKED", "Too many incorrect attempts. Please request a new code.");
    }
    throw invalid;
  }

  // Consume once — a second request with the same code loses this race.
  const consumed = await OtpChallenge.findOneAndUpdate(
    { _id: challenge._id, consumedAt: { $exists: false } },
    { $set: { consumedAt: new Date() } },
    { new: true }
  );
  if (!consumed) throw invalid;
  return challenge;
}

module.exports = { createChallenge, resendChallenge, verifyChallenge, hashCode, OTP_TTL_MS, MAX_ATTEMPTS, RESEND_COOLDOWN_MS };
