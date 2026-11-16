// Only https links (or site paths) are rendered as hrefs; anything else (javascript:, data:, …) is dropped.
export function safeHref(url) {
  const s = typeof url === "string" ? url.trim() : "";
  if (/^https:\/\/[^\s"'<>\\]+$/.test(s)) return s;
  if (/^\/(?![/\\])[^\s\\]*$/.test(s)) return s;
  return null;
}
