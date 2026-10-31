import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import { motion } from "motion/react";
import { ArrowLeft, MessagesSquare, Send } from "lucide-react";
import { Seo } from "../../components/Seo";
import { StatusPill } from "../../components/ui/primitives";
import { Button } from "../../components/ui/button";
import { useAuth } from "../../auth/context";
import { useRealtime, useSocketEvent } from "../../realtime/context";
import { api } from "../../lib/api";
import { newClientId } from "../../lib/chat";
import { formatDateTime } from "../../lib/orders";
import { cn } from "../../lib/cn";

const TONE = { pending: "amber", active: "green", closed: "grey" };
const LABEL = { pending: "Waiting", active: "Active", closed: "Closed" };

function useDeskLists(isAdmin) {
  const [lists, setLists] = useState({ queue: [], mine: [], all: [], loaded: false });
  const [error, setError] = useState("");
  const fetchAll = useCallback(
    () =>
      Promise.all([api("/api/chat/staff/queue"), api("/api/chat/staff/active"), isAdmin ? api("/api/chat/admin/all") : Promise.resolve({ chats: [] })]).then(([q, m, a]) => ({
        queue: q.chats,
        mine: m.chats,
        all: a.chats,
        loaded: true,
      })),
    [isAdmin]
  );
  const reload = useCallback(
    () =>
      fetchAll()
        .then(setLists)
        .catch((err) => setError(err.message)),
    [fetchAll]
  );
  useEffect(() => {
    let cancelled = false;
    fetchAll()
      .then((l) => !cancelled && setLists(l))
      .catch((err) => !cancelled && setError(err.message));
    return () => {
      cancelled = true;
    };
  }, [fetchAll]);
  return { lists, setLists, error, reload };
}

