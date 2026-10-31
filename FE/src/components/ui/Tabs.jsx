import { useId, useRef } from "react";
import { cn } from "../../lib/cn";

// WAI-ARIA tabs with arrow-key navigation (getdesign.md §7.8). `tabs`: [{ id, label, icon?, content }].
export function Tabs({ tabs, value, onChange, label, className }) {
  const baseId = useId();
  const listRef = useRef(null);
  const index = Math.max(0, tabs.findIndex((t) => t.id === value));

  const onKeyDown = (e) => {
    const keys = { ArrowRight: 1, ArrowLeft: -1, Home: "first", End: "last" };
    if (!(e.key in keys)) return;
    e.preventDefault();
    const step = keys[e.key];
    const next = step === "first" ? 0 : step === "last" ? tabs.length - 1 : (index + step + tabs.length) % tabs.length;
    onChange(tabs[next].id);
    listRef.current?.querySelectorAll('[role="tab"]')[next]?.focus();
  };

  return (
    <div className={className}>
      <div ref={listRef} role="tablist" aria-label={label} onKeyDown={onKeyDown} className="flex gap-x-7 overflow-x-auto border-b border-sand-400 [scrollbar-width:none]">
        {tabs.map((t, i) => {
          const selected = i === index;
          return (
            <button
              key={t.id}
              id={`${baseId}-tab-${t.id}`}
              type="button"
              role="tab"
              aria-selected={selected}
              aria-controls={`${baseId}-panel-${t.id}`}
              tabIndex={selected ? 0 : -1}
              onClick={() => onChange(t.id)}
              className={cn(
                "-mb-px flex shrink-0 items-center gap-2 whitespace-nowrap border-b-[3px] px-1 pb-3.5 pt-[18px] font-serif text-[17px] transition-colors",
                selected ? "border-brown-700 text-cocoa-900" : "border-transparent text-ink-500 hover:text-cocoa-900"
              )}
            >
              {t.icon}
              {t.label}
            </button>
          );
        })}
      </div>
      {tabs.map((t, i) => (
        <div key={t.id} id={`${baseId}-panel-${t.id}`} role="tabpanel" aria-labelledby={`${baseId}-tab-${t.id}`} hidden={i !== index} tabIndex={0} className="pt-7 focus-visible:outline-none">
          {i === index && t.content}
        </div>
      ))}
    </div>
  );
}
