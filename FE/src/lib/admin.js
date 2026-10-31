import { useCallback } from "react";
import { useSearchParams } from "react-router";
import { formatDateTime } from "./orders";

// URL-backed filters: setParam("status", "active") updates ?status= and resets ?page.
export function useUrlParams() {
  const [params, setParams] = useSearchParams();
  const setParam = useCallback(
    (key, value) =>
      setParams(
        (p) => {
          const n = new URLSearchParams(p);
          if (value) n.set(key, value);
          else n.delete(key);
          if (key !== "page") n.delete("page");
          return n;
        },
        { replace: true }
      ),
    [setParams]
  );
  // Several keys in one navigation (separate setParam calls in one tick would overwrite each other).
  const setParamsMany = useCallback(
    (values) =>
      setParams(
        (p) => {
          const n = new URLSearchParams(p);
          for (const [k, v] of Object.entries(values)) {
            if (v) n.set(k, v);
            else n.delete(k);
          }
          n.delete("page");
          return n;
        },
        { replace: true }
      ),
    [setParams]
  );
  return { params, get: (key, fallback = "") => params.get(key) ?? fallback, setParam, setParamsMany };
}

// Money inputs are typed in rupees; the API takes integer paise.
export const rupeesToPaise = (v) => (v === "" || v === null || v === undefined ? undefined : Math.round(Number(v) * 100));
export const paiseToRupees = (p) => (p === null || p === undefined ? "" : String(p / 100));

export function postState(p, now = Date.now()) {
  if (p.status === "draft") return { label: "Draft", tone: "amber" };
  if (p.publishAt && new Date(p.publishAt) > now) return { label: `Scheduled ${formatDateTime(p.publishAt)}`, tone: "blue" };
  return { label: "Published", tone: "green" };
}

export const slugify = (s) =>
  s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);

