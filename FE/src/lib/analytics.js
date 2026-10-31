import { API_BASE } from "./api";
import { analyticsAllowed, getConsent, randomId, subscribeConsent, visitorId } from "./consent";

// First-party analytics. Nothing is sent (or stored in the browser) until the visitor allows analytics
// cookies: events wait in memory and are sent if they accept, dropped if they don't. Every function
// here swallows its own errors — analytics must never break the shop.
const ENDPOINT = `${API_BASE}/api/analytics/collect`;
const SESSION_KEY = "mm_sid";
const SESSION_IDLE_MS = 30 * 60 * 1000;
const DEDUPE_MS = 2000;
const BATCH = 30;
const PENDING_MAX = 50;
const FLUSH_DELAY_MS = 2000;
const HEARTBEAT_MS = 60 * 1000;

const state = {
  started: false,
  queue: [],
  session: null,
  view: null,
  lastView: { path: null, at: 0 },
  signedIn: false,
  flushTimer: null,
  vitalsStarted: false,
};

function safe(fn) {
  return (...args) => {
    try {
      return fn(...args);
    } catch {
      return undefined;
    }
  };
}

// A session ends after 30 minutes without activity; it is kept in sessionStorage once allowed.
function session() {
  const now = Date.now();
  if (!state.session) {
    try {
      const saved = JSON.parse(sessionStorage.getItem(SESSION_KEY));
      if (saved && now - saved.last < SESSION_IDLE_MS) state.session = { ...saved, fresh: false };
    } catch {
      // ignore
    }
  }
  if (!state.session || now - state.session.last > SESSION_IDLE_MS) state.session = { id: randomId(), last: now, fresh: true };
  state.session.last = now;
  if (analyticsAllowed()) {
    try {
      sessionStorage.setItem(SESSION_KEY, JSON.stringify({ id: state.session.id, last: now }));
    } catch {
      // ignore
    }
  }
  return state.session;
}

function enqueue(event) {
  // Undecided visitors: hold a few events in memory only.
  if (!analyticsAllowed()) {
    if (getConsent() || state.queue.length >= PENDING_MAX) return;
    state.queue.push(event);
    return;
  }
  state.queue.push(event);
  scheduleFlush();
}

function scheduleFlush() {
  if (state.flushTimer) return;
  state.flushTimer = setTimeout(() => {
    state.flushTimer = null;
    flush();
  }, FLUSH_DELAY_MS);
}

// Sent as text/plain so the browser posts it cross-origin without a preflight (and sendBeacon works).
export const flush = safe(({ beacon = false } = {}) => {
  if (!analyticsAllowed() || !state.queue.length) return;
  const sid = session().id;
  const vid = visitorId();
  while (state.queue.length) {
    const events = state.queue.splice(0, BATCH);
    const body = JSON.stringify({ vid, sid, signedIn: state.signedIn, events });
    const sent = beacon && navigator.sendBeacon?.(ENDPOINT, new Blob([body], { type: "text/plain" }));
    if (!sent) fetch(ENDPOINT, { method: "POST", body, headers: { "Content-Type": "text/plain" }, keepalive: true, credentials: "omit" }).catch(() => {});
  }
});

function readUtm(search) {
  const params = new URLSearchParams(search);
  const utm = {};
  for (const k of ["source", "medium", "campaign", "term", "content"]) {
    const v = params.get(`utm_${k}`);
    if (v) utm[k] = v.slice(0, 100);
  }
  return Object.keys(utm).length ? utm : undefined;
}

function endView() {
  const v = state.view;
  if (!v) return;
  const visible = v.visibleMs + (v.since ? Date.now() - v.since : 0);
  enqueue({ t: "leave", pv: v.pv, durationMs: Math.round(visible) });
}

// Called on every route change. The same path within 2 s (StrictMode, redirects) counts once.
export const trackPageview = safe((path = location.pathname, title = document.title) => {
  const now = Date.now();
  if (state.lastView.path === path && now - state.lastView.at < DEDUPE_MS) return;
  state.lastView = { path, at: now };
  endView();
  const s = session();
  const pv = randomId();
  const event = { t: "pageview", pv, path, title: title?.slice(0, 150) || undefined };
  if (s.fresh) {
    event.referrer = document.referrer || undefined;
    event.utm = readUtm(location.search);
    s.fresh = false;
  }
  state.view = { pv, path, visibleMs: 0, since: document.visibilityState === "hidden" ? 0 : now };
  enqueue(event);
});

