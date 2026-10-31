import { io } from "socket.io-client";
import { API_BASE, getAccessToken } from "./api";

// One Socket.IO connection per tab. The access token is read fresh on every (re)connect, so a
// silently refreshed token is picked up automatically.
export function createSocket() {
  return io(API_BASE || undefined, {
    autoConnect: false,
    withCredentials: true,
    transports: ["websocket", "polling"],
    auth: (cb) => cb({ token: getAccessToken() }),
    reconnectionDelayMax: 10000,
  });
}
