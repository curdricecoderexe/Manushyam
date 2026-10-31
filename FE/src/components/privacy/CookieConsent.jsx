import { useEffect, useId, useRef, useState } from "react";
import { Link, useLocation } from "react-router";
import { Cookie, X } from "lucide-react";
import { Button } from "../ui/button";
import { Toggle } from "../admin/controls";
import { getConsent, onOpenCookieSettings, saveConsent, useConsent } from "../../lib/consent";
import { initAnalytics, setAnalyticsUser, trackPageview } from "../../lib/analytics";
import { useAuth } from "../../auth/context";
import { isCrawler } from "../../lib/crawler";

// Shown after first paint so it never delays the page; pages stay usable while it is open.
const SHOW_DELAY_MS = 800;

export function CookieConsent() {
  const consent = useConsent();
  const [open, setOpen] = useState(false);
  const [customizing, setCustomizing] = useState(false);
  const [analytics, setAnalytics] = useState(false);
  const titleId = useId();
  const panelRef = useRef(null);

  useEffect(() => {
    if (getConsent() || isCrawler()) return undefined;
    const t = setTimeout(() => setOpen(true), SHOW_DELAY_MS);
    return () => clearTimeout(t);
  }, []);

  useEffect(
    () =>
      onOpenCookieSettings(() => {
        setAnalytics(Boolean(getConsent()?.analytics));
        setCustomizing(true);
        setOpen(true);
      }),
    []
  );

  useEffect(() => {
    if (open && customizing) panelRef.current?.focus();
  }, [open, customizing]);

  function choose(action, allow) {
    saveConsent({ action, analytics: allow });
    setOpen(false);
    setCustomizing(false);
  }

  function saveCustom() {
    const before = consent?.analytics;
    choose(before && !analytics ? "withdraw" : "custom", analytics);
  }

  if (!open) return null;
  return (
    <section
      ref={panelRef}
      tabIndex={-1}
      role="region"
      aria-labelledby={titleId}
      data-no-track
      className="fixed inset-x-0 bottom-0 z-[60] max-h-[85vh] overflow-y-auto border-t border-sand-400 bg-cream-50 p-5 shadow-xl outline-none sm:inset-x-auto sm:bottom-6 sm:left-6 sm:max-w-[440px] sm:rounded-xl sm:border"
    >
      <div className="flex items-start gap-3">
        <Cookie className="mt-0.5 h-6 w-6 shrink-0 text-gold-600" strokeWidth={1.6} aria-hidden="true" />
        <div className="flex flex-1 flex-col gap-1.5">
          <h2 id={titleId} className="text-xl">
            {customizing ? "Cookie settings" : "Your privacy, your choice"}
          </h2>
          <p className="text-sm leading-relaxed text-ink-500">
            We use essential cookies to run the shop. With your OK, we’d also like to use our own analytics cookies to see which pages help people most — never sold or shared with advertisers.{" "}
            <Link to="/policies/privacy" className="font-semibold text-gold-700 underline">
              Privacy policy
            </Link>
          </p>
        </div>
        {consent && (
          <button type="button" onClick={() => setOpen(false)} aria-label="Close cookie settings" className="-m-2 flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-ink-500 hover:text-cocoa-900">
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        )}
      </div>

      {customizing && (
        <ul className="mt-4 flex flex-col divide-y divide-sand-400 rounded-lg border border-sand-400 bg-white">
          <li className="flex items-start justify-between gap-3 p-3.5">
            <div>
              <h3 className="font-sans text-sm font-semibold text-cocoa-900">Essential</h3>
              <p className="text-xs text-ink-500">Sign-in, cart, checkout and security. Always on.</p>
            </div>
            <Toggle checked disabled onChange={() => {}} label="Essential cookies (always on)" hideLabel />
          </li>
          <li className="flex items-start justify-between gap-3 p-3.5">
            <div>
              <h3 className="font-sans text-sm font-semibold text-cocoa-900">Analytics</h3>
              <p className="text-xs text-ink-500">Pages visited, clicks, device type and page speed. First-party only; raw data deleted after 90 days.</p>
            </div>
            <Toggle checked={analytics} onChange={setAnalytics} label="Analytics cookies" hideLabel />
          </li>
        </ul>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        {customizing ? (
          <>
            <Button size="sm" variant="brown" onClick={saveCustom}>
              Save choices
            </Button>
            <Button size="sm" variant="outline" onClick={() => choose("accept_all", true)}>
              Accept all
            </Button>
          </>
        ) : (
          <>
            <Button size="sm" variant="brown" onClick={() => choose("accept_all", true)}>
              Accept all
            </Button>
            <Button size="sm" variant="outline" onClick={() => choose("essential_only", false)}>
              Essential only
            </Button>
            <button
              type="button"
              onClick={() => {
                setAnalytics(false);
                setCustomizing(true);
              }}
              className="min-h-[40px] px-2 text-sm font-semibold text-gold-700 underline underline-offset-4 hover:text-brown-700"
            >
              Customize
            </button>
          </>
        )}
      </div>
    </section>
  );
}

// Page views on every storefront route change (held in memory until the visitor decides).
export function AnalyticsTracker() {
  const { pathname } = useLocation();
  const { isAuthenticated } = useAuth();

  useEffect(() => initAnalytics(), []);
  useEffect(() => setAnalyticsUser(isAuthenticated), [isAuthenticated]);
  useEffect(() => {
    // Let the page set its <title> first.
    const t = setTimeout(() => trackPageview(pathname, document.title), 0);
    return () => clearTimeout(t);
  }, [pathname]);
  return null;
}
