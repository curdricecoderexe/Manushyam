import { useCallback, useMemo, useRef, useState } from "react";
import { Link } from "react-router";
import { X } from "lucide-react";
import { ToastContext } from "./context";
import { cn } from "../lib/cn";

const DURATION_MS = 4000;
const TONES = {
  success: { ring: "border-sand-400", icon: "bg-leaf-50 text-leaf-800", path: "M5 12l5 5 9-10" },
  error: { ring: "border-danger-600/30", icon: "bg-danger-50 text-danger-600", path: "M6 6l12 12M18 6L6 18" },
  info: { ring: "border-gold-300", icon: "bg-gold-50 text-gold-700", path: "M12 8v5M12 16h.01" },
};

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const nextId = useRef(0);

  const dismiss = useCallback((id) => setToasts((list) => list.filter((t) => t.id !== id)), []);
  const toast = useCallback(
    ({ message, tone = "success", action }) => {
      const id = ++nextId.current;
      setToasts((list) => [...list.slice(-2), { id, message, tone, action }]);
      setTimeout(() => dismiss(id), DURATION_MS);
    },
    [dismiss]
  );

  const value = useMemo(() => ({ toast, dismiss, toasts }), [toast, dismiss, toasts]);
  return <ToastContext.Provider value={value}>{children}</ToastContext.Provider>;
}

// Rendered inside the router (actions are links). Errors are announced assertively.
export function Toaster({ toasts, onDismiss }) {
  return (
    <div className="pointer-events-none fixed inset-x-4 top-4 z-[70] flex flex-col items-end gap-3 sm:left-auto sm:right-6 sm:w-[380px]" aria-live="polite">
      {toasts.map((t) => {
        const tone = TONES[t.tone] ?? TONES.success;
        return (
          <div key={t.id} role={t.tone === "error" ? "alert" : "status"} className={cn("pointer-events-auto flex w-full animate-fade-up items-center gap-3 rounded-lg border bg-white px-3.5 py-3 shadow-md", tone.ring)}>
            <span className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-full", tone.icon)} aria-hidden="true">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                <path d={tone.path} />
              </svg>
            </span>
            <span className="flex-1 text-sm text-cocoa-900">
              {t.message}
              {t.action && (
                <Link to={t.action.to} onClick={() => onDismiss(t.id)} className="ml-1.5 font-medium">
                  {t.action.label}
                </Link>
              )}
            </span>
            <button type="button" aria-label="Dismiss" onClick={() => onDismiss(t.id)} className="flex h-8 w-8 items-center justify-center text-ink-500 hover:text-cocoa-900">
              <X className="h-4 w-4" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
