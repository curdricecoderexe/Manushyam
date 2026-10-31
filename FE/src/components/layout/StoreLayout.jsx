import { useEffect } from "react";
import { Outlet, ScrollRestoration, useLocation } from "react-router";
import { Header } from "./Header";
import { Footer } from "./Footer";
import { WhatsAppButton } from "./WhatsAppButton";
import { ChatWidget } from "../chat/ChatWidget";
import { IntroLoader } from "./IntroLoader";
import { MiniCart } from "../cart/MiniCart";
import { AnalyticsTracker, CookieConsent } from "../privacy/CookieConsent";
import { Toaster } from "../../toast/ToastProvider";
import { useToast } from "../../toast/context";
import { signalPrerenderReady } from "../../lib/query";

export function StoreLayout() {
  const { toasts, dismiss } = useToast();
  const { pathname } = useLocation();
  // Pages without API data are ready for a prerender snapshot as soon as they render.
  useEffect(() => signalPrerenderReady(), [pathname]);
  return (
    <div className="flex min-h-screen flex-col bg-cream-100">
      <IntroLoader />
      <Header />
      <main id="main" className="flex-1" tabIndex={-1}>
        <Outlet />
      </main>
      <Footer />
      <WhatsAppButton />
      <ChatWidget />
      <MiniCart />
      <CookieConsent />
      <AnalyticsTracker />
      <Toaster toasts={toasts} onDismiss={dismiss} />
      <ScrollRestoration />
    </div>
  );
}
