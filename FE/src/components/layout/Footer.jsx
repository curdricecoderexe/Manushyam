import { Link } from "react-router";
import { Leaf, BadgeCheck, Heart } from "lucide-react";
import logo from "../../assets/brand/logo.png";
import { FOOTER_LINKS } from "../../data/site";
import { NewsletterForm } from "../engagement/NewsletterForm";
import { openCookieSettings } from "../../lib/consent";

const SOCIALS = [
  { label: "Instagram", href: "https://instagram.com/", d: "M7 3h10a4 4 0 0 1 4 4v10a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4V7a4 4 0 0 1 4-4zM12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM17.5 6.5h.01" },
  { label: "Facebook", href: "https://facebook.com/", d: "M14 8h3V4h-3a4 4 0 0 0-4 4v3H7v4h3v6h4v-6h3l1-4h-4V8z" },
  { label: "YouTube", href: "https://youtube.com/", d: "M6 5h12a4 4 0 0 1 4 4v6a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V9a4 4 0 0 1 4-4zM10 9l5 3-5 3z" },
  { label: "Pinterest", href: "https://pinterest.com/", d: "M9 21l2.5-10M10 15c4 1 8-1 8-6a6 6 0 0 0-12 0c0 1.5.5 2.7 1.3 3.4" },
];

export function Footer() {
  return (
    <footer className="border-t border-sand-400 bg-cream-200">
      <div className="container-page grid grid-cols-1 gap-10 py-16 sm:grid-cols-2 lg:grid-cols-[1.3fr_1fr_1fr_1fr_1.5fr]">
        <div className="flex flex-col gap-4">
          <img src={logo} alt="ManushyaM" className="h-14 w-auto self-start" />
          <p className="text-sm leading-relaxed text-ink-500">Ayurvedic anti-hairfall therapy for men and women. Rooted in ancient wisdom. Powered by nature.</p>
          <ul className="flex gap-2.5">
            {SOCIALS.map((s) => (
              <li key={s.label}>
                <a href={s.href} target="_blank" rel="noopener noreferrer" aria-label={s.label} className="flex h-10 w-10 items-center justify-center rounded-full bg-brown-700 text-white hover:bg-brown-800 hover:text-white">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d={s.d} />
                  </svg>
                </a>
              </li>
            ))}
          </ul>
        </div>
        {FOOTER_LINKS.map((col) => (
          <nav key={col.title} aria-label={col.title} className="flex flex-col gap-2.5 text-sm">
            <h2 className="mb-1 text-[17px]">{col.title}</h2>
            {col.links.map((l) => (
              <Link key={l.label} to={l.to} className="text-ink-500 hover:text-gold-700">
                {l.label}
              </Link>
            ))}
          </nav>
        ))}
        <div className="flex flex-col gap-3">
          <h2 className="text-[17px]">Stay Connected</h2>
          <p className="-mt-1 text-[13px] text-ink-500">Subscribe for offers, tips &amp; updates.</p>
          <NewsletterForm source="footer" />
          <ul className="flex justify-between gap-2 rounded-lg border border-sand-400 bg-cream-100 px-3.5 py-3 text-xs">
            <li className="flex items-center gap-1.5"><Leaf className="h-5 w-5 text-gold-600" strokeWidth={1.5} aria-hidden="true" />100% Ayurvedic</li>
            <li className="flex items-center gap-1.5"><BadgeCheck className="h-5 w-5 text-gold-600" strokeWidth={1.5} aria-hidden="true" />Made in India</li>
            <li className="flex items-center gap-1.5"><Heart className="h-5 w-5 text-gold-600" strokeWidth={1.5} aria-hidden="true" />Cruelty Free</li>
          </ul>
        </div>
      </div>
      <div className="border-t border-sand-400">
        <div className="container-page flex flex-wrap items-center justify-between gap-4 py-5 text-xs text-ink-500">
          <span className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <span>© {new Date().getFullYear()} ManushyaM Wellness Pvt. Ltd. All rights reserved.</span>
            <button type="button" onClick={openCookieSettings} className="min-h-[32px] font-semibold text-ink-700 underline underline-offset-4 hover:text-gold-700">
              Cookie settings
            </button>
          </span>
          <ul className="flex gap-2" aria-label="Accepted payments">
            {["VISA", "Mastercard", "RuPay", "UPI"].map((p) => (
              <li key={p} className="rounded-sm border border-sand-400 bg-white px-2.5 py-1 font-bold italic text-cocoa-900">{p}</li>
            ))}
          </ul>
          <span>
            Secure payments powered by <strong className="italic text-[#0C2451]">Razorpay</strong>
          </span>
        </div>
      </div>
    </footer>
  );
}
