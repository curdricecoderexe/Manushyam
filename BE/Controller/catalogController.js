const { Product } = require("../Models/Product");
const { HeroSlide, Faq, Page, getSettings, toPublic } = require("../Models/Content");
const { searchProducts, suggestProducts } = require("../Services/search");
const { AppError } = require("../Utils/AppError");

// Public reads are the same for everyone, so browsers/CDNs may cache them briefly.
function cachePublic(res, seconds = 60) {
  res.set("Cache-Control", `public, max-age=${seconds}, stale-while-revalidate=${seconds * 5}`);
}

// --- Products ----------------------------------------------------------------------------------

async function listProducts(req, res) {
  const q = req.validatedQuery;
  if (q.minPrice !== undefined && q.maxPrice !== undefined && q.minPrice > q.maxPrice) {
    throw AppError.badRequest("Minimum price can’t be more than the maximum", [{ path: "minPrice", message: "Must be ≤ max price" }]);
  }
  const { products, total, mode } = await searchProducts(q);
  cachePublic(res);
  res.json({
    products: products.map((p) => p.toCard()),
    total,
    page: q.page,
    pages: Math.max(1, Math.ceil(total / q.limit)),
    // "fuzzy" tells the UI to say "Showing results for similar products".
    match: mode,
  });
}

async function suggest(req, res) {
  const docs = await suggestProducts(req.validatedQuery.q);
  cachePublic(res, 30);
  res.json({ suggestions: docs.map((p) => p.toCard()) });
}

async function getProduct(req, res) {
  const product = await Product.findOne({ slug: req.params.slug, status: "published" });
  if (!product) throw AppError.notFound("Product not found");

  // Hand-picked related products first, then fill from the same audience so there are always three.
  const picked = product.related.length ? await Product.find({ _id: { $in: product.related }, status: "published" }) : [];
  const order = new Map(product.related.map((id, i) => [String(id), i]));
  picked.sort((a, b) => order.get(String(a._id)) - order.get(String(b._id)));
  let related = picked;
  if (related.length < 3) {
    const exclude = [product._id, ...related.map((r) => r._id)];
    const fill = await Product.find({ status: "published", _id: { $nin: exclude } })
      .sort({ audience: product.audience === "women" ? -1 : 1, sortOrder: 1 })
      .limit(3 - related.length);
    related = [...related, ...fill];
  }

  cachePublic(res);
  res.json({ product: product.toPublic(), related: related.map((r) => r.toCard()) });
}

// --- CMS content -------------------------------------------------------------------------------

async function home(req, res) {
  const now = new Date();
  const [slides, settings] = await Promise.all([
    HeroSlide.find({
      isActive: true,
      $and: [{ $or: [{ startsAt: null }, { startsAt: { $lte: now } }] }, { $or: [{ endsAt: null }, { endsAt: { $gt: now } }] }],
    })
      .sort({ sortOrder: 1, _id: 1 })
      .limit(6),
    getSettings(),
  ]);
  cachePublic(res);
  res.json({ slides: slides.map(toPublic), settings });
}

async function settings(req, res) {
  cachePublic(res);
  res.json({ settings: await getSettings() });
}

async function listFaqs(req, res) {
  const faqs = await Faq.find({ isPublished: true }).sort({ topic: 1, sortOrder: 1, _id: 1 });
  cachePublic(res);
  res.json({ faqs: faqs.map((f) => ({ id: String(f._id), question: f.question, answer: f.answer, topic: f.topic })) });
}

async function listPages(req, res) {
  const pages = await Page.find({ isPublished: true }).sort({ sortOrder: 1, title: 1 }).select("slug title kind");
  cachePublic(res);
  res.json({ pages: pages.map((p) => ({ slug: p.slug, title: p.title, kind: p.kind })) });
}

async function getPage(req, res) {
  const page = await Page.findOne({ slug: req.params.slug, isPublished: true });
  if (!page) throw AppError.notFound("Page not found");
  cachePublic(res);
  res.json({ page: { slug: page.slug, title: page.title, summary: page.summary ?? "", sections: page.sections, updatedAt: page.updatedAt } });
}

module.exports = { listProducts, suggest, getProduct, home, settings, listFaqs, listPages, getPage };
