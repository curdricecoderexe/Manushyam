import { useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { cn } from "../../lib/cn";

const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

// Modal dialog: focus moves in and is trapped, Escape/backdrop close it, focus returns to the opener.
export function Dialog({ open, onClose, title, hideTitle = false, children, className, side }) {
  const panelRef = useRef(null);
  const onCloseRef = useRef(onClose);
  const titleId = useId();

  // Callers pass inline handlers; keep the latest without re-running the open/close effect.
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open) return undefined;
    const opener = document.activeElement;
    const panel = panelRef.current;
    panel?.querySelector(FOCUSABLE)?.focus();
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const onKey = (e) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onCloseRef.current();
      } else if (e.key === "Tab" && panel) {
        const items = [...panel.querySelectorAll(FOCUSABLE)];
        if (!items.length) return;
        const first = items[0];
        const last = items[items.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
      opener?.focus?.();
    };
  }, [open]);

  if (!open) return null;
  return createPortal(
    <div className={cn("fixed inset-0 z-[60] flex bg-cocoa-950/70", side === "left" ? "justify-start" : side === "right" ? "justify-end" : "items-center justify-center p-4")} onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={cn(
          "relative flex max-h-full flex-col overflow-y-auto bg-cream-50 shadow-lg",
          side === "left" ? "h-full w-[min(88vw,360px)] animate-fade-up" : side === "right" ? "h-full w-[min(92vw,420px)] animate-fade-up" : "w-full max-w-3xl rounded-lg",
          className
        )}
      >
        <div className={cn("flex items-center justify-between gap-4 border-b border-sand-400 px-5 py-3", hideTitle && "sr-only")}>
          <h2 id={titleId} className="text-xl">
            {title}
          </h2>
          {!hideTitle && (
            <button type="button" onClick={onClose} aria-label="Close" className="flex h-11 w-11 items-center justify-center text-cocoa-900">
              <X strokeWidth={1.7} />
            </button>
          )}
        </div>
        {hideTitle && (
          <button type="button" onClick={onClose} aria-label="Close" className="absolute right-3 top-3 z-10 flex h-11 w-11 items-center justify-center rounded-full bg-white/90 text-cocoa-900 shadow-sm">
            <X strokeWidth={1.7} />
          </button>
        )}
        {children}
      </div>
    </div>,
    document.body
  );
}
