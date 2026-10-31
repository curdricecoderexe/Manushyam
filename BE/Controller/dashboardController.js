const { Order } = require("../Models/Order");
const { Product } = require("../Models/Product");
const { Chat } = require("../Models/Chat");

const TZ = "Asia/Kolkata";
const DAYS = 7;
// Variant stock levels (per SKU): out = 0, critical 1–5, low 6–20, healthy above that.
const CRITICAL = 5;
const LOW = 20;

function levelOf(stock) {
  if (stock <= 0) return "out";
  if (stock <= CRITICAL) return "critical";
  if (stock <= LOW) return "low";
  return "healthy";
}

// "YYYY-MM-DD" for a date in India time.
function istDay(date) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

// Staff dashboard: fulfilment workload, 7-day order volume, stock health and the support queue.
// Money figures are added for admins only (staff don't see sales analytics).
async function dashboard(req, res) {
  const isAdmin = req.user.role === "admin";
  const now = new Date();
  const days = Array.from({ length: DAYS }, (_, i) => istDay(new Date(now.getTime() - (DAYS - 1 - i) * 86400000)));
  const since = new Date(`${days[0]}T00:00:00+05:30`);
  // Confirmed orders are the ones that received a GST invoice number (paid or COD-confirmed).
  const confirmed = { invoiceNumber: { $exists: true }, createdAt: { $gte: since } };

  const [statusCounts, byDay, products, attention, chats] = await Promise.all([
    Order.aggregate([{ $match: { status: { $in: ["paid", "cod_confirmed", "processing", "packed", "shipped", "out_for_delivery"] } } }, { $group: { _id: "$status", n: { $sum: 1 } } }]),
    Order.aggregate([
      { $match: confirmed },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt", timezone: TZ } },
          orders: { $sum: 1 },
          revenue: { $sum: { $cond: [{ $in: ["$status", ["cancelled", "refunded"]] }, 0, "$amounts.total"] } },
        },
      },
    ]),
    Product.find({ status: { $ne: "archived" } }).select("name slug status variants.sku variants.label variants.stock"),
    Order.countDocuments({ $or: [{ "shipment.error": { $exists: true, $nin: [null, ""] }, status: "packed" }, ...(isAdmin ? [{ "refund.status": { $in: ["requested", "failed"] } }] : [])] }),
    Chat.aggregate([{ $match: { status: { $in: ["pending", "active"] } } }, { $group: { _id: { status: "$status", mine: { $eq: ["$assignedTo", { $toObjectId: req.user.id }] } }, n: { $sum: 1 } } }]),
  ]);

  const count = Object.fromEntries(statusCounts.map((s) => [s._id, s.n]));
  const dayMap = new Map(byDay.map((d) => [d._id, d]));
  const series = days.map((date) => ({ date, orders: dayMap.get(date)?.orders ?? 0, ...(isAdmin ? { revenue: dayMap.get(date)?.revenue ?? 0 } : {}) }));

  const stock = { healthy: 0, low: 0, critical: 0, out: 0 };
  const watch = [];
  for (const p of products) {
    for (const v of p.variants) {
      const level = levelOf(v.stock);
      stock[level] += 1;
      if (level !== "healthy") watch.push({ productId: String(p._id), name: p.name, slug: p.slug, sku: v.sku, label: v.label, stock: v.stock, level, status: p.status });
    }
  }
  watch.sort((a, b) => a.stock - b.stock);

  const support = { pending: 0, active: 0, mine: 0 };
  for (const c of chats) {
    support[c._id.status] += c.n;
    if (c._id.mine) support.mine += c.n;
  }

  const today = series[series.length - 1];
  res.set("Cache-Control", "no-store");
  res.json({
    fulfilment: {
      toProcess: (count.paid ?? 0) + (count.cod_confirmed ?? 0),
      processing: count.processing ?? 0,
      packed: count.packed ?? 0,
      inTransit: (count.shipped ?? 0) + (count.out_for_delivery ?? 0),
      needsAttention: attention,
    },
    today: { orders: today.orders, ...(isAdmin ? { revenue: today.revenue } : {}) },
    ordersByDay: series,
    stock: { ...stock, thresholds: { critical: CRITICAL, low: LOW }, watch: watch.slice(0, 12) },
    support,
  });
}

module.exports = { dashboard, levelOf, istDay };
