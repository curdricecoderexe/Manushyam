// API-shaped catalogue data for page tests (mirrors BE/Data/catalogSeed.js).
const card = (slug, name, tagline, summary, price, audience, type, badges = []) => ({
  id: `p-${slug}`,
  slug,
  name,
  tagline,
  summary,
  audience,
  type,
  badges,
  image: { url: `/images/products/${slug}.jpg`, alt: name },
  price,
  mrp: null,
  inStock: true,
  defaultSku: slug.toUpperCase(),
  rating: { average: 0, count: 0 },
});

export const cards = [
  card("men-anti-hairfall-therapy", "Men Anti-Hairfall Therapy", "Natural DHT blocker", "Shampoo + Men Hair Oil · 100 ml each", 49900, "men", "therapy", ["Bestseller"]),
  card("women-anti-hairfall-therapy", "Women Anti-Hairfall Therapy", "Scalp nourishment", "Women Hair Oil · 100 ml", 59900, "women", "therapy"),
  card("men-anti-hairfall-combo", "Men Anti-Hairfall Combo", "Complete men’s routine", "Shampoo + Oil + Jute pouch", 79900, "men", "combo", ["Combo"]),
  card("women-anti-hairfall-combo", "Women Anti-Hairfall Combo", "Complete women’s routine", "Therapy kit + Oils + Jute pouch", 89900, "women", "combo", ["Combo"]),
];

export const settings = {
  announcements: [],
  heroSubline: "Fix falling hairs after 3rd application",
  rating: { value: 4.8, source: "on Amazon & Flipkart" },
  trustedBy: "Trusted by 10,000+ customers across India",
};

export const slides = [
  { id: "s1", eyebrow: "Fix falling hairs after 3rd application", title: "Rooted in\nRitual.", subtitle: "Ayurvedic anti-hair-fall therapy.", image: { url: "/images/content/hero-woman-hair.jpg", alt: "Woman with glossy hair" }, cta: { label: "Shop Therapy", href: "/solutions" }, secondaryCta: { label: "Our Philosophy", href: "/about" } },
  { id: "s2", title: "Stronger Roots.\nHappier You.", subtitle: "For fuller-looking hair.", image: { url: "/images/content/hero-woman-scalp.jpg", alt: "Scalp massage" }, cta: { label: "Shop Women", href: "/solutions?for=women" } },
];

export const productDetail = {
  ...cards[0],
  description: ["Includes Anti-Hairfall Shampoo (100 ml) and Men Hair Oil (100 ml).", "Helps reduce hair fall."],
  concerns: ["hair-fall", "dht"],
  images: [
    { url: "/images/products/pdp-men-therapy.jpg", alt: "Shampoo and oil" },
    { url: "/images/products/bestseller-pack.jpg", alt: "Therapy kit box" },
  ],
  variants: [{ sku: "MEN-ANTI-HAIRFALL-THERAPY", label: "Shampoo + Oil", price: 49900, mrp: null, inStock: true, isDefault: true }],
  benefits: ["Strengthens hair roots", "Reduces hair fall & breakage"],
  ingredients: { extracts: ["Korean Ginseng"], oils: ["Jojoba"], support: ["Biotin"] },
  howToUse: ["Apply to the scalp.", "Leave on for 30–60 minutes.", "Rinse."],
  freeFrom: ["paraben", "sulfate"],
  faqs: [{ q: "When will I see results?", a: "After the 3rd application." }],
  seo: { title: "Men Anti-Hairfall Therapy", description: "Natural DHT blocker" },
};

export const faqs = [
  { id: "f1", topic: "product", question: "When will I see results?", answer: "Most customers notice reduced hair fall after the 3rd application." },
  { id: "f2", topic: "product", question: "Is it suitable for all hair types?", answer: "Yes, for all hair types." },
  { id: "f3", topic: "payments", question: "Is Cash on Delivery available?", answer: "Yes, on serviceable PIN codes." },
  { id: "f4", topic: "returns", question: "How long do refunds take?", answer: "5–7 working days." },
];

export const policyIndex = [
  { slug: "shipping", title: "Shipping & Delivery", kind: "policy" },
  { slug: "privacy", title: "Privacy Policy", kind: "policy" },
];

