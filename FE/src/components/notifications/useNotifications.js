import { useCallback, useEffect, useState } from "react";
import { api } from "../../lib/api";
import { useSocketEvent } from "../../realtime/context";

const POLL_MS = 30 * 1000;

// Latest notifications + unread count: polled every 30 s while the tab is visible, and updated
// instantly by socket pushes when connected.
export function useNotifications({ limit = 10, enabled = true } = {}) {
  const [data, setData] = useState({ notifications: [], unreadCount: 0, loaded: false });
  const [error, setError] = useState("");

  const load = useCallback(
    () =>
      api(`/api/notifications?limit=${limit}`)
        .then((d) => {
          setData({ notifications: d.notifications, unreadCount: d.unreadCount, loaded: true });
          setError("");
        })
        .catch((err) => setError(err.message)),
    [limit]
  );

  useEffect(() => {
    if (!enabled) return undefined;
    api(`/api/notifications?limit=${limit}`)
      .then((d) => setData({ notifications: d.notifications, unreadCount: d.unreadCount, loaded: true }))
      .catch((err) => setError(err.message));
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") load();
    }, POLL_MS);
    const onVisible = () => document.visibilityState === "visible" && load();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [enabled, limit, load]);

  const onNew = useCallback(
    (n) =>
      setData((d) => (d.notifications.some((x) => x.id === n.id) ? d : { ...d, notifications: [n, ...d.notifications].slice(0, limit), unreadCount: d.unreadCount + (n.read ? 0 : 1) })),
    [limit]
  );
  useSocketEvent("notification:new", onNew);
  useSocketEvent("notification:read", load);

  const markRead = useCallback(async (id) => {
    setData((d) => {
      const target = d.notifications.find((n) => n.id === id);
      if (!target || target.read) return d;
      return { ...d, notifications: d.notifications.map((n) => (n.id === id ? { ...n, read: true } : n)), unreadCount: Math.max(0, d.unreadCount - 1) };
    });
    await api(`/api/notifications/${id}/read`, { method: "POST" }).catch(() => {});
  }, []);

  const markAllRead = useCallback(async () => {
    setData((d) => ({ ...d, notifications: d.notifications.map((n) => ({ ...n, read: true })), unreadCount: 0 }));
    await api("/api/notifications/read-all", { method: "POST" }).catch(() => {});
  }, []);

  return { ...data, error, reload: load, markRead, markAllRead };
}
