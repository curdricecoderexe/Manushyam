import { Check } from "lucide-react";
import { cn } from "../../lib/cn";

const CHECKOUT_STEPS = ["Address", "Delivery", "Payment", "Review"];

// Progress indicator across the top of checkout. Completed steps can be revisited.
export function CheckoutSteps({ current, onSelect }) {
  return (
    <ol aria-label="Checkout progress" className="mb-8 flex items-center gap-2 overflow-x-auto pb-1 text-sm">
      {CHECKOUT_STEPS.map((label, i) => {
        const done = i < current;
        const active = i === current;
        const content = (
          <>
            <span
              className={cn(
                "flex h-8 w-8 shrink-0 items-center justify-center rounded-full border font-sans text-[13px] font-semibold",
                done && "border-leaf-800 bg-leaf-800 text-white",
                active && "border-brown-700 bg-brown-700 text-white",
                !done && !active && "border-sand-500 bg-cream-50 text-ink-500"
              )}
              aria-hidden="true"
            >
              {done ? <Check className="h-4 w-4" strokeWidth={2.5} /> : i + 1}
            </span>
            <span className={cn("whitespace-nowrap font-serif text-base", active || done ? "text-cocoa-900" : "text-ink-500")}>{label}</span>
          </>
        );
        return (
          <li key={label} aria-current={active ? "step" : undefined} className="flex items-center gap-2">
            {done && onSelect ? (
              <button type="button" onClick={() => onSelect(i)} className="flex items-center gap-2 rounded-md hover:text-gold-700" aria-label={`${label} (done) — change`}>
                {content}
              </button>
            ) : (
              <span className="flex items-center gap-2">{content}</span>
            )}
            {i < CHECKOUT_STEPS.length - 1 && <span className={cn("mx-1 h-px w-6 sm:w-12", done ? "bg-leaf-800" : "bg-sand-400")} aria-hidden="true" />}
          </li>
        );
      })}
    </ol>
  );
}
