import { useEffect, useMemo, useState } from "react";
import { RealtimeContext } from "./context";
import { useAuth } from "../auth/context";
import { refreshSession } from "../lib/api";

// Connects the socket while someone is signed in and tears it down on sign-out. The client library
// is loaded on demand, so guests never download it.
export function RealtimeProvider({ children }) {
  const { status, user } = useAuth();
  const userId = status === "authenticated" ? user?.id : null;
  const [socket, setSocket] = useState(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    if (!userId) return undefined;
    let cancelled = false;
    let s = null;
    let refreshing = false;
    // The server rejected or dropped us because the access token expired: refresh and reconnect.
    const renew = async () => {
      if (refreshing || !s) return;
      refreshing = true;
      try {
        await refreshSession();
        s.connect();
      } catch {
        // Signed out elsewhere; the auth provider handles it.
      } finally {
        refreshing = false;
      }
    };
    const onConnect = () => setConnected(true);
    const onDisconnect = () => setConnected(false);
    const onError = (err) => err?.message === "UNAUTHORIZED" && renew();

    import("../lib/socket").then(({ createSocket }) => {
      if (cancelled) return;
      s = createSocket();
      s.on("connect", onConnect);
      s.on("disconnect", onDisconnect);
      s.on("connect_error", onError);
      s.on("auth:expired", renew);
      s.connect();
      setSocket(s);
    });
    return () => {
      cancelled = true;
      if (s) {
        s.off("connect", onConnect);
        s.off("disconnect", onDisconnect);
        s.off("connect_error", onError);
        s.off("auth:expired", renew);
        s.disconnect();
      }
      setSocket(null);
      setConnected(false);
    };
  }, [userId]);

  const value = useMemo(() => ({ socket, connected: Boolean(socket) && connected }), [socket, connected]);
  return <RealtimeContext.Provider value={value}>{children}</RealtimeContext.Provider>;
}
