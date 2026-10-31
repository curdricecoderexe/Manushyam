const { Product } = require("../Models/Product");
const { BlogPost, liveFilter } = require("../Models/Blog");
const { Page } = require("../Models/Content");
const { getEnv } = require("../Config/runtime");

// Public storefront pages (no account, cart, checkout or search pages: they are noindex).
const STATIC_ROUTES = [
  { path: "/", priority: "1.0", changefreq: "daily" },
  { path: "/solutions", priority: "0.9", changefreq: "daily" },
  { path: "/about", priority: "0.6", changefreq: "monthly" },
  { path: "/ingredients", priority: "0.6", changefreq: "monthly" },
  { path: "/blog", priority: "0.7", changefreq: "weekly" },
  { path: "/faq", priority: "0.5", changefreq: "monthly" },
  { path: "/contact", priority: "0.4", changefreq: "yearly" },
  { path: "/track-order", priority: "0.3", changefreq: "yearly" },
];

// Rebuilt at most once an hour per instance; the catalogue changes far less often than crawlers ask.
const CACHE_MS = 60 * 60 * 1000;
let cache = { xml: null, at: 0 };

const escapeXml = (s) => String(s).replace(/[<>&'"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" })[c]);
const day = (d) => (d ? new Date(d).toISOString().slice(0, 10) : undefined);

function urlEntry(base, { path, lastmod, changefreq, priority }) {
  return [
    "  <url>",
    `    <loc>${escapeXml(base + path)}</loc>`,
    lastmod ? `    <lastmod>${lastmod}</lastmod>` : null,
    changefreq ? `    <changefreq>${changefreq}</changefreq>` : null,
    priority ? `    <priority>${priority}</priority>` : null,
    "  </url>",
  ]
    .filter(Boolean)
    .join("\n");
}

async function buildSitemap() {
  const base = getEnv().APP_URL.replace(/\/$/, "");
  const [products, posts, pages] = await Promise.all([
    Product.find({ status: "published" }).select("slug updatedAt").sort({ slug: 1 }).lean(),
    BlogPost.find(liveFilter()).select("slug updatedAt").sort({ publishAt: -1 }).lean(),
    Page.find({ isPublished: true }).select("slug kind updatedAt").sort({ sortOrder: 1 }).lean(),
  ]);
  const entries = [
    ...STATIC_ROUTES,
    ...products.map((p) => ({ path: `/solutions/${p.slug}`, lastmod: day(p.updatedAt), changefreq: "weekly", priority: "0.8" })),
    ...posts.map((p) => ({ path: `/blog/${p.slug}`, lastmod: day(p.updatedAt), changefreq: "monthly", priority: "0.6" })),
    ...pages.filter((p) => p.kind === "policy").map((p) => ({ path: `/policies/${p.slug}`, lastmod: day(p.updatedAt), changefreq: "yearly", priority: "0.3" })),
  ];
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries.map((e) => urlEntry(base, e)).join("\n")}\n</urlset>\n`;
}

async function getSitemap({ fresh = false } = {}) {
  if (!fresh && cache.xml && Date.now() - cache.at < CACHE_MS) return cache.xml;
  cache = { xml: await buildSitemap(), at: Date.now() };
  return cache.xml;
}

module.exports = { getSitemap, buildSitemap, STATIC_ROUTES };
