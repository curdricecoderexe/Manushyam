import { cn } from "../../lib/cn";

// Signature motifs from getdesign.md §4. All decorative, hidden from assistive tech.

export function WheatArrow({ flip = false, className }) {
  return (
    <svg width="44" height="12" viewBox="0 0 44 12" fill="none" stroke="#A8722A" strokeWidth="1.3" aria-hidden="true" className={cn(flip && "-scale-x-100", className)}>
      <path d="M2 6h40M2 6l5-4M2 6l5 4M8 6l5-4M8 6l5 4M14 6l5-4M14 6l5 4" />
    </svg>
  );
}

export function SproutMark({ className, strokeWidth = 1.4 }) {
  return (
    <svg viewBox="0 0 40 26" fill="none" stroke="currentColor" strokeWidth={strokeWidth} aria-hidden="true" className={cn("h-6 w-10 text-gold-600", className)}>
      <path d="M20 24V9M20 9c-3-4-9-5-14-2 4 4 10 4 14 2zM20 9c3-4 9-5 14-2-4 4-10 4-14 2zM20 9c-2-3-1-6 0-8 1 2 2 5 0 8z" />
    </svg>
  );
}

// »— Title —«  centred section heading.
export function SectionTitle({ as: Comp = "h2", children, subtitle, className }) {
  return (
    <div className={cn("flex flex-col items-center gap-3 text-center", className)}>
      <div className="flex items-center justify-center gap-4">
        <WheatArrow className="hidden shrink-0 sm:block" />
        <Comp className="text-[clamp(1.75rem,2.6vw,2.25rem)] leading-tight">{children}</Comp>
        <WheatArrow flip className="hidden shrink-0 sm:block" />
      </div>
      {subtitle && <p className="text-ink-500">{subtitle}</p>}
    </div>
  );
}

export function LotusDivider({ className }) {
  return (
    <div className={cn("flex items-center gap-3", className)} aria-hidden="true">
      <span className="h-px w-20 bg-[#C9A063]" />
      <SproutMark className="h-3.5 w-5" strokeWidth={2} />
      <span className="h-px w-20 bg-[#C9A063]" />
    </div>
  );
}

// —— THE MANUSHYAM RITUAL ——
export function LineLabel({ as: Comp = "h2", children, className }) {
  return (
    <div className={cn("flex items-center justify-center gap-4", className)}>
      <span className="h-px w-14 bg-[#C9A063]" aria-hidden="true" />
      <Comp className="font-sans text-[15px] font-semibold uppercase tracking-[0.18em] text-cocoa-900">{children}</Comp>
      <span className="h-px w-14 bg-[#C9A063]" aria-hidden="true" />
    </div>
  );
}
