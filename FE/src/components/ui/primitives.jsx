import { useId } from "react";
import { cn } from "../../lib/cn";

export function Badge({ className, ...props }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-sm border border-sand-500 bg-cream-50 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-cocoa-900",
        className
      )}
      {...props}
    />
  );
}

export function Card({ as: Comp = "div", className, ...props }) {
  return <Comp className={cn("rounded-lg border border-sand-400 bg-cream-50 shadow-sm", className)} {...props} />;
}

export function Eyebrow({ as: Comp = "span", className, ...props }) {
  return <Comp className={cn("eyebrow", className)} {...props} />;
}

const fieldBase =
  "w-full rounded-md border border-sand-400 bg-white px-3.5 font-sans text-[15px] text-cocoa-900 placeholder:text-ink-500 transition-shadow focus:border-gold-600 focus:outline-none focus:ring-[3px] focus:ring-gold-500/20 aria-[invalid=true]:border-danger-600 disabled:bg-cream-200 disabled:text-ink-500";

// Text field with a visible label, optional hint and error wired up for screen readers.
export function Field({ label, hint, error, as = "input", className, inputClassName, id, ...props }) {
  const autoId = useId();
  const fieldId = id ?? autoId;
  const describedBy = [hint && `${fieldId}-hint`, error && `${fieldId}-error`].filter(Boolean).join(" ") || undefined;
  const Comp = as;
  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <label htmlFor={fieldId} className="text-sm font-medium text-cocoa-900">
        {label}
        {props.required && <span className="text-danger-600"> *</span>}
      </label>
      <Comp
        id={fieldId}
        aria-invalid={error ? "true" : undefined}
        aria-describedby={describedBy}
        className={cn(fieldBase, as === "textarea" ? "min-h-[120px] py-3" : "h-[52px]", inputClassName)}
        {...props}
      />
      {hint && !error && (
        <span id={`${fieldId}-hint`} className="text-xs text-ink-500">
          {hint}
        </span>
      )}
      {error && (
        <span id={`${fieldId}-error`} role="alert" className="text-xs text-danger-600">
          {error}
        </span>
      )}
    </div>
  );
}

export function QuantityStepper({ value, onChange, min = 1, max = 10, label = "Quantity", size = "md" }) {
  const h = size === "sm" ? "h-10 w-10" : "h-11 w-11";
  return (
    <div role="group" aria-label={label} className="inline-flex overflow-hidden rounded-md border border-sand-500 bg-white">
      <button type="button" aria-label="Decrease quantity" className={cn(h, "text-lg text-cocoa-900 disabled:opacity-40")} disabled={value <= min} onClick={() => onChange(Math.max(min, value - 1))}>
        −
      </button>
      <span aria-live="polite" className="flex w-12 items-center justify-center border-x border-sand-400 text-cocoa-900">
        {value}
      </span>
      <button type="button" aria-label="Increase quantity" className={cn(h, "text-lg text-cocoa-900 disabled:opacity-40")} disabled={value >= max} onClick={() => onChange(Math.min(max, value + 1))}>
        +
      </button>
    </div>
  );
}

export function Star({ className, filled = true }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={cn("h-4 w-4", className)} fill={filled ? "#C9944A" : "none"} stroke="#C9944A" strokeWidth="1.2">
      <path d="M12 2l3 7 7 .6-5.3 4.7 1.6 7.2L12 17.8 5.7 21.5l1.6-7.2L2 9.6 9 9z" />
    </svg>
  );
}

export function RatingBadge({ rating = 4.8, source = "on Amazon & Flipkart", className }) {
  return (
    <span className={cn("inline-flex items-center gap-3 rounded-md border border-[#C9A063] bg-white px-3.5 py-2 text-sm", className)}>
      <strong className="text-lg font-medium text-cocoa-900">{rating}</strong>
      <Star />
      <span className="h-5 w-px bg-sand-400" aria-hidden="true" />
      {source}
    </span>
  );
}

export function Skeleton({ className }) {
  return <div aria-hidden="true" className={cn("animate-pulse rounded-md bg-cream-300", className)} />;
}

export function IconCircle({ children, size = "md", className }) {
  const s = { sm: "h-10 w-10", md: "h-16 w-16", lg: "h-[72px] w-[72px]" }[size];
  return (
    <span className={cn("flex shrink-0 items-center justify-center rounded-full border border-sand-500 bg-cream-100 text-gold-600", s, className)}>
      {children}
    </span>
  );
}

const STATUS_TONES = {
  amber: "bg-warn-50 text-warn-800",
  blue: "bg-info-50 text-info-800",
  purple: "bg-plum-50 text-plum-800",
  green: "bg-leaf-50 text-leaf-800",
  grey: "bg-mute-50 text-mute-800",
  red: "bg-danger-50 text-danger-600",
};

export function StatusPill({ tone = "grey", children, className }) {
  return <span className={cn("inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold", STATUS_TONES[tone], className)}>{children}</span>;
}