export const privacyPage = {
  slug: "privacy",
  title: "Privacy Policy",
  summary: "",
  updatedAt: "2026-09-30T10:00:00.000Z",
  sections: [
    { heading: "What we collect", body: "Name and contact details." },
    { heading: "Cookies", body: "Essential cookies keep you signed in.\n\nAnalytics cookies are optional." },
  ],
};

// Prices a cart the way the server does (BE/Services/pricing.js), from the fixture catalogue.
export function priceItems(items, { couponCode, coupons = { RITUAL10: { type: "percent", value: 10 } }, stock = {} } = {}) {
  const lines = [];
  const issues = [];
  for (const { sku, qty } of items) {
    const p = cards.find((c) => c.defaultSku === sku);
    if (!p) {
      issues.push({ sku, type: "UNAVAILABLE", message: "A product in your cart is no longer available and was removed." });
      continue;
    }
    const left = stock[sku] ?? 100;
    const q = left === 0 ? qty : Math.min(qty, left);
    if (left === 0) issues.push({ sku, type: "OUT_OF_STOCK", message: `${p.name} is out of stock.` });
    else if (left < qty) issues.push({ sku, type: "QTY_ADJUSTED", message: `Only ${left} left of ${p.name} — quantity adjusted.` });
    lines.push({ sku, productId: p.id, slug: p.slug, name: p.name, variantLabel: p.summary, image: p.image, price: p.price, mrp: null, qty: q, inStock: left > 0, lowStock: left > 0 && left <= 5 ? left : null, lineTotal: left > 0 ? p.price * q : 0 });
  }
  const subtotal = lines.reduce((s, l) => s + l.lineTotal, 0);
  const rule = couponCode ? coupons[couponCode] : null;
  const discount = rule ? (rule.type === "percent" ? Math.floor((subtotal * rule.value) / 100) : Math.min(rule.value, subtotal)) : 0;
  const coupon = couponCode ? (rule ? { code: couponCode, applied: true, discount, message: `${couponCode} applied — ${rule.value}% off`, reason: null } : { code: couponCode, applied: false, discount: 0, message: "This code isn’t valid.", reason: "INVALID" }) : null;
  const count = lines.filter((l) => l.inStock).reduce((n, l) => n + l.qty, 0);
  return { items: lines.map((l) => ({ sku: l.sku, qty: l.qty })), lines, count, subtotal, discount, shipping: 0, total: subtotal - discount, coupon, issues, canCheckout: count > 0 && lines.every((l) => l.inStock) };
}

// Handlers for the public catalogue endpoints; spread into installFakeApi().
export function catalogApi(overrides = {}) {
  return {
    "POST /api/cart/validate": (body) => [200, { cart: priceItems(body.items, { couponCode: body.couponCode }) }],
    "GET /api/products": (_b, req) => {
      let list = cards;
      if (req.query.for) list = list.filter((p) => p.audience === req.query.for);
      if (req.query.type) list = list.filter((p) => req.query.type.split(",").includes(p.type));
      if (req.query.slugs) list = list.filter((p) => req.query.slugs.split(",").includes(p.slug));
      return [200, { products: list, total: list.length, page: 1, pages: 1, match: req.query.q ? "text" : "browse" }];
    },
    "GET /api/products/suggest": (_b, req) => [200, { suggestions: cards.filter((p) => p.name.toLowerCase().includes(req.query.q.toLowerCase())) }],
    "GET /api/products/men-anti-hairfall-therapy": () => [200, { product: productDetail, related: cards.slice(1) }],
    "GET /api/content/home": () => [200, { slides, settings }],
    "GET /api/settings": () => [200, { settings }],
    "GET /api/faqs": () => [200, { faqs }],
    "GET /api/pages": () => [200, { pages: policyIndex }],
    "GET /api/pages/privacy": () => [200, { page: privacyPage }],
    "GET /api/products/men-anti-hairfall-therapy/reviews": () => [200, { summary: { average: 0, count: 0, distribution: { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 } }, reviews: [], page: 1, pages: 1 }],
    "GET /api/reviews/highlights": () => [200, { reviews: [] }],
    ...overrides,
  };
}
