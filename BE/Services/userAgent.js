// Small User-Agent classifier for analytics (device type, browser family, OS). Only these coarse labels
// are stored, never the UA string itself. Order matters: Edge/Opera/Samsung also say "Chrome", and
// every iOS browser says "Safari".
const BOT = /bot|crawl|spider|slurp|lighthouse|headless|preview|facebookexternalhit|whatsapp|pingdom|monitor|curl|wget|python-requests|axios|node-fetch|go-http-client/i;

const BROWSERS = [
  ["Edge", /Edg(e|A|iOS)?\//],
  ["Opera", /OPR\/|Opera/],
  ["Samsung Internet", /SamsungBrowser\//],
  ["Firefox", /Firefox\/|FxiOS\//],
  ["Chrome", /Chrome\/|CriOS\//],
  ["Safari", /Safari\//],
];

const SYSTEMS = [
  ["iOS", /iPhone|iPad|iPod/],
  ["Android", /Android/],
  ["Windows", /Windows/],
  ["ChromeOS", /CrOS/],
  ["macOS", /Mac OS X|Macintosh/],
  ["Linux", /Linux/],
];

function isBot(ua) {
  return !ua || BOT.test(ua);
}

function classify(ua = "") {
  const browser = BROWSERS.find(([, re]) => re.test(ua))?.[0] ?? "Other";
  const os = SYSTEMS.find(([, re]) => re.test(ua))?.[0] ?? "Other";
  let type = "desktop";
  if (/iPad|Tablet/.test(ua) || (/Android/.test(ua) && !/Mobile/.test(ua))) type = "tablet";
  else if (/Mobi|iPhone|iPod|Android/.test(ua)) type = "mobile";
  return { type, browser, os };
}

module.exports = { isBot, classify };
