import { useId } from "react";
import { cn } from "../../lib/cn";

// One open item at a time (the design's FAQ pattern). `items`: [{ id, title, content }].
export function Accordion({ items, openId, onToggle, variant = "card", headingLevel = 3 }) {
  const baseId = useId();
  const Heading = `h${headingLevel}`;
  return (
    <div className={cn("flex flex-col", variant === "card" ? "gap-3" : "border-t border-sand-400")}>
      {items.map((item) => {
        const open = item.id === openId;
        const buttonId = `${baseId}-${item.id}-btn`;
        const panelId = `${baseId}-${item.id}-panel`;
        return (
          <div key={item.id} className={variant === "card" ? "overflow-hidden rounded-lg border border-sand-400 bg-cream-50" : "border-b border-sand-400"}>
            <Heading className="m-0">
              <button
                id={buttonId}
                type="button"
                aria-expanded={open}
                aria-controls={panelId}
                onClick={() => onToggle(open ? null : item.id)}
                className={cn(
                  "flex w-full items-center justify-between gap-4 text-left font-serif text-cocoa-900",
                  variant === "card" ? "px-[22px] py-5 text-lg" : "min-h-14 px-4 text-[17px]"
                )}
              >
                {item.title}
                <span aria-hidden="true" className={cn("flex shrink-0 items-center justify-center font-sans text-gold-600", variant === "card" ? "h-[30px] w-[30px] rounded-full border border-[#C9A063] text-xl" : "text-[22px]")}>
                  {open ? "−" : "+"}
                </span>
              </button>
            </Heading>
            <div id={panelId} role="region" aria-labelledby={buttonId} hidden={!open} className={variant === "card" ? "px-[22px] pb-[22px] text-base leading-relaxed" : "px-4 pb-4 text-sm leading-relaxed"}>
              {item.content}
            </div>
          </div>
        );
      })}
    </div>
  );
}
