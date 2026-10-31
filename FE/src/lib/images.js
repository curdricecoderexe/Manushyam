// Responsive image URLs. Cloudinary uploads get automatic format (AVIF/WebP) and quality plus a width
// per srcset entry; bundled /images files are served as they are unless the Netlify Image CDN is
// switched on (VITE_IMAGE_CDN=netlify), which does the same for them in production.
const CLOUDINARY = /^(https:\/\/res\.cloudinary\.com\/[^/]+\/image\/upload\/)(.*)$/;
const IMAGE_CDN = import.meta.env.VITE_IMAGE_CDN;

export const WIDTHS = {
  card: [320, 480, 640, 800],
  hero: [640, 960, 1280, 1600],
  full: [480, 800, 1200, 1600],
  thumb: [96, 160],
};

export function imageUrl(url, width) {
  if (!url) return url;
  const m = url.match(CLOUDINARY);
  // An existing transformation segment (e.g. "c_fill,w_200/") is kept; ours goes in front.
  if (m) return `${m[1]}f_auto,q_auto${width ? `,w_${width},c_limit` : ""}/${m[2]}`;
  if (IMAGE_CDN === "netlify" && url.startsWith("/") && !url.startsWith("//")) {
    return `/.netlify/images?url=${encodeURIComponent(url)}${width ? `&w=${width}` : ""}`;
  }
  return url;
}

const transformable = (url) => Boolean(url) && (CLOUDINARY.test(url) || (IMAGE_CDN === "netlify" && url.startsWith("/") && !url.startsWith("//")));

// Spread onto an <img>: {...responsiveImage(url, "card", "(min-width: 1024px) 25vw, 50vw")}
export function responsiveImage(url, preset = "full", sizes = "100vw") {
  if (!transformable(url)) return { src: url, decoding: "async" };
  const widths = WIDTHS[preset] ?? WIDTHS.full;
  return {
    src: imageUrl(url, widths[widths.length - 1]),
    srcSet: widths.map((w) => `${imageUrl(url, w)} ${w}w`).join(", "),
    sizes,
    decoding: "async",
  };
}
