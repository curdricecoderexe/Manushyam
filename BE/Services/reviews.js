const mongoose = require("mongoose");
const { Review } = require("../Models/Review");
const { Product } = require("../Models/Product");
const { Order } = require("../Models/Order");

// "Priya Sharma" → "Priya S."; a single name stays as is.
function displayName(fullName) {
  const parts = String(fullName ?? "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!parts.length) return "Verified buyer";
  const first = parts[0].slice(0, 30);
  return parts.length > 1 ? `${first} ${parts[parts.length - 1][0].toUpperCase()}.` : first;
}

// Average (1 dp) and count over published reviews, written onto the product for listings and JSON-LD.
async function recomputeRating(productId) {
  const id = new mongoose.Types.ObjectId(String(productId));
  const [agg] = await Review.aggregate([{ $match: { product: id, status: "published" } }, { $group: { _id: null, avg: { $avg: "$rating" }, count: { $sum: 1 } } }]);
  const rating = { average: agg ? Math.round(agg.avg * 10) / 10 : 0, count: agg?.count ?? 0 };
  await Product.updateOne({ _id: id }, { $set: { rating } });
  return rating;
}

async function ratingSummary(productId) {
  const id = new mongoose.Types.ObjectId(String(productId));
  const rows = await Review.aggregate([{ $match: { product: id, status: "published" } }, { $group: { _id: "$rating", n: { $sum: 1 } } }]);
  const distribution = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
  let total = 0;
  let sum = 0;
  for (const r of rows) {
    distribution[r._id] = r.n;
    total += r.n;
    sum += r._id * r.n;
  }
  return { average: total ? Math.round((sum / total) * 10) / 10 : 0, count: total, distribution };
}

function productCard(p) {
  return p ? { slug: p.slug, name: p.name, image: p.images?.[0] ? { url: p.images[0].url, alt: p.images[0].alt || "" } : null } : null;
}

// The customer's reviews, plus delivered items they haven't reviewed yet (the "write a review" prompts).
async function reviewsForUser(userId) {
  const [reviews, delivered] = await Promise.all([
    Review.find({ user: userId }).sort({ createdAt: -1 }).limit(100).populate("product", "slug name images").populate("order", "orderNumber"),
    Order.find({ user: userId, status: "delivered" }).sort({ deliveredAt: -1 }).limit(50).select("orderNumber items deliveredAt"),
  ]);
  const done = new Set(reviews.map((r) => `${r.order?._id}:${r.product?._id}`));
  const pending = [];
  for (const o of delivered) {
    const seen = new Set();
    for (const item of o.items) {
      const key = `${o._id}:${item.product}`;
      if (done.has(key) || seen.has(key)) continue;
      seen.add(key);
      pending.push({ orderNumber: o.orderNumber, product: { slug: item.slug, name: item.name, image: item.image?.url ? { url: item.image.url, alt: item.image.alt || "" } : null }, deliveredAt: o.deliveredAt ?? null });
    }
  }
  return {
    reviews: reviews.map((r) => ({ ...r.toPublic(), status: r.status, orderNumber: r.order?.orderNumber ?? null, product: productCard(r.product) })),
    pending,
  };
}

module.exports = { displayName, recomputeRating, ratingSummary, reviewsForUser, productCard };
