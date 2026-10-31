import { useRef } from "react";
import { cn } from "../../lib/cn";

// Six single-digit boxes that behave like one field: typing advances, Backspace goes back, paste fills all.
export function OtpInput({ value, onChange, length = 6, invalid = false, autoFocus = true, label = "Verification code" }) {
  const refs = useRef([]);
  const digits = Array.from({ length }, (_, i) => value[i] ?? "");

  function setAt(i, d) {
    const next = digits.slice();
    next[i] = d;
    onChange(next.join("").slice(0, length));
  }

  function onInput(i, e) {
    const v = e.target.value.replace(/\D/g, "");
    if (!v) return setAt(i, "");
    if (v.length > 1) {
      // Autofill / paste into a single box.
      onChange((digits.slice(0, i).join("") + v).slice(0, length));
      refs.current[Math.min(length - 1, i + v.length)]?.focus();
      return undefined;
    }
    setAt(i, v);
    refs.current[i + 1]?.focus();
    return undefined;
  }

  function onKeyDown(i, e) {
    if (e.key === "Backspace" && !digits[i] && i > 0) {
      setAt(i - 1, "");
      refs.current[i - 1]?.focus();
    } else if (e.key === "ArrowLeft" && i > 0) refs.current[i - 1]?.focus();
    else if (e.key === "ArrowRight" && i < length - 1) refs.current[i + 1]?.focus();
  }

  function onPaste(e) {
    const text = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, length);
    if (!text) return;
    e.preventDefault();
    onChange(text);
    refs.current[Math.min(length - 1, text.length)]?.focus();
  }

  return (
    <fieldset className="grid grid-cols-6 gap-2.5" onPaste={onPaste}>
      <legend className="sr-only">{label}</legend>
      {digits.map((d, i) => (
        <input
          key={i}
          ref={(el) => {
            refs.current[i] = el;
          }}
          aria-label={`Digit ${i + 1}`}
          aria-invalid={invalid ? "true" : undefined}
          inputMode="numeric"
          autoComplete={i === 0 ? "one-time-code" : "off"}
          autoFocus={autoFocus && i === 0}
          maxLength={length}
          value={d}
          onChange={(e) => onInput(i, e)}
          onKeyDown={(e) => onKeyDown(i, e)}
          className={cn(
            "h-[60px] min-w-0 rounded-md border bg-white text-center font-serif text-2xl text-cocoa-900 focus:border-gold-500 focus:outline-none focus:ring-[3px] focus:ring-gold-500/20",
            invalid ? "border-danger-600" : d ? "border-gold-600" : "border-sand-400"
          )}
        />
      ))}
    </fieldset>
  );
}
