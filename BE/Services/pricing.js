const { Product } = require("../Models/Product");
const { MAX_LINES, MAX_QTY } = require("../Models/Cart");
const { checkCoupon } = require("./coupons");

const LOW_STOCK = 5;

// Combine duplicate SKUs and clamp quantities to 1–10; keeps first-seen order.
function normaliseItems(items) {
  const bySku = new Map();
  for (const { sku, qty } of items) {
    const key = String(sku).trim().toUpperCase();
    bySku.set(key, Math.min(MAX_QTY, (bySku.get(key) ?? 0) + Math.max(1, Math.floor(qty))));
  }
  return [...bySku].slice(0, MAX_LINES).map(([sku, qty]) => ({ sku, qty }));
}

// Prices a cart entirely from the database: the client only ever sends SKUs and quantities.
// Returns display lines, totals in paise, notices for anything that changed, and the coupon result.
async function priceCart({ items, couponCode, userId }) {
  const wanted = normaliseItems(items);
  const products = wanted.length ? await Product.find({ "variants.sku": { $in: wanted.map((i) => i.sku) }, status: "published" }) : [];
  const bySku = new Map();
  for (const p of products) for (const v of p.variants) bySku.set(v.sku, { product: p, variant: v });

  const lines = [];
  const issues = [];
  const kept = [];
  for (const { sku, qty } of wanted) {
    const hit = bySku.get(sku);
    if (!hit) {
      issues.push({ sku, type: "UNAVAILABLE", message: "A product in your cart is no longer available and was removed." });
      continue;
    }
    const { product, variant } = hit;
    let finalQty = qty;
    if (variant.stock === 0) {
      issues.push({ sku, type: "OUT_OF_STOCK", message: `${product.name} is out of stock.` });
    } else if (variant.stock < qty) {
      finalQty = variant.stock;
      issues.push({ sku, type: "QTY_ADJUSTED", message: `Only ${variant.stock} left of ${product.name} — quantity adjusted.` });
    }
    kept.push({ sku, qty: finalQty });
    lines.push({
      sku,
      productId: String(product._id),
      slug: product.slug,
      name: product.name,
      variantLabel: variant.label,
      image: product.images[0] ? { url: product.images[0].url, alt: product.images[0].alt || "" } : null,
      price: variant.price,
      mrp: variant.mrp ?? null,
      qty: finalQty,
      inStock: variant.stock > 0,
      lowStock: variant.stock > 0 && variant.stock <= LOW_STOCK ? variant.stock : null,
      lineTotal: variant.stock > 0 ? variant.price * finalQty : 0,
      weightGrams: variant.weightGrams ?? null,
    });
  }

  const subtotal = lines.reduce((s, l) => s + l.lineTotal, 0);
  const count = lines.filter((l) => l.inStock).reduce((n, l) => n + l.qty, 0);

  let coupon = null;
  let discount = 0;
  if (couponCode) {
    const result = await checkCoupon(couponCode, { subtotal, userId });
    discount = result.ok ? result.discount : 0;
    coupon = { code: result.code, applied: result.ok, discount, message: result.message, reason: result.ok ? null : result.reason };
  }

  // Shipping is free on all orders (site policy). Delivery/COD fees are added at checkout (M5).
  const shipping = 0;
  return {
    items: kept,
    lines,
    count,
    subtotal,
    discount,
    shipping,
    total: subtotal - discount + shipping,
    coupon,
    issues,
    canCheckout: count > 0 && lines.every((l) => l.inStock),
  };
}

module.exports = { priceCart, normaliseItems, LOW_STOCK };
