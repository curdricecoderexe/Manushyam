export const SITE_NAME = "ManushyaM";
export const APP_URL = import.meta.env.VITE_APP_URL || "https://manushyam.com";
// Shared-link preview when a page has no image of its own (brand hero).
export const DEFAULT_OG_IMAGE = "/images/content/hero-man.jpg";

// Home page: who we are + sitelinks search box.
export function siteJsonLd({ email, phone } = {}) {
  return [
    {
      "@context": "https://schema.org",
      "@type": "Organization",
      name: SITE_NAME,
      legalName: "ManushyaM Wellness Pvt. Ltd.",
      url: APP_URL,
      logo: `${APP_URL}/favicon.png`,
      // Add `sameAs: [...]` with the real social profile URLs once the footer links point at them.
      ...(email || phone ? { contactPoint: [{ "@type": "ContactPoint", contactType: "customer support", areaServed: "IN", availableLanguage: ["en", "hi"], ...(email ? { email } : {}), ...(phone ? { telephone: phone } : {}) }] } : {}),
    },
    {
      "@context": "https://schema.org",
      "@type": "WebSite",
      name: SITE_NAME,
      url: APP_URL,
      potentialAction: { "@type": "SearchAction", target: { "@type": "EntryPoint", urlTemplate: `${APP_URL}/search?q={search_term_string}` }, "query-input": "required name=search_term_string" },
    },
  ];
}

// schema.org BreadcrumbList for a Home › Section › Page trail.
export function breadcrumbJsonLd(items) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, i) => ({ "@type": "ListItem", position: i + 1, name: item.label, ...(item.to ? { item: `${APP_URL}${item.to}` } : {}) })),
  };
}

// Relative image paths (/images/…) must be absolute in structured data and Open Graph tags.
export function absoluteUrl(url) {
  return /^https?:\/\//.test(url) ? url : `${APP_URL}${url}`;
}

// schema.org Article for a blog post.
export function articleJsonLd(post) {
  return {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: post.title,
    description: post.seo?.description || post.excerpt,
    ...(post.coverImage ? { image: [absoluteUrl(post.coverImage.url)] } : {}),
    datePublished: post.publishedAt,
    dateModified: post.updatedAt || post.publishedAt,
    author: { "@type": "Organization", name: post.author?.name || SITE_NAME },
    publisher: { "@type": "Organization", name: SITE_NAME, logo: { "@type": "ImageObject", url: `${APP_URL}/favicon.png` } },
    mainEntityOfPage: { "@type": "WebPage", "@id": `${APP_URL}/blog/${post.slug}` },
    ...(post.category ? { articleSection: post.category.name } : {}),
  };
}
