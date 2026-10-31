const KEY = "mm_recently_viewed";
const MAX = 8;

export function getRecentlyViewed() {
  try {
    const list = JSON.parse(localStorage.getItem(KEY) || "[]");
    return Array.isArray(list) ? list.filter((s) => typeof s === "string" && /^[a-z0-9-]{1,80}$/.test(s)).slice(0, MAX) : [];
  } catch {
    return [];
  }
}

// Most recent first, no duplicates.
export function recordView(slug) {
  try {
    localStorage.setItem(KEY, JSON.stringify([slug, ...getRecentlyViewed().filter((s) => s !== slug)].slice(0, MAX)));
  } catch {
    // Storage unavailable — recently viewed is a nice-to-have.
  }
}
