import { useRef, useState } from "react";
import { motion } from "motion/react";
import { TrendingDown, TrendingUp } from "lucide-react";
import { Button } from "../ui/button";
import { PRESETS, pct } from "../../lib/analyticsRange";
import { cn, formatPaise } from "../../lib/cn";
import { canAnimate, gsap, siblingIndex, useGSAP } from "./motion";

// Shared by the sales and web analytics screens (helpers live in lib/analyticsRange.js).
export function RangePicker({ range }) {
  const { today: t, preset, from, to, setParamsMany } = range;
  const [draft, setDraft] = useState({ from, to });

  function applyCustom(e) {
    e.preventDefault();
    setParamsMany({ range: "custom", from: draft.from, to: draft.to });
  }

  return (
    <div className="flex flex-wrap items-end gap-3">
      <div role="group" aria-label="Date range" className="flex max-w-full gap-0.5 overflow-x-auto rounded-xl bg-panel-sunken p-1 [scrollbar-width:none]">
        {PRESETS.map((pr) => (
          <button
            key={pr.id}
            type="button"
            aria-pressed={preset?.id === pr.id}
            onClick={() => {
              const [f, tt] = pr.range(t);
              setDraft({ from: f, to: tt });
              setParamsMany({ from: "", to: "", range: pr.id === "30d" ? "" : pr.id });
            }}
            className={cn("relative min-h-[36px] shrink-0 whitespace-nowrap rounded-lg px-3 text-[13px] font-medium transition-colors", preset?.id === pr.id ? "text-cocoa-900" : "text-ink-500 hover:text-cocoa-900")}
          >
            {preset?.id === pr.id && <motion.span layoutId="range-preset" className="absolute inset-0 rounded-lg bg-white shadow-[0_1px_3px_rgba(20,13,7,0.12)]" transition={{ type: "spring", stiffness: 500, damping: 36 }} aria-hidden="true" />}
            <span className="relative">{pr.label}</span>
          </button>
        ))}
      </div>
      <form onSubmit={applyCustom} aria-label="Custom range" className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1 text-xs text-ink-700">
          From
          <input type="date" value={draft.from} max={draft.to} onChange={(e) => setDraft((d) => ({ ...d, from: e.target.value }))} className="h-10 rounded-md border border-sand-400 bg-white px-2.5 text-sm" />
        </label>
        <label className="flex flex-col gap-1 text-xs text-ink-700">
          To
          <input type="date" value={draft.to} min={draft.from} max={t} onChange={(e) => setDraft((d) => ({ ...d, to: e.target.value }))} className="h-10 rounded-md border border-sand-400 bg-white px-2.5 text-sm" />
        </label>
        <Button type="submit" size="sm" variant="outline" disabled={!draft.from || !draft.to}>
          Apply
        </Button>
      </form>
    </div>
  );
}

export function Change({ now, before, days, empty = "No sales" }) {
  if (!before) return <span>{empty} in the previous {days} days</span>;
  const delta = (now - before) / before;
  const up = delta >= 0;
  const Icon = up ? TrendingUp : TrendingDown;
  return (
    <span className="inline-flex items-center gap-1">
      <Icon className={cn("h-3.5 w-3.5", up ? "text-leaf-800" : "text-danger-600")} aria-hidden="true" />
      {up ? "+" : "−"}
      {Math.abs(delta * 100).toFixed(1)}% vs previous {days} days
    </span>
  );
}

// Share of a total as a thin single-hue bar with the number next to it (never colour alone).
export function ShareRow({ name, value, total, detail, format = formatPaise }) {
  const share = total ? value / total : 0;
  const ref = useRef(null);
  useGSAP(
    () => {
      if (!canAnimate()) return;
      gsap.from("[data-share]", { scaleX: 0, transformOrigin: "0% 50%", duration: 0.9, ease: "power3.out", delay: 0.1 + siblingIndex(ref.current) * 0.08, clearProps: "transform" });
    },
    { scope: ref, dependencies: [share], revertOnUpdate: true }
  );
  return (
    <li ref={ref} className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-2 text-sm">
        <span className="break-all text-cocoa-900">{name}</span>
        <span className="shrink-0 tabular-nums text-cocoa-900">
          {format(value)} <span className="text-ink-500">· {pct(share)}</span>
        </span>
      </div>
      <span className="h-2 overflow-hidden rounded-full bg-panel-sunken" aria-hidden="true">
        <span data-share className="block h-full rounded-full bg-gold-500" style={{ width: `${share * 100}%` }} />
      </span>
      {detail && <span className="text-xs text-ink-500">{detail}</span>}
    </li>
  );
}