// Custom events, e.g. track("add_to_cart", { sku: "MM-MEN-THERAPY", qty: 1 }).
export const track = safe((name, props) => {
  enqueue({ t: "event", name, path: state.view?.path ?? location.pathname, ...(props ? { props } : {}) });
});

export function setAnalyticsUser(signedIn) {
  state.signedIn = Boolean(signedIn);
}

// Clicks on links and buttons (or anything with data-track="name"). Labels come from data-track,
// aria-label or the visible text; form fields are never read.
const onClick = safe((e) => {
  const el = e.target?.closest?.("a, button, [data-track]");
  if (!el || el.closest("[data-no-track]")) return;
  const label = (el.dataset.track || el.getAttribute("aria-label") || el.textContent || "").trim().replace(/\s+/g, " ").slice(0, 60);
  if (!label) return;
  const props = { label };
  const href = el.getAttribute("href");
  if (href) {
    const url = new URL(href, location.href);
    props.target = url.origin === location.origin ? url.pathname.slice(0, 100) : url.hostname;
  }
  track(el.tagName === "A" && props.target && !props.target.startsWith("/") ? "outbound_click" : "click", props);
});

const onVisibility = safe(() => {
  const v = state.view;
  if (document.visibilityState === "hidden") {
    if (v?.since) {
      v.visibleMs += Date.now() - v.since;
      v.since = 0;
    }
    if (v) enqueue({ t: "leave", pv: v.pv, durationMs: Math.round(v.visibleMs) });
    flush({ beacon: true });
  } else if (v) {
    v.since = Date.now();
  }
});

const heartbeat = safe(() => {
  if (document.visibilityState === "visible" && analyticsAllowed()) enqueue({ t: "ping" });
});

// Core Web Vitals, loaded (and measured) only once analytics is allowed.
async function startVitals() {
  if (state.vitalsStarted) return;
  state.vitalsStarted = true;
  try {
    const { onLCP, onFCP, onCLS, onTTFB, onINP } = await import("web-vitals");
    const report = (m) => enqueue({ t: "vital", name: m.name, value: Math.round(m.value * (m.name === "CLS" ? 1000 : 1)) / (m.name === "CLS" ? 1000 : 1), rating: m.rating, path: state.view?.path });
    [onLCP, onFCP, onCLS, onTTFB, onINP].forEach((on) => on(report));
  } catch {
    // ignore
  }
}

function onConsentChange() {
  if (analyticsAllowed()) {
    startVitals();
    if (state.queue.length) scheduleFlush();
  } else {
    // Declined or withdrawn: drop anything held and forget the session.
    state.queue.length = 0;
    try {
      sessionStorage.removeItem(SESSION_KEY);
    } catch {
      // ignore
    }
  }
}

// Starts listeners once (idempotent). Returns a cleanup function for tests.
export function initAnalytics() {
  if (state.started || typeof window === "undefined") return () => {};
  state.started = true;
  document.addEventListener("click", onClick, true);
  document.addEventListener("visibilitychange", onVisibility);
  window.addEventListener("pagehide", onVisibility);
  const timer = setInterval(heartbeat, HEARTBEAT_MS);
  const unsubscribe = subscribeConsent(onConsentChange);
  if (analyticsAllowed()) startVitals();
  return () => {
    document.removeEventListener("click", onClick, true);
    document.removeEventListener("visibilitychange", onVisibility);
    window.removeEventListener("pagehide", onVisibility);
    clearInterval(timer);
    unsubscribe();
    resetAnalyticsForTests();
  };
}

// Tests only.
export function resetAnalyticsForTests() {
  clearTimeout(state.flushTimer);
  Object.assign(state, { started: false, queue: [], session: null, view: null, lastView: { path: null, at: 0 }, signedIn: false, flushTimer: null, vitalsStarted: false });
}

export const pendingEvents = () => state.queue.slice();
