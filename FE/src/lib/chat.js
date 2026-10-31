// Opens the support chat widget from anywhere (e.g. "Chat with support" on an order page).
export const OPEN_CHAT_EVENT = "mm:open-chat";

export function openSupportChat(detail = {}) {
  window.dispatchEvent(new CustomEvent(OPEN_CHAT_EVENT, { detail }));
}

export function newClientId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}