function ChatList({ chats, selectedId, onSelect, empty }) {
  if (!chats.length) return <p className="p-4 text-sm text-ink-500">{empty}</p>;
  return (
    <ul className="flex flex-col gap-0.5 p-2">
      {chats.map((c) => (
        <li key={c.id}>
          <button type="button" onClick={() => onSelect(c.id)} aria-current={c.id === selectedId ? "true" : undefined} className={cn("relative flex w-full gap-3 rounded-xl px-3 py-3 text-left transition-colors hover:bg-panel-muted", c.id === selectedId && "bg-gold-100 hover:bg-gold-100")}>
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gold-100 text-xs font-semibold text-gold-700" aria-hidden="true">
              {(c.customer?.name ?? "C").slice(0, 1).toUpperCase()}
            </span>
            <span className="flex min-w-0 flex-1 flex-col gap-1">
              <span className="flex items-center justify-between gap-2">
                <span className="truncate font-medium text-cocoa-900">{c.customer?.name ?? "Customer"}</span>
                {c.unread > 0 ? (
                  <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-danger-600 px-1 text-[11px] font-semibold text-white">
                    {c.unread}
                    <span className="sr-only"> unread</span>
                  </span>
                ) : (
                  <StatusPill tone={TONE[c.status]}>{LABEL[c.status]}</StatusPill>
                )}
              </span>
              <span className="truncate text-xs text-ink-500">{c.lastMessagePreview || "No messages yet"}</span>
              <span className="text-[11px] text-ink-500">{formatDateTime(c.lastMessageAt)}</span>
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}

function Thread({ chatId, me, onChanged, onBack }) {
  const { socket, connected } = useRealtime();
  const [chat, setChat] = useState(null);
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState("");
  const [customerTyping, setCustomerTyping] = useState(false);
  const list = useRef(null);
  const typingTimer = useRef(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([api(`/api/chat/${chatId}`), api(`/api/chat/${chatId}/messages`)])
      .then(([c, h]) => {
        if (cancelled) return;
        setChat(c.chat);
        setMessages(h.messages);
        setError("");
      })
      .catch((err) => !cancelled && setError(err.message));
    api(`/api/chat/${chatId}/read`, { method: "POST" }).catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [chatId]);

  useEffect(() => {
    if (!socket) return undefined;
    const join = () => socket.emit("chat:join", { chatId }, () => {});
    if (connected) join();
    socket.on("connect", join);
    return () => {
      socket.off("connect", join);
      socket.emit("chat:leave", { chatId }, () => {});
    };
  }, [socket, connected, chatId]);

  useEffect(() => {
    list.current?.scrollTo?.({ top: list.current.scrollHeight });
  }, [messages.length, customerTyping]);

  const onMessage = useCallback(
    (m) => {
      if (m.chatId !== chatId) return;
      setMessages((l) => (l.some((x) => x.id === m.id || (m.clientId && x.clientId === m.clientId)) ? l.map((x) => (x.clientId && x.clientId === m.clientId ? m : x)) : [...l, m]));
      if (m.senderRole === "customer") {
        setCustomerTyping(false);
        socket?.emit("chat:read", { chatId }, () => {});
      }
    },
    [chatId, socket]
  );
  useSocketEvent("chat:message", onMessage);
  const onUpdated = useCallback((c) => c.id === chatId && setChat((cur) => ({ ...cur, ...c })), [chatId]);
  useSocketEvent("chat:staff-updated", onUpdated);
  const onTyping = useCallback(
    (t) => {
      if (t.chatId !== chatId || t.role !== "customer") return;
      setCustomerTyping(true);
      clearTimeout(typingTimer.current);
      typingTimer.current = setTimeout(() => setCustomerTyping(false), 3000);
    },
    [chatId]
  );
  useSocketEvent("chat:typing", onTyping);
  useEffect(() => () => clearTimeout(typingTimer.current), []);

  async function act(path) {
    setError("");
    try {
      const { chat: c } = await api(`/api/chat/${chatId}/${path}`, { method: "POST" });
      setChat(c);
      const h = await api(`/api/chat/${chatId}/messages`);
      setMessages(h.messages);
      onChanged();
    } catch (err) {
      setError(err.message);
      onChanged();
    }
  }

  async function send(e) {
    e?.preventDefault();
    const body = draft.trim();
    if (!body) return;
    setDraft("");
    setError("");
    const clientId = newClientId();
    setMessages((l) => [...l, { id: clientId, clientId, chatId, senderRole: me.role, senderName: "You", body, createdAt: new Date().toISOString(), pending: true }]);
    try {
      const ack = socket && connected ? await new Promise((resolve) => socket.emit("chat:send", { chatId, body, clientId }, resolve)) : { ok: true, ...(await api(`/api/chat/${chatId}/messages`, { method: "POST", body: { body, clientId } })) };
      if (!ack.ok) throw new Error(ack.error?.message ?? "Message not sent");
      setMessages((l) => l.map((m) => (m.clientId === clientId ? ack.message : m)));
    } catch (err) {
      setMessages((l) => l.filter((m) => m.clientId !== clientId));
      setDraft(body);
      setError(err.message);
    }
  }

  if (error && !chat) return <p className="p-6 text-danger-600">{error}</p>;
  if (!chat) return <p className="p-6 text-sm text-ink-500">Loading conversation…</p>;
  const mineActive = chat.status === "active" && (chat.assignedToId === me.id || me.role === "admin");

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-sand-400/70 px-4 py-4 sm:px-5">
        <div className="flex min-w-0 items-start gap-2">
          <button type="button" onClick={onBack} aria-label="Back to conversations" className="-ml-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-cocoa-900 hover:bg-cream-100 md:hidden">
            <ArrowLeft className="h-5 w-5" aria-hidden="true" />
          </button>
          <div className="min-w-0">
            <h2 className="text-lg text-cocoa-900">{chat.customer?.name ?? "Customer"}</h2>
            <p className="text-sm text-ink-500">
              {chat.customer?.email}
              {chat.customer?.phone && ` · +91 ${chat.customer.phone}`}
            </p>
            {chat.orderNumber && (
              <Link to={`/admin/orders?q=${chat.orderNumber}`} className="text-sm font-semibold text-gold-700">
                Order {chat.orderNumber}
              </Link>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <StatusPill tone={TONE[chat.status]}>
            {LABEL[chat.status]}
            {chat.agent && chat.status === "active" ? ` · ${chat.agent.name}` : ""}
          </StatusPill>
          {chat.status === "pending" && (
            <Button size="sm" variant="green" onClick={() => act("accept")}>
              Accept
            </Button>
          )}
          {mineActive && (
            <Button size="sm" variant="outline" onClick={() => act("close")}>
              Close chat
            </Button>
          )}
        </div>
      </header>
      <ol ref={list} aria-label="Conversation" aria-live="polite" className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto bg-panel-muted px-4 py-4 sm:px-5">
        {messages.map((m) =>
          m.senderRole === "system" ? (
            <li key={m.id} className="mx-auto text-center text-xs text-ink-500">
              {m.body}
            </li>
          ) : (
            <motion.li key={m.id} initial={{ opacity: 0, y: 8, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ duration: 0.25 }} className={cn("flex max-w-[85%] flex-col gap-0.5 sm:max-w-[75%]", m.senderRole === "customer" ? "items-start self-start" : "items-end self-end")}>
              <span className="px-1 text-[11px] text-ink-500">{m.senderRole === "customer" ? (chat.customer?.name ?? "Customer") : m.senderId === me.id ? "You" : m.senderName}</span>
              <span className={cn("whitespace-pre-wrap break-words rounded-2xl px-3.5 py-2 text-sm", m.senderRole === "customer" ? "rounded-bl-md border border-sand-400/70 bg-white text-cocoa-900 shadow-[0_1px_2px_rgba(20,13,7,0.04)]" : "rounded-br-md bg-leaf-800 text-white", m.pending && "opacity-70")}>
                {m.body}
              </span>
              <span className="px-1 text-[10px] text-ink-500">{formatDateTime(m.createdAt)}</span>
            </motion.li>
          )
        )}
        {customerTyping && <li className="self-start text-xs text-ink-500">Customer is typing…</li>}
      </ol>
      {error && (
        <p role="alert" className="border-t border-sand-400 bg-danger-50 px-5 py-2 text-sm text-danger-600">
          {error}
        </p>
      )}
      {mineActive ? (
        <form onSubmit={send} className="flex items-end gap-2 border-t border-sand-400/70 bg-white p-3">
          <label htmlFor="desk-reply" className="sr-only">
            Reply
          </label>
          <textarea
            id="desk-reply"
            rows={2}
            maxLength={2000}
            value={draft}
            onChange={(e) => {
              setDraft(e.target.value);
              if (socket && connected) socket.emit("chat:typing", { chatId }, () => {});
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            placeholder="Type a reply… (Enter to send, Shift+Enter for a new line)"
            className="min-h-11 min-w-0 flex-1 resize-none rounded-md border border-sand-400 bg-white px-3 py-2 text-sm focus:outline-none"
          />
          <button type="submit" aria-label="Send reply" disabled={!draft.trim()} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-leaf-800 text-white shadow-[0_2px_6px_-2px_rgba(22,74,43,0.5)] transition-transform hover:bg-leaf-900 active:scale-95 disabled:opacity-45">
            <Send className="h-4 w-4" aria-hidden="true" />
          </button>
        </form>
      ) : (
        <p className="border-t border-sand-400 px-5 py-3 text-sm text-ink-500">{chat.status === "pending" ? "Accept this conversation to reply." : chat.status === "closed" ? "This conversation is closed." : "Assigned to another team member."}</p>
      )}
    </div>
  );
}

export default function SupportDesk() {
  const { user } = useAuth();
  const isAdmin = user.role === "admin";
  const { lists, setLists, error, reload } = useDeskLists(isAdmin);
  const [tab, setTab] = useState("queue");
  const [selected, setSelected] = useState(null);
  const { connected } = useRealtime();

  useSocketEvent("queue:updated", reload);
  const onUpdated = useCallback(() => reload(), [reload]);
  useSocketEvent("chat:staff-updated", onUpdated);
  // Live previews / unread counts in the lists.
  const onMessage = useCallback(
    (m) =>
      setLists((l) => {
        const bump = (arr) => arr.map((c) => (c.id === m.chatId ? { ...c, lastMessagePreview: m.body.slice(0, 140), lastMessageAt: m.createdAt, unread: m.senderRole === "customer" && c.id !== selected ? c.unread + 1 : c.unread } : c));
        return { ...l, queue: bump(l.queue), mine: bump(l.mine), all: bump(l.all) };
      }),
    [setLists, selected]
  );
  useSocketEvent("chat:message", onMessage);

  const tabs = [
    { id: "queue", label: "Queue", chats: lists.queue, empty: "No one is waiting. New conversations appear here instantly." },
    { id: "mine", label: "My chats", chats: lists.mine, empty: "Accept a conversation from the queue to start helping." },
    ...(isAdmin ? [{ id: "all", label: "All chats", chats: lists.all, empty: "No conversations yet." }] : []),
  ];
  const current = tabs.find((t) => t.id === tab) ?? tabs[0];

  return (
    <div className="mx-auto flex h-[calc(100dvh-var(--admin-topbar))] w-full max-w-[1440px] flex-col px-4 py-4 sm:px-6 sm:py-6 lg:px-8">
      <Seo title="Support desk" noindex />
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-[clamp(24px,2.4vw,30px)] leading-tight">Support desk</h1>
        <span className={cn("flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold ring-1 ring-inset", connected ? "bg-leaf-50 text-leaf-800 ring-leaf-800/15" : "bg-white text-ink-500 ring-sand-400")}>
          <span className="relative flex h-2 w-2" aria-hidden="true">
            {connected && <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-leaf-800 opacity-50" />}
            <span className={cn("relative h-2 w-2 rounded-full", connected ? "bg-leaf-800" : "bg-sand-500")} />
          </span>
          {connected ? "Live" : "Connecting…"}
        </span>
      </div>
      {error && (
        <p role="alert" className="mb-3 rounded-md bg-danger-50 px-3.5 py-2.5 text-sm text-danger-600">
          {error}
        </p>
      )}
      <div className="grid min-h-0 flex-1 overflow-hidden rounded-2xl border border-sand-400/70 bg-white shadow-[0_1px_2px_rgba(20,13,7,0.04),0_8px_24px_-12px_rgba(74,44,12,0.10)] md:grid-cols-[300px_1fr] lg:grid-cols-[340px_1fr]">
        <div className={cn("min-h-0 flex-col border-sand-400/70 md:flex md:border-r", selected ? "hidden" : "flex")}>
          <div role="tablist" aria-label="Conversations" className="flex gap-1 border-b border-sand-400/70 p-2">
            {tabs.map((t) => (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={t.id === current.id}
                onClick={() => setTab(t.id)}
                className={cn("relative flex-1 whitespace-nowrap rounded-lg px-2 py-2 text-[13px] font-medium transition-colors", t.id === current.id ? "text-cocoa-900" : "text-ink-500 hover:text-cocoa-900")}
              >
                {t.id === current.id && <motion.span layoutId="desk-tab" className="absolute inset-0 rounded-lg bg-gold-100" transition={{ type: "spring", stiffness: 500, damping: 38 }} aria-hidden="true" />}
                <span className="relative">
                  {t.label} ({t.chats.length})
                </span>
              </button>
            ))}
          </div>
          <div role="tabpanel" aria-label={current.label} className="min-h-0 flex-1 overflow-y-auto">
            {lists.loaded ? <ChatList chats={current.chats} selectedId={selected} onSelect={setSelected} empty={current.empty} /> : <p className="p-4 text-sm text-ink-500">Loading…</p>}
          </div>
        </div>
        <div className={cn("min-h-0", !selected && "hidden md:block")}>
          {selected ? (
            <Thread key={selected} chatId={selected} me={user} onChanged={reload} onBack={() => setSelected(null)} />
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center text-ink-500">
              <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gold-50 text-gold-700 ring-1 ring-inset ring-gold-400/25">
                <MessagesSquare className="h-6 w-6" aria-hidden="true" />
              </span>
              <p>Select a conversation to read and reply.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
