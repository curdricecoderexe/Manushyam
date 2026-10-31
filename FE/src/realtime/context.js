import { createContext, useContext, useEffect } from "react";

export const RealtimeContext = createContext({ socket: null, connected: false });

export function useRealtime() {
  return useContext(RealtimeContext);
}

// Subscribes to a server event while mounted (and while a socket exists).
export function useSocketEvent(event, handler) {
  const { socket } = useRealtime();
  useEffect(() => {
    if (!socket) return undefined;
    socket.on(event, handler);
    return () => socket.off(event, handler);
  }, [socket, event, handler]);
}
