// Only allow redirecting back to our own pages (prevents open redirects via ?next=https://evil.example).
export function safeNext(next, fallback = "/account") {
  return typeof next === "string" && next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/\\") ? next : fallback;
}
