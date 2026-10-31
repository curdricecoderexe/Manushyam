import { Helmet } from "react-helmet-async";
import { APP_URL, DEFAULT_OG_IMAGE, SITE_NAME as SITE, absoluteUrl } from "../lib/seo";

// Per-route head tags. `path` is the canonical path (no query string); pages that shouldn't be
// indexed (account, cart, checkout, search, filtered listings) pass `noindex` and get no canonical.
export function Seo({ title, description, path, image, imageAlt, type = "website", noindex = false, jsonLd }) {
  const fullTitle = title ? `${title} | ${SITE}` : `${SITE} — Rooted in Ritual`;
  const url = path !== undefined ? `${APP_URL}${path}` : undefined;
  const ogImage = absoluteUrl(image || DEFAULT_OG_IMAGE);
  return (
    <Helmet>
      <title>{fullTitle}</title>
      {description && <meta name="description" content={description} />}
      {url && !noindex && <link rel="canonical" href={url} />}
      {noindex && <meta name="robots" content="noindex,nofollow" />}
      <meta property="og:site_name" content={SITE} />
      <meta property="og:locale" content="en_IN" />
      <meta property="og:type" content={type} />
      <meta property="og:title" content={fullTitle} />
      {description && <meta property="og:description" content={description} />}
      {url && <meta property="og:url" content={url} />}
      <meta property="og:image" content={ogImage} />
      {imageAlt && <meta property="og:image:alt" content={imageAlt} />}
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={fullTitle} />
      {description && <meta name="twitter:description" content={description} />}
      <meta name="twitter:image" content={ogImage} />
      {[].concat(jsonLd ?? []).map((data, i) => (
        <script key={i} type="application/ld+json">
          {/* < keeps a stored "</script>" in CMS text from closing the tag. */}
          {JSON.stringify(data).replace(/</g, "\\u003c")}
        </script>
      ))}
    </Helmet>
  );
}
