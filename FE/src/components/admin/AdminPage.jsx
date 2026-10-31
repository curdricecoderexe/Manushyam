import { useRef } from "react";
import { Link } from "react-router";
import { motion } from "motion/react";
import { ArrowUpRight } from "lucide-react";
import { Seo } from "../Seo";
import { cn } from "../../lib/cn";
import { EASE, canAnimate, gsap, siblingIndex, useCountUp, useGSAP } from "./motion";

// Frame for staff/admin screens: title row with actions, then content.
// `band` renders the title row as a house-green colour block (white text) — use admin-pill-light / admin-pill-ghost for its actions.
export function AdminPage({ title, subtitle, eyebrow, actions, children, className, band = false }) {
  const head = useRef(null);
  useGSAP(
    () => {
      if (!canAnimate()) return;
      gsap.from("[data-reveal]", { y: 12, opacity: 0, duration: 0.55, ease: "power3.out", stagger: 0.07, clearProps: "transform,opacity" });
    },
    { scope: head }
  );
  return (
    <div className={cn("mx-auto flex w-full max-w-[1440px] flex-col gap-6 px-4 py-6 sm:px-6 lg:px-10 lg:py-10", className)}>
      <Seo title={title} noindex />
      <div ref={head} className={cn("flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between", band && "admin-band px-6 py-7 sm:px-8 sm:py-9 lg:px-10")}>
        <div className="min-w-0">
          {eyebrow && (
            <p data-reveal className={cn("mb-2 text-[12px] font-semibold uppercase tracking-[0.1em]", band ? "text-white/70" : "text-ink-500")}>
              {eyebrow}
            </p>
          )}
          <h1 data-reveal className={cn("leading-tight", band ? "text-[clamp(28px,3.4vw,45px)] text-white" : "text-[clamp(24px,2.2vw,28px)] text-cocoa-900")}>
            {title}
          </h1>
          {subtitle && (
            <p data-reveal className={cn("mt-1.5 max-w-2xl", band ? "text-[17px] leading-relaxed text-white/70" : "text-[15px] text-ink-500")}>
              {subtitle}
            </p>
          )}
        </div>
        {actions && (
          <div data-reveal className="flex flex-wrap items-center gap-2 [&>*]:shrink-0">
            {actions}
          </div>
        )}
      </div>
      {children}
    </div>
  );
}

const MOTION_TAGS = { section: motion.section, div: motion.div, form: motion.form, article: motion.article, aside: motion.aside };

export function Panel({ title, actions, children, className, as: Comp = "section" }) {
  const Animated = MOTION_TAGS[Comp] ?? motion.section;
  return (
    <Animated
      aria-label={typeof title === "string" ? title : undefined}
      className={cn("admin-card min-w-0 overflow-hidden", className)}
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: EASE }}
    >
      {(title || actions) && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-sand-400 px-5 py-4 sm:px-6">
          {title && <h2 className="text-base text-cocoa-900">{title}</h2>}
          {actions}
        </div>
      )}
      {children}
    </Animated>
  );
}

// Stat tile (dataviz contract: sentence-case label, sans value, optional hint). Numbers count up with GSAP.
export function StatTile({ label, value, hint, icon, to, tone }) {
  const ref = useRef(null);
  const shown = useCountUp(value);
  const alert = tone === "alert" && value > 0;
  useGSAP(
    () => {
      if (!canAnimate()) return;
      gsap.from(ref.current, { y: 16, opacity: 0, duration: 0.55, ease: "power3.out", delay: siblingIndex(ref.current) * 0.06, clearProps: "transform,opacity" });
    },
    { scope: ref }
  );
  const body = (
    <>
      <span className="flex items-start justify-between gap-3">
        <span className="pt-0.5 text-[14px] font-medium text-ink-700">{label}</span>
        {icon && (
          <span className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-full ring-1 ring-inset [&>svg]:h-[18px] [&>svg]:w-[18px]", alert ? "bg-danger-50 text-danger-600 ring-transparent [&>svg]:text-danger-600" : "bg-gold-100 ring-transparent [&>svg]:text-gold-700")} aria-hidden="true">
            {icon}
          </span>
        )}
      </span>
      <span className={cn("font-sans text-[30px] font-semibold leading-none tracking-[-0.02em] tabular-nums text-cocoa-900", alert && "text-danger-600")}>{shown}</span>
      {hint && <span className={cn("text-xs leading-snug text-ink-500", to && "pr-6")}>{hint}</span>}
      {to && <ArrowUpRight className="absolute bottom-4 right-4 h-4 w-4 text-ink-500/60 transition-all duration-300 group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-brown-700" aria-hidden="true" />}
    </>
  );
  const cls = cn(
    "admin-card group relative flex h-full flex-col gap-3 overflow-hidden p-4 sm:p-5",
    alert && "border-l-4 border-l-danger-600"
  );
  return to ? (
    <Link ref={ref} to={to} className={cn(cls, "admin-lift hover:text-inherit")}>
      {body}
    </Link>
  ) : (
    <div ref={ref} className={cls}>
      {body}
    </div>
  );
}
