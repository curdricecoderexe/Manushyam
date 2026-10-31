const sanitizeHtml = require("sanitize-html");
const { getEnv } = require("../Config/runtime");

// Allow-list for article HTML coming from the admin editor (TipTap output). Everything else —
// scripts, styles, event handlers, iframes, javascript:/data: URLs — is stripped on the server.
const SANITIZE = {
  allowedTags: ["p", "h2", "h3", "h4", "strong", "b", "em", "i", "u", "s", "a", "ul", "ol", "li", "blockquote", "img", "figure", "figcaption", "hr", "br", "code", "pre"],
  allowedAttributes: {
    a: ["href", "title", "target", "rel"],
    img: ["src", "alt", "title", "width", "height", "loading"],
    ol: ["start"],
  },
  allowedSchemes: ["https", "mailto"],
  allowedSchemesByTag: { img: ["https"] },
  allowProtocolRelative: false,
  disallowedTagsMode: "discard",
  transformTags: {
    // Headings start at h2: the page title is the only h1.
    h1: "h2",
    a: (tagName, attribs) => {
      const href = attribs.href ?? "";
      const internal = href.startsWith("/") || isOwnSite(href);
      return {
        tagName: "a",
        attribs: { href, ...(attribs.title ? { title: attribs.title } : {}), ...(internal ? {} : { target: "_blank", rel: "noopener noreferrer nofollow" }) },
      };
    },
    img: (tagName, attribs) => ({ tagName: "img", attribs: { ...attribs, loading: "lazy" } }),
  },
  // Site-relative links and images (/solutions/…, /images/…) are allowed alongside https.
  allowedSchemesAppliedToAttributes: ["href", "src"],
  exclusiveFilter: (frame) => frame.tag === "img" && !frame.attribs.src,
};

function isOwnSite(href) {
  try {
    return new URL(href).origin === new URL(getEnv().APP_URL).origin;
  } catch {
    return false;
  }
}

function sanitizePostHtml(html) {
  return sanitizeHtml(String(html ?? ""), SANITIZE).trim();
}

function plainText(html) {
  // Block boundaries become spaces so "<h2>A</h2><p>B</p>" reads "A B", not "AB".
  const spaced = String(html ?? "").replace(/<\/(p|h[1-6]|li|blockquote|figcaption|pre)>|<br\s*\/?>/gi, "$& ");
  return sanitizeHtml(spaced, { allowedTags: [], allowedAttributes: {} })
    .replace(/\s+/g, " ")
    .trim();
}

// ~200 words a minute, at least one.
function readMinutes(html) {
  const words = plainText(html).split(" ").filter(Boolean).length;
  return Math.max(1, Math.round(words / 200));
}

function deriveExcerpt(html, max = 220) {
  const text = plainText(html);
  if (text.length <= max) return text;
  return `${text.slice(0, text.lastIndexOf(" ", max - 1)).replace(/[,;:.]$/, "")}…`;
}

// Applies sanitisation and derived fields to an admin create/update payload.
function preparePost(input, existing) {
  const out = { ...input };
  if (input.contentHtml !== undefined) {
    out.contentHtml = sanitizePostHtml(input.contentHtml);
    out.readMinutes = readMinutes(out.contentHtml);
  }
  const content = out.contentHtml ?? existing?.contentHtml ?? "";
  if (!(out.excerpt ?? existing?.excerpt) && content) out.excerpt = deriveExcerpt(content);
  // Publishing without a date publishes now; drafts keep whatever date was planned.
  const status = out.status ?? existing?.status;
  if (status === "published" && !(out.publishAt ?? existing?.publishAt)) out.publishAt = new Date();
  return out;
}

module.exports = { sanitizePostHtml, plainText, readMinutes, deriveExcerpt, preparePost };
