// Search-engine crawlers and prerender services get the page content straight away: no intro
// animation and no cookie banner (they never accept cookies, and the overlay would be in the snapshot).
const CRAWLER = /bot|crawl|spider|slurp|prerender|headlesschrome|facebookexternalhit|whatsapp|linkedinbot|twitterbot/i;

export function isCrawler(ua = typeof navigator === "undefined" ? "" : navigator.userAgent) {
  return CRAWLER.test(ua);
}
