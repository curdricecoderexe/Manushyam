const mongoose = require("mongoose");

const PURPOSES = ["register", "login", "reset", "cod"];

// A pending one-time-code challenge. The code itself is never stored, only sha256(code + pepper).
const otpChallengeSchema = new mongoose.Schema(
  {
    challengeId: { type: String, required: true, unique: true },
    purpose: { type: String, enum: PURPOSES, required: true },
    email: { type: String, required: true, lowercase: true, index: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    codeHash: { type: String, required: true },
    attempts: { type: Number, default: 0 },
    // Purpose-specific data, e.g. the pending registration's name and password hash.
    payload: { type: mongoose.Schema.Types.Mixed, select: false },
    lastSentAt: { type: Date, required: true },
    sendCount: { type: Number, default: 1 },
    consumedAt: { type: Date },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true }
);

// Keep the document for an hour past expiry so attempt counts survive quick retries, then purge.
otpChallengeSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 3600 });

const OtpChallenge = mongoose.models.OtpChallenge || mongoose.model("OtpChallenge", otpChallengeSchema);

module.exports = { OtpChallenge, PURPOSES };
