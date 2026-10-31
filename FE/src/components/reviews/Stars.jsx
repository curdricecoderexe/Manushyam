import { useId, useState } from "react";
import { Star } from "../ui/primitives";
import { cn } from "../../lib/cn";

// Read-only star row with an accessible label.
export function Stars({ value, size = "h-4 w-4", className }) {
  const rounded = Math.round(value);
  return (
    <span role="img" aria-label={`${value} out of 5 stars`} className={cn("inline-flex gap-0.5", className)}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Star key={n} filled={n <= rounded} className={size} />
      ))}
    </span>
  );
}

const WORDS = ["", "Poor", "Fair", "Good", "Very good", "Excellent"];

// Rating picker built from real radio buttons (keyboard + screen-reader friendly).
export function StarInput({ value, onChange, error }) {
  const name = useId();
  const [hover, setHover] = useState(0);
  const shown = hover || value;
  return (
    <fieldset className="flex flex-col gap-1.5">
      <legend className="mb-1.5 text-sm font-medium text-cocoa-900">
        Your rating <span className="text-danger-600">*</span>
      </legend>
      <div className="flex items-center gap-1" onMouseLeave={() => setHover(0)}>
        {[1, 2, 3, 4, 5].map((n) => (
          <label key={n} onMouseEnter={() => setHover(n)} className="cursor-pointer rounded p-0.5 has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-gold-500">
            <input type="radio" name={name} value={n} checked={value === n} onChange={() => onChange(n)} className="sr-only" aria-label={`${n} star${n > 1 ? "s" : ""} — ${WORDS[n]}`} />
            <Star filled={n <= shown} className="h-7 w-7" />
          </label>
        ))}
        <span className="ml-2 text-sm text-ink-500" aria-hidden="true">
          {WORDS[shown]}
        </span>
      </div>
      {error && (
        <span role="alert" className="text-xs text-danger-600">
          {error}
        </span>
      )}
    </fieldset>
  );
}
