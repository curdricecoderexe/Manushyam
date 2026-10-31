import { API_BASE } from "./api";

// Sends browser crashes to the API log (POST /api/client-errors, always 204). At most a few reports per
// page load and never the same message twice, so a render loop can't flood the endpoint. Only the
// page path is sent, never the query string (it can hold tokens or emails).
const MAX_REPORTS = 5;
const sent = new Set();

export function reportError(error, { kind = "error", componentStack } = {}) {
  try {
    const message = String(error?.message || error || "Unknown error").slice(0, 500);
    if (sent.size >= MAX_REPORTS || sent.has(message)) return;
    sent.add(message);
    const body = {
      kind,
      message,
      ...(error?.stack ? { stack: String(error.stack).slice(0, 4000) } : {}),
      ...(componentStack ? { componentStack: String(componentStack).slice(0, 2000) } : {}),
      url: `${location.origin}${location.pathname}`,
      ...(import.meta.env.VITE_RELEASE ? { release: import.meta.env.VITE_RELEASE } : {}),
    };
    fetch(`${API_BASE}/api/client-errors`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), keepalive: true, credentials: "omit" }).catch(() => {});
  } catch {
    // Reporting must never throw.
  }
}

// Uncaught errors and promise rejections outside React.
export function installGlobalErrorReporting() {
  window.addEventListener("error", (e) => {
    // Resource load failures (img/script) have no `error`; the route boundary handles chunk failures.
    if (e.error) reportError(e.error, { kind: "error" });
  });
  window.addEventListener("unhandledrejection", (e) => {
    // Failed API calls are already shown to the user and logged by the server.
    if (e.reason?.name === "ApiError") return;
    reportError(e.reason, { kind: "unhandledrejection" });
  });
}

// Tests only.
export function resetErrorReportsForTests() {
  sent.clear();
}
