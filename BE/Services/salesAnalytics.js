const { Order } = require("../Models/Order");
const { AppError } = require("../Utils/AppError");

const TZ = "Asia/Kolkata";
const DAY_MS = 86400000;
const MAX_DAYS = 366;
// Longer ranges are grouped by month so the trend stays readable.
const DAILY_UP_TO = 92;
const CLOSED = ["cancelled", "refunded"];

// "YYYY-MM-DD" for a date in India time.
function istDay(date) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}
const istStart = (day) => new Date(`${day}T00:00:00+05:30`);
const addDays = (day, n) => new Date(Date.parse(`${day}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);
const daysBetween = (from, to) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS) + 1;

// Resolves ?from&to (IST days, inclusive) — default the last 30 days — plus the previous period of equal length.
function resolveRange({ from, to } = {}) {
  const end = to ?? istDay(new Date());
  const start = from ?? addDays(end, -29);
  const days = daysBetween(start, end);
  if (days < 1) throw AppError.badRequest("Start must be on or before the end", [{ path: "from", message: "After the end" }]);
  if (days > MAX_DAYS) throw AppError.badRequest(`Choose a range of at most ${MAX_DAYS} days`, [{ path: "from", message: "Range too long" }]);
  const prevEnd = addDays(start, -1);
  const prevStart = addDays(prevEnd, -(days - 1));
  return {
    from: start,
    to: end,
    days,
    granularity: days <= DAILY_UP_TO ? "day" : "month",
    since: istStart(start),
    until: istStart(addDays(end, 1)),
    previous: { from: prevStart, to: prevEnd, since: istStart(prevStart), until: istStart(start) },
  };
}

// Confirmed = given a GST invoice number (paid, or COD confirmed by the customer).
const confirmedIn = (since, until) => ({ invoiceNumber: { $exists: true }, createdAt: { $gte: since, $lt: until } });
const isKept = { $not: [{ $in: ["$status", CLOSED] }] };
// Partial refunds keep the order's status, so they are subtracted from revenue separately.
const keptNet = { $cond: [isKept, { $subtract: ["$amounts.total", { $cond: [{ $eq: ["$refund.status", "processed"] }, { $ifNull: ["$refund.amount", 0] }, 0] }] }, 0] };

async function totals(since, until) {
  const [t] = await Order.aggregate([
    { $match: confirmedIn(since, until) },
    {
      $group: {
        _id: null,
        orders: { $sum: 1 },
        kept: { $sum: { $cond: [isKept, 1, 0] } },
        cancelled: { $sum: { $cond: [{ $eq: ["$status", "cancelled"] }, 1, 0] } },
        revenue: { $sum: keptNet },
        units: { $sum: { $cond: [isKept, { $sum: "$items.qty" }, 0] } },
        refunds: { $sum: { $cond: [{ $eq: ["$refund.status", "processed"] }, { $ifNull: ["$refund.amount", 0] }, 0] } },
        customers: { $addToSet: "$user" },
      },
    },
  ]);
  const r = t ?? { orders: 0, kept: 0, cancelled: 0, revenue: 0, units: 0, refunds: 0, customers: [] };
  return { orders: r.orders, cancelled: r.cancelled, revenue: r.revenue, units: r.units, refunds: r.refunds, customers: r.customers.length, aov: r.kept ? Math.round(r.revenue / r.kept) : 0 };
}

async function trend(range) {
  const format = range.granularity === "day" ? "%Y-%m-%d" : "%Y-%m";
  const rows = await Order.aggregate([
    { $match: confirmedIn(range.since, range.until) },
    { $group: { _id: { $dateToString: { format, date: "$createdAt", timezone: TZ } }, orders: { $sum: 1 }, revenue: { $sum: keptNet } } },
  ]);
  const byKey = new Map(rows.map((r) => [r._id, r]));
  const keys = [];
  if (range.granularity === "day") for (let d = range.from; d <= range.to; d = addDays(d, 1)) keys.push(d);
  else {
    for (let m = range.from.slice(0, 7); m <= range.to.slice(0, 7); ) {
      keys.push(m);
      const [y, mo] = m.split("-").map(Number);
      m = mo === 12 ? `${y + 1}-01` : `${y}-${String(mo + 1).padStart(2, "0")}`;
    }
  }
  return keys.map((key) => ({ key, orders: byKey.get(key)?.orders ?? 0, revenue: byKey.get(key)?.revenue ?? 0 }));
}

async function topProducts(range, limit = 10) {
  const rows = await Order.aggregate([
    { $match: { ...confirmedIn(range.since, range.until), status: { $nin: CLOSED } } },
    { $unwind: "$items" },
    { $group: { _id: "$items.sku", name: { $first: "$items.name" }, variant: { $first: "$items.variantLabel" }, slug: { $first: "$items.slug" }, qty: { $sum: "$items.qty" }, revenue: { $sum: "$items.lineTotal" }, orders: { $sum: 1 } } },
    { $sort: { revenue: -1, qty: -1 } },
    { $limit: limit },
  ]);
  return rows.map((r) => ({ sku: r._id, name: r.name, variant: r.variant ?? null, slug: r.slug ?? null, qty: r.qty, revenue: r.revenue, orders: r.orders }));
}

// New = the customer's first confirmed order ever falls inside the range; returning = they had one before.
async function customerMix(range) {
  const inRange = await Order.aggregate([
    { $match: { ...confirmedIn(range.since, range.until), status: { $nin: CLOSED } } },
    { $group: { _id: "$user", orders: { $sum: 1 }, revenue: { $sum: keptNet } } },
  ]);
  const firsts = await Order.aggregate([
    { $match: { user: { $in: inRange.map((r) => r._id) }, invoiceNumber: { $exists: true } } },
    { $group: { _id: "$user", first: { $min: "$createdAt" } } },
  ]);
  const firstAt = new Map(firsts.map((f) => [String(f._id), f.first]));
  const mix = { new: { customers: 0, orders: 0, revenue: 0 }, returning: { customers: 0, orders: 0, revenue: 0 } };
  for (const r of inRange) {
    const bucket = firstAt.get(String(r._id)) >= range.since ? mix.new : mix.returning;
    bucket.customers += 1;
    bucket.orders += r.orders;
    bucket.revenue += r.revenue;
  }
  return mix;
}

async function paymentMix(range) {
  const rows = await Order.aggregate([
    { $match: confirmedIn(range.since, range.until) },
    { $group: { _id: "$paymentMethod", orders: { $sum: 1 }, kept: { $sum: { $cond: [isKept, 1, 0] } }, revenue: { $sum: keptNet } } },
  ]);
  return ["razorpay", "cod"].map((method) => {
    const r = rows.find((x) => x._id === method);
    return { method, orders: r?.orders ?? 0, revenue: r?.revenue ?? 0, aov: r?.kept ? Math.round(r.revenue / r.kept) : 0 };
  });
}

// RTO rate = returned to origin ÷ (delivered + returned), over orders placed in the range that reached either outcome.
async function rtoRate(range) {
  const [r] = await Order.aggregate([
    { $match: confirmedIn(range.since, range.until) },
    {
      $group: {
        _id: null,
        delivered: { $sum: { $cond: [{ $in: ["delivered", { $ifNull: ["$history.status", []] }] }, 1, 0] } },
        rto: { $sum: { $cond: [{ $or: [{ $eq: ["$status", "rto"] }, { $in: ["rto", { $ifNull: ["$history.status", []] }] }] }, 1, 0] } },
        codRto: { $sum: { $cond: [{ $and: [{ $eq: ["$paymentMethod", "cod"] }, { $or: [{ $eq: ["$status", "rto"] }, { $in: ["rto", { $ifNull: ["$history.status", []] }] }] }] }, 1, 0] } },
      },
    },
  ]);
  const delivered = r?.delivered ?? 0;
  const rto = r?.rto ?? 0;
  return { delivered, rto, codRto: r?.codRto ?? 0, rate: delivered + rto ? rto / (delivered + rto) : 0 };
}

async function salesReport(query) {
  const range = resolveRange(query);
  const [current, previous, series, products, customers, payments, rto] = await Promise.all([
    totals(range.since, range.until),
    totals(range.previous.since, range.previous.until),
    trend(range),
    topProducts(range),
    customerMix(range),
    paymentMix(range),
    rtoRate(range),
  ]);
  return {
    range: { from: range.from, to: range.to, days: range.days, granularity: range.granularity, previous: { from: range.previous.from, to: range.previous.to } },
    kpis: current,
    previous: { revenue: previous.revenue, orders: previous.orders, aov: previous.aov, customers: previous.customers },
    trend: series,
    topProducts: products,
    customers,
    payments,
    rto,
  };
}

module.exports = { salesReport, resolveRange, istDay, addDays };
