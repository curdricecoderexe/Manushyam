const { Product } = require("../Models/Product");

const SORTS = {
  recommended: { sortOrder: 1, popularity: -1, _id: 1 },
  price_asc: { priceFrom: 1, _id: 1 },
  price_desc: { priceFrom: -1, _id: 1 },
  newest: { createdAt: -1, _id: 1 },
  popular: { popularity: -1, _id: 1 },
  rating: { "rating.average": -1, "rating.count": -1, _id: 1 },
};

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function tokenize(s) {
  return String(s)
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/[\s-]+/)
    .filter((t) => t.length >= 2);
}

// Optimal-string-alignment distance (Levenshtein + adjacent swaps), capped for speed.
function editDistance(a, b, max = 2) {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const rows = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j += 1) rows[0][j] = j;
  for (let i = 1; i <= a.length; i += 1) {
    let rowMin = Infinity;
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let v = Math.min(rows[i - 1][j] + 1, rows[i][j - 1] + 1, rows[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, rows[i - 2][j - 2] + 1);
      rows[i][j] = v;
      rowMin = Math.min(rowMin, v);
    }
    if (rowMin > max) return max + 1;
  }
  return rows[a.length][b.length];
}

// How well a query token matches a vocabulary token: prefix beats typo, typo tolerance grows with length.
function tokenScore(q, word) {
  if (word === q) return 3;
  if (word.startsWith(q) && q.length >= 3) return 2;
  const allowed = q.length <= 4 ? 1 : 2;
  return editDistance(q, word, allowed) <= allowed ? 1 : 0;
}

function vocabularyOf(p) {
  return new Set(tokenize([p.name, p.tagline, ...(p.keywords || []), ...(p.concerns || []), ...(p.ingredients?.extracts || []), ...(p.ingredients?.oils || [])].join(" ")));
}

const VOCAB_FIELDS = "name tagline keywords concerns ingredients";

// Sum of each query word's best match; 0 unless every word matches something,
// otherwise "women combo" would also return the men's combo.
function matchScore(qTokens, product) {
  const vocab = [...vocabularyOf(product)];
  let score = 0;
  for (const q of qTokens) {
    const best = Math.max(0, ...vocab.map((w) => tokenScore(q, w)));
    if (best === 0) return 0;
    score += best;
  }
  return score;
}

// Fuzzy fallback for typos ("ginsng", "womn combo"). The catalogue is small, so scoring in memory
// is cheaper and safer than building regexes from user input.
async function fuzzyMatchIds(query, baseFilter) {
  const qTokens = tokenize(query);
  if (!qTokens.length) return [];
  const candidates = await Product.find(baseFilter).select(VOCAB_FIELDS).lean();
  return candidates
    .map((p) => ({ id: p._id, score: matchScore(qTokens, p) }))
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((r) => r.id);
}

// Text-index matches in relevance order, keeping only those that match every query word.
async function textMatchIds(query, baseFilter) {
  const qTokens = tokenize(query);
  const docs = await Product.find({ ...baseFilter, $text: { $search: query } }, { score: { $meta: "textScore" } })
    .select(VOCAB_FIELDS)
    .sort({ score: { $meta: "textScore" } })
    .limit(500)
    .lean();
  return qTokens.length ? docs.filter((p) => matchScore(qTokens, p) > 0).map((p) => p._id) : docs.map((p) => p._id);
}

function buildFilter(q) {
  const filter = { status: "published" };
  if (q.for) filter.audience = q.for === "unisex" ? "unisex" : { $in: [q.for, "unisex"] };
  if (q.type?.length) filter.type = { $in: q.type };
  if (q.concern?.length) filter.concerns = { $in: q.concern };
  if (q.slugs?.length) filter.slug = { $in: q.slugs };
  if (q.minPrice !== undefined || q.maxPrice !== undefined) {
    filter.priceFrom = {};
    if (q.minPrice !== undefined) filter.priceFrom.$gte = q.minPrice;
    if (q.maxPrice !== undefined) filter.priceFrom.$lte = q.maxPrice;
  }
  if (q.inStock) filter.inStock = true;
  return filter;
}

// Listing + search. `q` is the validated query (see Validators/catalog.js).
async function searchProducts(q) {
  const filter = buildFilter(q);
  const skip = (q.page - 1) * q.limit;
  let mode = "browse";

  if (q.q) {
    mode = "text";
    let ids = await textMatchIds(q.q, filter);
    if (!ids.length) {
      mode = "fuzzy";
      ids = await fuzzyMatchIds(q.q, filter);
    }
    if (!ids.length) return { products: [], total: 0, mode };
    if (q.sort === "recommended") {
      // Relevance order: page through the ranked ids, then load just that page.
      const pageIds = ids.slice(skip, skip + q.limit);
      const docs = await Product.find({ _id: { $in: pageIds } });
      const rank = new Map(pageIds.map((id, i) => [String(id), i]));
      docs.sort((a, b) => rank.get(String(a._id)) - rank.get(String(b._id)));
      return { products: docs, total: ids.length, mode };
    }
    filter._id = { $in: ids };
  }

  const sort = SORTS[q.sort] || SORTS.recommended;
  const [docs, total] = await Promise.all([Product.find(filter).sort(sort).skip(skip).limit(q.limit), Product.countDocuments(filter)]);
  return { products: docs, total, mode };
}

// Header autocomplete: word-prefix match on names first, then the fuzzy matcher.
async function suggestProducts(term, limit = 6) {
  const base = { status: "published" };
  const prefix = new RegExp(`(^|\\s)${escapeRegex(term.trim())}`, "i");
  let docs = await Product.find({ ...base, $or: [{ name: prefix }, { keywords: prefix }] })
    .sort(SORTS.recommended)
    .limit(limit);
  if (!docs.length) {
    const ids = await fuzzyMatchIds(term, base);
    if (ids.length) {
      const found = await Product.find({ _id: { $in: ids.slice(0, limit) } });
      const rank = new Map(ids.map((id, i) => [String(id), i]));
      docs = found.sort((a, b) => rank.get(String(a._id)) - rank.get(String(b._id)));
    }
  }
  return docs;
}

module.exports = { searchProducts, suggestProducts, buildFilter, tokenize, editDistance, tokenScore, escapeRegex, SORTS };
