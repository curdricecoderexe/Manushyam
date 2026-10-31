// In tests the real socket.io-client is replaced with this in-memory fake (see setup.js).
// `serverEmit` simulates a push from the server; `handle(event, fn)` answers client events (acks).
export const sockets = [];
const handlers = new Map();

export function onClientEvent(event, fn) {
  handlers.set(event, fn);
}

export function lastSocket() {
  return sockets[sockets.length - 1];
}

export function resetFakeSockets() {
  sockets.length = 0;
  handlers.clear();
}

class FakeSocket {
  constructor() {
    this.listeners = new Map();
    this.connected = false;
    this.sent = [];
    sockets.push(this);
  }
  on(event, fn) {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set());
    this.listeners.get(event).add(fn);
    return this;
  }
  off(event, fn) {
    this.listeners.get(event)?.delete(fn);
    return this;
  }
  connect() {
    this.connected = true;
    queueMicrotask(() => this.serverEmit("connect"));
    return this;
  }
  disconnect() {
    this.connected = false;
    return this;
  }
  emit(event, payload, ack) {
    this.sent.push({ event, payload });
    const handler = handlers.get(event);
    const reply = handler ? handler(payload, this) : { ok: true };
    if (typeof ack === "function") Promise.resolve(reply).then((r) => ack(r));
    return this;
  }
  serverEmit(event, payload) {
    for (const fn of [...(this.listeners.get(event) ?? [])]) fn(payload);
  }
}

export function createSocket() {
  return new FakeSocket();
}
