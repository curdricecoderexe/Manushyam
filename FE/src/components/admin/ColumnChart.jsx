import { useId, useRef, useState } from "react";
import { motion } from "motion/react";
import { cn } from "../../lib/cn";
import { canAnimate, gsap, useGSAP } from "./motion";

// Round the axis up to a clean number with 4 even ticks (0 / 5 / 10 / 15 / 20).
function niceMax(max) {
  if (max <= 4) return 4;
  const step = 10 ** Math.floor(Math.log10(max / 4));
  const nice = [1, 2, 2.5, 5, 10].map((m) => m * step).find((s) => s * 4 >= max);
  return nice * 4;
}

// Single-series column chart (one hue, no legend — the title names the series). Thin columns
// with 4px rounded tops on one baseline, hairline gridlines, a tooltip on hover/focus and a
// table view for screen readers and anyone who prefers numbers.
// Long series (30 days) label every nth column so axis labels never collide.
export function ColumnChart({ title, data, format = (v) => v.toLocaleString("en-IN"), color, height = 200, categoryLabel = "Day" }) {
  const id = useId();
  const [active, setActive] = useState(null);
  const [showTable, setShowTable] = useState(false);
  const max = niceMax(Math.max(0, ...data.map((d) => d.value)));
  const ticks = [0, 1, 2, 3, 4].map((i) => (max / 4) * i);
  const labelEvery = Math.max(1, Math.ceil(data.length / 10));
  const scope = useRef(null);
  const signature = data.map((d) => `${d.key}:${d.value}`).join(",");

  // Columns rise from the baseline whenever the series changes (and when switching back from the table).
  useGSAP(
    () => {
      if (!canAnimate() || showTable) return;
      gsap.from("[data-bar]", { scaleY: 0, transformOrigin: "50% 100%", duration: 0.8, ease: "power3.out", stagger: { each: 0.035, from: "start" }, clearProps: "transform" });
    },
    { scope, dependencies: [signature, showTable], revertOnUpdate: true }
  );

  return (
    <figure ref={scope} aria-labelledby={`${id}-title`} className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <figcaption id={`${id}-title`} className="text-[15px] font-semibold text-cocoa-900">
          {title}
        </figcaption>
        <button type="button" onClick={() => setShowTable((s) => !s)} className="rounded-lg px-2.5 py-1.5 text-xs font-semibold text-gold-700 ring-1 ring-inset ring-sand-400/70 transition-colors hover:bg-cream-100" aria-pressed={showTable}>
          {showTable ? "Show chart" : "Show table"}
        </button>
      </div>
      {showTable ? (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-sand-400 text-left text-ink-500">
              <th className="py-1.5 font-medium">{categoryLabel}</th>
              <th className="py-1.5 text-right font-medium">{title}</th>
            </tr>
          </thead>
          <tbody>
            {data.map((d) => (
              <tr key={d.key} className="border-b border-sand-400/60">
                <td className="py-1.5">{d.fullLabel ?? d.label}</td>
                <td className="py-1.5 text-right tabular-nums">{format(d.value)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <div className="flex gap-2">
          <div className="relative flex flex-col justify-between pb-6 text-right text-[11px] tabular-nums text-ink-500" style={{ height }} aria-hidden="true">
            {[...ticks].reverse().map((t) => (
              <span key={t} className="-translate-y-1/2 leading-none first:translate-y-0 last:translate-y-0">
                {format(t)}
              </span>
            ))}
          </div>
          <div className="relative flex-1" style={{ height }}>
            <div className="absolute inset-x-0 bottom-6 top-0" aria-hidden="true">
              {ticks.map((t) => (
                <span key={t} className={cn("absolute inset-x-0 h-px", t === 0 ? "bg-sand-400" : "border-t border-dashed border-sand-400/70")} style={{ bottom: `${(t / max) * 100}%` }} />
              ))}
            </div>
            <ul className="absolute inset-0 flex items-end justify-around" role="list">
              {data.map((d, i) => {
                const pct = max ? (d.value / max) * 100 : 0;
                const label = `${d.fullLabel ?? d.label}: ${format(d.value)}`;
                return (
                  <li key={d.key} className="relative flex h-full flex-1 flex-col items-center justify-end">
                    {/* Hit target is the whole column slot, wider than the bar. */}
                    <span
                      tabIndex={0}
                      aria-label={label}
                      onMouseEnter={() => setActive(i)}
                      onMouseLeave={() => setActive(null)}
                      onFocus={() => setActive(i)}
                      onBlur={() => setActive(null)}
                      className="flex h-[calc(100%-24px)] w-full items-end justify-center rounded-t-md outline-none transition-colors hover:bg-panel-muted focus-visible:bg-cream-200"
                    >
                      <span
                        data-bar
                        className={cn("block w-[62%] max-w-7 rounded-t-[6px] transition-opacity duration-200", data.length > 14 && "w-[70%] max-w-[12px] rounded-t-[3px]", d.value > 0 ? "min-h-[2px]" : "")}
                        style={{ height: `${pct}%`, background: color ? `linear-gradient(180deg, ${color} 0%, ${color}cc 100%)` : "linear-gradient(180deg, rgb(var(--c-chart)) 0%, rgb(var(--c-chart) / 0.65) 100%)", opacity: active === null || active === i ? 1 : 0.45 }}
                      />
                    </span>
                    <span className="h-6 whitespace-nowrap pt-1.5 text-[11px] text-ink-500" aria-hidden="true">
                      {i % labelEvery === 0 ? d.label : ""}
                    </span>
                    {active === i && (
                      <motion.span
                        role="tooltip"
                        initial={{ opacity: 0, y: 4, scale: 0.96 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        transition={{ duration: 0.15 }}
                        className="pointer-events-none absolute z-10 whitespace-nowrap rounded-lg bg-[#140D07] px-3 py-2 text-xs text-white ring-1 ring-white/10 shadow-[0_8px_24px_-6px_rgba(20,13,7,0.5)]"
                        style={{ bottom: `calc(${pct}% + 32px)` }}
                      >
                        <span className="block text-[11px] text-white/60">{d.fullLabel ?? d.label}</span>
                        <span className="font-semibold tabular-nums">{format(d.value)}</span>
                      </motion.span>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      )}
    </figure>
  );
}
