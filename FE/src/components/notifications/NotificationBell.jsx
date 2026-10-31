import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router";
import { Bell } from "lucide-react";
import { useNotifications } from "./useNotifications";
import { formatDateTime } from "../../lib/orders";
import { cn } from "../../lib/cn";

// Bell with unread badge and a dropdown of the latest notifications.
export function NotificationBell({ tone = "light", seeAllHref }) {
  const { notifications, unreadCount, loaded, markRead, markAllRead } = useNotifications({ limit: 8 });
  const [open, setOpen] = useState(false);
  const box = useRef(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => box.current && !box.current.contains(e.target) && setOpen(false);
    const onKey = (e) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function openItem(n) {
    markRead(n.id);
    setOpen(false);
    if (n.link) navigate(n.link);
  }

  return (
    <div ref={box} className="relative">
      <button
        type="button"
        aria-label={`Notifications${unreadCount ? `, ${unreadCount} unread` : ""}`}
        aria-expanded={open}
        aria-controls="notification-panel"
        onClick={() => setOpen((o) => !o)}
        className={cn("relative flex h-11 w-11 items-center justify-center", tone === "dark" ? "text-[#E9DEC9] hover:text-[#F3D9A8]" : "text-cocoa-900 hover:text-gold-700")}
      >
        <Bell strokeWidth={1.6} className="h-[22px] w-[22px]" />
        {unreadCount > 0 && (
          <span className="absolute right-1 top-1.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-danger-600 px-1 text-[11px] font-semibold text-white" aria-hidden="true">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>
      {open && (
        <div id="notification-panel" role="region" aria-label="Notifications" className={cn("absolute z-50 mt-1 w-[340px] max-w-[calc(100vw-2rem)] rounded-lg border border-sand-400 bg-cream-50 text-left shadow-lg", tone === "dark" ? "left-0" : "right-0")}>
          <div className="flex items-center justify-between border-b border-sand-400 px-4 py-3">
            <h2 className="font-serif text-lg text-cocoa-900">Notifications</h2>
            {unreadCount > 0 && (
              <button type="button" onClick={markAllRead} className="text-xs font-semibold text-gold-700">
                Mark all as read
              </button>
            )}
          </div>
          {!loaded ? (
            <p className="px-4 py-6 text-sm text-ink-500">Loading…</p>
          ) : notifications.length === 0 ? (
            <p className="px-4 py-6 text-sm text-ink-500">You’re all caught up. Order and support updates will appear here.</p>
          ) : (
            <ul className="max-h-[360px] overflow-y-auto">
              {notifications.map((n) => (
                <li key={n.id} className="border-b border-sand-400 last:border-0">
                  <button type="button" onClick={() => openItem(n)} className={cn("flex w-full gap-3 px-4 py-3 text-left hover:bg-cream-200", !n.read && "bg-gold-50")}>
                    <span className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-full", n.read ? "bg-transparent" : "bg-gold-600")} aria-hidden="true" />
                    <span className="flex min-w-0 flex-col gap-0.5">
                      <span className={cn("text-sm", n.read ? "text-ink-700" : "font-semibold text-cocoa-900")}>
                        {n.title}
                        {!n.read && <span className="sr-only"> (unread)</span>}
                      </span>
                      {n.body && <span className="text-xs text-ink-500">{n.body}</span>}
                      <span className="text-[11px] text-ink-500">{formatDateTime(n.createdAt)}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {seeAllHref && (
            <Link to={seeAllHref} onClick={() => setOpen(false)} className="block border-t border-sand-400 px-4 py-3 text-center text-sm font-semibold text-gold-700">
              See all notifications
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
