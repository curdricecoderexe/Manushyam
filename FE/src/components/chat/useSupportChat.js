import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../../lib/api";
import { newClientId } from "../../lib/chat";
import { useRealtime, useSocketEvent } from "../../realtime/context";

const TYPING_SHOW_MS = 3000;

// The signed-in customer's support conversation: resumes the open one (or shows the last closed one),
// loads its history, receives live messages and sends over the socket (REST when offline).
export function useSupportChat({ enabled, open }) {
  const { socket, connected } = useRealtime();
  const [chat, setChat] = useState(null);
  const [ready, setReady] = useState(false);
  const [messages, setMessages] = useState([]);
  const [historyFor, setHistoryFor] = useState(null);
  const [unread, setUnread] = useState(0);
  const [agentTyping, setAgentTyping] = useState(false);
  const [error, setError] = useState("");
  const typingTimer = useRef(null);
  const openRef = useRef(open);
  useEffect(() => {
    openRef.current = open;
  }, [open]);

  // Find the conversation to show: the open one, else the most recent.
  useEffect(() => {
    if (!enabled) return undefined;
    let cancelled = false;
    api("/api/chat/mine")
      .then(({ chats }) => {
        if (cancelled) return;
        const current = chats.find((c) => c.status !== "closed") ?? chats[0] ?? null;
        setChat(current);
        setUnread(current?.unread ?? 0);
        setReady(true);
      })
      .catch(() => !cancelled && setReady(true));
    return () => {
      cancelled = true;
    };
  }, [enabled]);

  // History, loaded the first time the panel opens on a conversation.
  const chatId = chat?.id;
  const chatClosed = chat?.status === "closed";
  useEffect(() => {
    if (!open || !chatId || historyFor === chatId) return undefined;
    let cancelled = false;
    api(`/api/chat/${chatId}/messages`)
      .then((d) => {
        if (cancelled) return;
        setMessages(d.messages);
        setHistoryFor(chatId);
      })
      .catch((err) => !cancelled && setError(err.message));
    return () => {
      cancelled = true;
    };
  }, [open, chatId, historyFor]);

  // Join the conversation's room (and again after every reconnect).
  useEffect(() => {
    if (!socket || !chatId) return undefined;
    const join = () => socket.emit("chat:join", { chatId }, () => {});
    if (connected) join();
    socket.on("connect", join);
    return () => {
      socket.off("connect", join);
      socket.emit("chat:leave", { chatId }, () => {});
    };
  }, [socket, connected, chatId]);

  const markRead = useCallback(() => {
    if (!chatId) return;
    setUnread(0);
    if (socket && connected) socket.emit("chat:read", { chatId }, () => {});
    else api(`/api/chat/${chatId}/read`, { method: "POST" }).catch(() => {});
  }, [socket, connected, chatId]);

  const onMessage = useCallback(
    (msg) => {
      if (msg.chatId !== chatId) return;
      setMessages((list) => {
        if (list.some((m) => m.id === msg.id)) return list;
        // Our own optimistic message coming back: replace it.
        if (msg.clientId && list.some((m) => m.clientId === msg.clientId)) return list.map((m) => (m.clientId === msg.clientId ? msg : m));
        return [...list, msg];
      });
      if (msg.senderRole !== "customer") {
        setAgentTyping(false);
        if (openRef.current) markRead();
        else setUnread((n) => n + 1);
      }
    },
    [chatId, markRead]
  );
  useSocketEvent("chat:message", onMessage);

  const onUpdated = useCallback((c) => setChat((current) => (current && current.id === c.id ? { ...current, ...c } : current)), []);
  useSocketEvent("chat:updated", onUpdated);

  const onTyping = useCallback(
    (t) => {
      if (t.chatId !== chatId || t.role !== "staff") return;
      setAgentTyping(true);
      clearTimeout(typingTimer.current);
      typingTimer.current = setTimeout(() => setAgentTyping(false), TYPING_SHOW_MS);
    },
    [chatId]
  );
  useSocketEvent("chat:typing", onTyping);
  useEffect(() => () => clearTimeout(typingTimer.current), []);

  const lastTyping = useRef(0);
  const notifyTyping = useCallback(() => {
    if (!socket || !connected || !chatId || Date.now() - lastTyping.current < 2500) return;
    lastTyping.current = Date.now();
    socket.emit("chat:typing", { chatId }, () => {});
  }, [socket, connected, chatId]);

  const send = useCallback(
    async (text, context = {}) => {
      const body = text.trim();
      if (!body) return false;
      setError("");
      const clientId = newClientId();
      const optimistic = { id: clientId, clientId, chatId: chatId ?? null, senderRole: "customer", body, createdAt: new Date().toISOString(), pending: true };
      setMessages((list) => [...list, optimistic]);
      const fail = (message) => {
        setMessages((list) => list.map((m) => (m.clientId === clientId ? { ...m, pending: false, failed: true } : m)));
        setError(message);
        return false;
      };
      try {
        // No open conversation yet: the first message starts one (lands in the staff queue).
        if (!chatId || chatClosed) {
          const { chat: created } = await api("/api/chat", { method: "POST", body: { message: body, clientId, ...(context.orderNumber ? { orderNumber: context.orderNumber } : {}) } });
          setChat(created);
          const history = await api(`/api/chat/${created.id}/messages`);
          setMessages(history.messages);
          setHistoryFor(created.id);
          return true;
        }
        if (socket && connected) {
          const ack = await new Promise((resolve) => socket.emit("chat:send", { chatId, body, clientId }, resolve));
          if (!ack?.ok) return fail(ack?.error?.message ?? "Message not sent. Please try again.");
          setMessages((list) => list.map((m) => (m.clientId === clientId ? ack.message : m)));
          return true;
        }
        const { message } = await api(`/api/chat/${chatId}/messages`, { method: "POST", body: { body, clientId } });
        setMessages((list) => list.map((m) => (m.clientId === clientId ? message : m)));
        return true;
      } catch (err) {
        return fail(err.code === "RATE_LIMITED" ? "You’re sending messages too fast. Please slow down." : err.message);
      }
    },
    [chatId, chatClosed, socket, connected]
  );

  const close = useCallback(async () => {
    if (!chatId) return;
    try {
      const { chat: c } = await api(`/api/chat/${chatId}/close`, { method: "POST" });
      setChat(c);
      setHistoryFor(null); // pick up the closing system message
    } catch (err) {
      setError(err.message);
    }
  }, [chatId]);

  const reopen = useCallback(async () => {
    if (!chatId) return;
    try {
      const { chat: c } = await api(`/api/chat/${chatId}/reopen`, { method: "POST" });
      setChat(c);
      setHistoryFor(null);
    } catch (err) {
      setError(err.message);
    }
  }, [chatId]);

  const startNew = useCallback(() => {
    setChat(null);
    setMessages([]);
    setHistoryFor(null);
  }, []);

  return { ready, chat, messages: chat ? messages : messages.filter((m) => m.pending || m.failed), unread, agentTyping, error, connected, send, close, reopen, startNew, markRead, notifyTyping };
}
