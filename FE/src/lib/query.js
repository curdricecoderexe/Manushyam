import { useCallback, useEffect, useSyncExternalStore } from "react";
import { api } from "./api";

// Tiny stale-while-revalidate cache for public GET requests: pages that share data (header menu,
// listing, product page) fetch it once, and revisits render instantly from cache.
const STALE_MS = 60 * 1000;
const entries = new Map(); // path -> { data, error, status, fetchedAt, promise }
const listeners = new Set();
const IDLE = { data: undefined, error: null, status: "idle", fetchedAt: 0 };

function emit() {
  listeners.forEach((l) => l());
  signalPrerenderReady();
}

// Prerender services (Netlify prerendering) wait for window.prerenderReady (main.jsx sets it to
// false) before snapshotting. It turns true once no page data is loading for a short moment.
const SETTLE_MS = 500;
let settleTimer = null;
export function signalPrerenderReady() {
  if (typeof window === "undefined" || window.prerenderReady !== false) return;
  clearTimeout(settleTimer);
  const loading = [...entries.values()].some((e) => e.promise);
  if (!loading) settleTimer = setTimeout(() => (window.prerenderReady = true), SETTLE_MS);
}

function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function fetchQuery(path, { force = false } = {}) {
  const current = entries.get(path);
  if (current?.promise) return current.promise;
  if (!force && current?.status === "success" && Date.now() - current.fetchedAt < STALE_MS) return Promise.resolve(current.data);

  const promise = api(path, { auth: false })
    .then((data) => {
      entries.set(path, { data, error: null, status: "success", fetchedAt: Date.now() });
      emit();
      return data;
    })
    .catch((error) => {
      // Keep showing old data if a background refresh fails.
      const prev = entries.get(path);
      entries.set(path, { data: prev?.data, error, status: "error", fetchedAt: Date.now() });
      emit();
      throw error;
    });
  entries.set(path, { ...(current ?? IDLE), status: current?.data !== undefined ? "success" : "loading", promise });
  emit();
  return promise;
}

export function clearQueryCache() {
  entries.clear();
  emit();
}

// const { data, error, isLoading } = useQuery("/api/products?for=men");  Pass null to skip.
export function useQuery(path) {
  const entry = useSyncExternalStore(
    subscribe,
    () => (path ? entries.get(path) ?? IDLE : IDLE),
    () => IDLE
  );

  useEffect(() => {
    if (path) fetchQuery(path).catch(() => {});
  }, [path]);

  const refetch = useCallback(() => (path ? fetchQuery(path, { force: true }).catch(() => {}) : undefined), [path]);

  return {
    data: entry.data,
    error: entry.status === "error" ? entry.error : null,
    // Loading only when there is nothing to show yet.
    isLoading: Boolean(path) && entry.data === undefined && entry.status !== "error",
    refetch,
  };
}

// Builds "/api/products?for=men&type=combo", dropping empty values.
export function withQuery(path, params = {}) {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === "" || (Array.isArray(v) && v.length === 0)) continue;
    qs.set(k, Array.isArray(v) ? v.join(",") : String(v));
  }
  const s = qs.toString();
  return s ? `${path}?${s}` : path;
}
