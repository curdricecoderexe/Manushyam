import { useSyncExternalStore } from "react";
import { api } from "./api";

// Cookie consent (DPDP Act 2023). Essential storage is always on; analytics is opt-in and off until the
// visitor says yes. The choice lives in this browser, and every choice is also recorded on the server
// as the consent record. Bump POLICY_VERSION when what we collect changes, so everyone is asked again.
export const POLICY_VERSION = "2026-10";
const KEY = "mm_consent";
const VISITOR_KEY = "mm_vid";
// Ask again after 12 months.
const MAX_AGE_MS = 365 * 86400000;
const OPEN_EVENT = "mm:cookie-settings";

const listeners = new Set();

function read() {
  try {
    const c = JSON.parse(localStorage.getItem(KEY));
    if (!c || c.v !== POLICY_VERSION || Date.now() - c.at > MAX_AGE_MS) return null;
    return c;
  } catch {
    return null;
  }
}

let current = typeof window === "undefined" ? null : read();

export function getConsent() {
  return current;
}

export const analyticsAllowed = () => Boolean(current?.analytics);

export function randomId() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

// The visitor id is stored only once analytics is allowed. Before that (and for "essential only"
// visitors) a throwaway id is used just to key the consent record.
export function visitorId({ persist = analyticsAllowed() } = {}) {
  try {
    let id = localStorage.getItem(VISITOR_KEY);
    if (!id) {
      id = randomId();
      if (persist) localStorage.setItem(VISITOR_KEY, id);
    }
    return id;
  } catch {
    return randomId();
  }
}

// action: "accept_all" | "essential_only" | "custom" | "withdraw"
export function saveConsent({ analytics, action }) {
  const choice = { v: POLICY_VERSION, analytics: Boolean(analytics), action, at: Date.now() };
  const vid = visitorId({ persist: choice.analytics });
  try {
    localStorage.setItem(KEY, JSON.stringify(choice));
    // Withdrawing removes the stored analytics id too.
    if (!choice.analytics) localStorage.removeItem(VISITOR_KEY);
  } catch {
    // Private mode: the choice holds for this page view only.
  }
  current = choice;
  listeners.forEach((fn) => fn());
  // The record is sent whatever the choice (it is the proof of consent); failures never bother the visitor.
  api("/api/analytics/consent", { method: "POST", body: { vid, action, analytics: choice.analytics, policyVersion: POLICY_VERSION } }).catch(() => {});
  return choice;
}

export function subscribeConsent(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function useConsent() {
  return useSyncExternalStore(subscribeConsent, getConsent, () => null);
}

// "Cookie settings" links (footer, privacy page) reopen the banner's Customize panel.
export function openCookieSettings() {
  window.dispatchEvent(new Event(OPEN_EVENT));
}

export function onOpenCookieSettings(fn) {
  window.addEventListener(OPEN_EVENT, fn);
  return () => window.removeEventListener(OPEN_EVENT, fn);
}

// Tests only.
export function resetConsentForTests() {
  current = read();
  listeners.forEach((fn) => fn());
}
