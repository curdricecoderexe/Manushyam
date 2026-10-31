import { createContext, useContext } from "react";

export const ToastContext = createContext(null);

// toast({ message, tone?: "success" | "error" | "info", action?: { label, to } })
export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used inside <ToastProvider>");
  return ctx;
}
