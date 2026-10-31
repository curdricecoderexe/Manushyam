import { useCallback, useEffect, useState } from "react";
import { useMediaQuery } from "../hooks/useMediaQuery";

// Admin colour theme: "light", "dark" or "system" (follows the OS). Remembered per browser.
const KEY = "mm_admin_theme";
export const THEMES = ["light", "dark", "system"];

function readTheme() {
  try {
    const saved = localStorage.getItem(KEY);
    return THEMES.includes(saved) ? saved : "system";
  } catch {
    return "system";
  }
}

// Inter is the admin's UI face; it is only fetched once someone opens the admin, so shoppers never download it.
const INTER = "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap";
function loadAdminFont() {
  if (typeof document === "undefined" || document.querySelector(`link[href="${INTER}"]`)) return;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = INTER;
  document.head.appendChild(link);
}

export function useAdminTheme() {
  useEffect(loadAdminFont, []);
  const [theme, setThemeState] = useState(readTheme);
  const prefersDark = useMediaQuery("(prefers-color-scheme: dark)");
  const resolved = theme === "system" ? (prefersDark ? "dark" : "light") : theme;

  // The classes live on <html> so portalled dialogs pick them up; they go away when the admin unmounts.
  useEffect(() => {
    const root = document.documentElement;
    root.classList.add("admin-ui");
    root.classList.toggle("admin-dark", resolved === "dark");
    const meta = document.querySelector('meta[name="theme-color"]');
    const previous = meta?.getAttribute("content");
    meta?.setAttribute("content", resolved === "dark" ? "#0C1310" : "#F2F0EB");
    return () => {
      root.classList.remove("admin-ui", "admin-dark");
      if (meta && previous) meta.setAttribute("content", previous);
    };
  }, [resolved]);

  const setTheme = useCallback((next) => {
    const root = document.documentElement;
    root.classList.add("admin-theme-switching");
    setTimeout(() => root.classList.remove("admin-theme-switching"), 400);
    try {
      localStorage.setItem(KEY, next);
    } catch {
      // Private mode: the choice lasts for this visit only.
    }
    setThemeState(next);
  }, []);

  return { theme, resolved, setTheme };
}
