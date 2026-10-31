const mongoose = require("mongoose");
const { Coupon, CouponRedemption } = require("../Models/Coupon");
const { AppError } = require("../Utils/AppError");

const PENDING_TTL_MS = 30 * 60 * 1000;

function normaliseCode(code) {
  return String(code ?? "")
    .trim()
    .toUpperCase();
}

// Pure rule check + discount maths (paise). `alreadyUsed` comes from the redemption lookup.
function evaluateCoupon(coupon, { subtotal, now = new Date(), alreadyUsed = false }) {
  const fail = (reason, message) => ({ ok: false, reason, message, discount: 0 });
  if (!coupon || !coupon.isActive) return fail("INVALID", "This code isn’t valid.");
  if (coupon.startsAt && coupon.startsAt > now) return fail("NOT_STARTED", "This code isn’t active yet.");
  if (coupon.endsAt && coupon.endsAt <= now) return fail("EXPIRED", "This code has expired.");
  if (coupon.usageLimit && coupon.usedCount >= coupon.usageLimit) return fail("USED_UP", "This code has been fully redeemed.");
  if (alreadyUsed) return fail("ALREADY_USED", "You’ve already used this code.");
  if (subtotal < (coupon.minOrder || 0)) {
    const short = coupon.minOrder - subtotal;
    return { ...fail("MIN_ORDER", `Add ₹${Math.ceil(short / 100).toLocaleString("en-IN")} more to use this code.`), minOrder: coupon.minOrder };
  }
  let discount = coupon.type === "percent" ? Math.floor((subtotal * coupon.value) / 100) : coupon.value;
  if (coupon.maxDiscount) discount = Math.min(discount, coupon.maxDiscount);
  discount = Math.min(discount, subtotal);
  return { ok: true, discount, message: describe(coupon) };
}

function describe(coupon) {
  const off = coupon.type === "percent" ? `${coupon.value}% off` : `₹${(coupon.value / 100).toLocaleString("en-IN")} off`;
  return `${coupon.code} applied — ${off}`;
}

async function hasActiveRedemption(couponId, userId, session) {
  if (!userId) return false;
  return Boolean(await CouponRedemption.exists({ coupon: couponId, user: userId, active: true }).session(session ?? null));
}

// Looks a code up and checks it against a cart subtotal without using it up.
async function checkCoupon(code, { subtotal, userId }) {
  const coupon = await Coupon.findOne({ code: normaliseCode(code) });
  const result = evaluateCoupon(coupon, { subtotal, alreadyUsed: coupon ? await hasActiveRedemption(coupon._id, userId) : false });
  return { coupon, ...result, code: normaliseCode(code) };
}

// Atomically claims one use of a coupon for a customer. Run inside the order transaction (M5):
// the usage counter only moves if it is still under the cap, and the partial unique index makes a
// second concurrent claim by the same customer fail. Returns the pending redemption.
async function reserveCoupon({ code, userId, subtotal, orderId, session, now = new Date() }) {
  const coupon = await Coupon.findOne({ code: normaliseCode(code) }).session(session ?? null);
  const check = evaluateCoupon(coupon, { subtotal, now, alreadyUsed: coupon ? await hasActiveRedemption(coupon._id, userId, session) : false });
  if (!check.ok) throw new AppError(409, `COUPON_${check.reason}`, check.message);

  const claimed = await Coupon.findOneAndUpdate(
    { _id: coupon._id, isActive: true, ...(coupon.usageLimit ? { usedCount: { $lt: coupon.usageLimit } } : {}) },
    { $inc: { usedCount: 1 } },
    { new: true, session }
  );
  if (!claimed) throw new AppError(409, "COUPON_USED_UP", "This code has been fully redeemed.");

  try {
    const [redemption] = await CouponRedemption.create(
      [{ coupon: coupon._id, user: userId, order: orderId, discount: check.discount, expiresAt: new Date(now.getTime() + PENDING_TTL_MS) }],
      { session }
    );
    return redemption;
  } catch (err) {
    // Inside a transaction the abort undoes the $inc; outside one, give the use back explicitly.
    if (!session) await Coupon.updateOne({ _id: coupon._id, usedCount: { $gt: 0 } }, { $inc: { usedCount: -1 } });
    if (err?.code === 11000) throw new AppError(409, "COUPON_ALREADY_USED", "You’ve already used this code.");
    throw err;
  }
}

// Order paid / COD confirmed: the use becomes permanent.
async function confirmRedemption(redemptionId, { session } = {}) {
  await CouponRedemption.updateOne({ _id: redemptionId, status: "pending" }, { $set: { status: "confirmed" }, $unset: { expiresAt: "" } }, { session });
}

// Order failed/cancelled/abandoned: give the use back. Safe to call twice (only one call wins).
async function releaseRedemption(redemptionId, { session } = {}) {
  const run = async (s) => {
    const released = await CouponRedemption.findOneAndUpdate(
      { _id: redemptionId, status: { $in: ["pending", "confirmed"] } },
      { $set: { status: "released" }, $unset: { active: "", expiresAt: "" } },
      { session: s }
    );
    if (released) await Coupon.updateOne({ _id: released.coupon, usedCount: { $gt: 0 } }, { $inc: { usedCount: -1 } }, { session: s });
    return Boolean(released);
  };
  if (session) return run(session);
  const s = await mongoose.startSession();
  try {
    let result;
    await s.withTransaction(async () => {
      result = await run(s);
    });
    return result;
  } finally {
    await s.endSession();
  }
}

// Cron (M5 cleanup job): release pending redemptions whose checkout never completed.
async function releaseExpiredRedemptions(now = new Date()) {
  const stale = await CouponRedemption.find({ status: "pending", expiresAt: { $lte: now } }).select("_id").limit(500);
  let count = 0;
  for (const r of stale) if (await releaseRedemption(r._id)) count += 1;
  return count;
}

module.exports = { evaluateCoupon, checkCoupon, reserveCoupon, confirmRedemption, releaseRedemption, releaseExpiredRedemptions, normaliseCode, PENDING_TTL_MS };
