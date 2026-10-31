import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useMatch, useSearchParams } from "react-router";
import { MessageCircle, X, Send } from "lucide-react";
import { useAuth } from "../../auth/context";
import { useSupportChat } from "./useSupportChat";
import { OPEN_CHAT_EVENT } from "../../lib/chat";
import { CONTACT } from "../../data/site";
import { buttonVariants } from "../ui/button-variants";
import { cn } from "../../lib/cn";

const MAX = 2000;
const time = (iso) => new Date(iso).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" });

function StatusLine({ chat, connected }) {
  if (!chat) return <span>We usually reply within a few minutes</span>;
  if (chat.status === "pending") return <span>Waiting for the next available team member…</span>;
  if (chat.status === "active") return <span>{chat.agent ? `Chatting with ${chat.agent.name}` : "Connected"}{connected ? "" : " · reconnecting…"}</span>;
  return <span>This conversation is closed</span>;
}

function Message({ m }) {
  if (m.senderRole === "system") {
    return (
      <li className="mx-auto max-w-[90%] text-center text-xs text-ink-500" role="note">
        {m.body}
      </li>
    );
  }
  const mine = m.senderRole === "customer";
  return (
    <li className={cn("flex max-w-[85%] flex-col gap-0.5", mine ? "items-end self-end" : "items-start self-start")}>
      {!mine && <span className="px-1 text-[11px] text-ink-500">{m.senderName ?? "ManushyaM"}</span>}
      <span className={cn("whitespace-pre-wrap break-words rounded-2xl px-3.5 py-2 text-sm", mine ? "rounded-br-sm bg-brown-700 text-white" : "rounded-bl-sm border border-sand-400 bg-white text-cocoa-900", m.pending && "opacity-70")}>
        {m.body}
      </span>
      <span className={cn("px-1 text-[10px]", m.failed ? "text-danger-600" : "text-ink-500")}>{m.failed ? "Not sent" : m.pending ? "Sending…" : time(m.createdAt)}</span>
    </li>
  );
}

function Conversation({ open, orderNumber, support }) {
  const { ready, chat, messages, agentTyping, error, connected, send, close, reopen, startNew, notifyTyping } = support;
  const [draft, setDraft] = useState("");
  const [confirmClose, setConfirmClose] = useState(false);
  const list = useRef(null);

  // Keep the newest message in view.
  useEffect(() => {
    list.current?.scrollTo?.({ top: list.current.scrollHeight });
  }, [messages.length, agentTyping, open]);

  // Warn before leaving the page with an unsent message.
  useEffect(() => {
    if (!draft.trim()) return undefined;
    const warn = (e) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [draft]);

  async function submit(e) {
    e?.preventDefault();
    const text = draft;
    if (!text.trim()) return;
    setDraft("");
    const ok = await send(text, { orderNumber });
    if (!ok) setDraft(text);
  }

  const closed = chat?.status === "closed";
  return (
    <>
      <div className="flex items-center justify-between gap-2 border-b border-sand-400 bg-cream-200 px-4 py-2 text-xs text-ink-700" role="status">
        <StatusLine chat={chat} connected={connected} />
        {chat && !closed && (
          <button type="button" onClick={() => setConfirmClose(true)} className="font-semibold text-gold-700">
            End chat
          </button>
        )}
      </div>
      {confirmClose && (
        <div className="flex items-center justify-between gap-2 border-b border-sand-400 bg-gold-50 px-4 py-2 text-sm">
          <span>End this conversation?</span>
          <span className="flex gap-3">
            <button
              type="button"
              className="font-semibold text-danger-600"
              onClick={() => {
                setConfirmClose(false);
                close();
              }}
            >
              End
            </button>
            <button type="button" className="font-semibold text-gold-700" onClick={() => setConfirmClose(false)}>
              Keep chatting
            </button>
          </span>
        </div>
      )}
      <ol ref={list} aria-label="Messages" aria-live="polite" className="flex flex-1 flex-col gap-3 overflow-y-auto px-4 py-4">
        {!ready ? (
          <li className="text-center text-sm text-ink-500">Loading…</li>
        ) : !chat && messages.length === 0 ? (
          <li className="flex flex-col items-center gap-2 py-6 text-center text-sm">
            <span className="font-serif text-lg text-cocoa-900">Namaste! How can we help?</span>
            <span className="text-ink-500">Ask about your order, our therapies or your hair-care routine. A team member will join you shortly.</span>
            {orderNumber && <span className="rounded-full bg-cream-200 px-3 py-1 text-xs text-cocoa-900">About order {orderNumber}</span>}
          </li>
        ) : (
          messages.map((m) => <Message key={m.id} m={m} />)
        )}
        {agentTyping && <li className="self-start text-xs text-ink-500">{chat?.agent?.name ?? "Support"} is typing…</li>}
      </ol>
      {error && (
        <p role="alert" className="border-t border-sand-400 bg-danger-50 px-4 py-2 text-xs text-danger-600">
          {error}
        </p>
      )}
      {closed ? (
        <div className="flex gap-2 border-t border-sand-400 p-3">
          <button type="button" onClick={reopen} className={cn(buttonVariants({ variant: "brown", size: "sm" }), "flex-1")}>
            Reopen conversation
          </button>
          <button type="button" onClick={startNew} className={cn(buttonVariants({ variant: "outline", size: "sm" }), "flex-1")}>
            New conversation
          </button>
        </div>
      ) : (
        <form onSubmit={submit} className="flex items-end gap-2 border-t border-sand-400 p-3">
          <label htmlFor="chat-input" className="sr-only">
            Type your message
          </label>
          <textarea
            id="chat-input"
            rows={1}
            maxLength={MAX}
            value={draft}
            placeholder="Type your message…"
            onChange={(e) => {
              setDraft(e.target.value);
              notifyTyping();
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                submit();
              }
            }}
            className="max-h-28 min-h-11 flex-1 resize-none rounded-md border border-sand-400 bg-white px-3 py-2.5 text-sm text-cocoa-900 focus:border-gold-600 focus:outline-none"
          />
          <button type="submit" aria-label="Send message" disabled={!draft.trim()} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md bg-brown-700 text-white disabled:opacity-45">
            <Send className="h-4 w-4" aria-hidden="true" />
          </button>
        </form>
      )}
      {draft.length > MAX - 200 && <p className="px-3 pb-2 text-right text-[11px] text-ink-500">{MAX - draft.length} characters left</p>}
    </>
  );
}

// Floating support chat for customers (staff use the support desk). WhatsApp stays as the alternative.
export function ChatWidget() {
  const { status, user } = useAuth();
  const location = useLocation();
  const [params] = useSearchParams();
  const onProductPage = useMatch("/solutions/:slug");
  const [open, setOpen] = useState(() => params.get("chat") === "open");
  const [orderNumber, setOrderNumber] = useState(null);
  const customer = status === "authenticated" && user.role === "customer";

  useEffect(() => {
    const onOpen = (e) => {
      setOrderNumber(e.detail?.orderNumber ?? null);
      setOpen(true);
    };
    window.addEventListener(OPEN_CHAT_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_CHAT_EVENT, onOpen);
  }, []);

  if (status === "authenticated" && user.role !== "customer") return null;

  const panelProps = { open, onClose: () => setOpen(false), onToggle: () => setOpen((o) => !o), onProductPage: Boolean(onProductPage) };
  return customer ? (
    <CustomerChat {...panelProps} orderNumber={orderNumber} />
  ) : (
    <Shell {...panelProps}>
      <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
        <p className="font-serif text-xl text-cocoa-900">Chat with our team</p>
        <p className="text-sm">Sign in so we can see your orders and keep your conversation history.</p>
        <Link to={`/login?next=${encodeURIComponent(`${location.pathname}?chat=open`)}`} className={buttonVariants({ variant: "brown", size: "sm" })}>
          Sign in to chat
        </Link>
        <a href={`https://wa.me/${CONTACT.whatsapp}`} target="_blank" rel="noopener noreferrer" className="text-sm font-semibold text-gold-700">
          Or message us on WhatsApp
        </a>
      </div>
    </Shell>
  );
}

// Signed-in customer: one conversation state shared by the launcher badge and the panel.
function CustomerChat({ open, onClose, onToggle, onProductPage, orderNumber }) {
  const support = useSupportChat({ enabled: true, open });
  const { markRead, unread } = support;
  // Anything shown while the panel was open has been seen.
  const close = () => {
    markRead();
    onClose();
  };
  const toggle = () => {
    markRead();
    onToggle();
  };
  return (
    <Shell open={open} onClose={close} onToggle={toggle} onProductPage={onProductPage} badge={open ? 0 : unread}>
      <Conversation open={open} orderNumber={orderNumber} support={support} />
    </Shell>
  );
}

// Launcher button + panel frame.
function Shell({ open, onClose, onToggle, onProductPage, badge = 0, children }) {
  return (
    <>
      <button
        type="button"
        aria-label={open ? "Close support chat" : `Chat with ManushyaM support${badge ? `, ${badge} new` : ""}`}
        aria-expanded={open}
        aria-controls="support-chat"
        onClick={onToggle}
        className={cn("fixed bottom-[100px] right-6 z-40 flex h-[60px] w-[60px] items-center justify-center rounded-full bg-brown-700 text-white shadow-lg transition-transform hover:scale-105", onProductPage && "max-md:bottom-[172px]")}
      >
        {open ? <X className="h-6 w-6" aria-hidden="true" /> : <MessageCircle className="h-7 w-7" strokeWidth={1.6} aria-hidden="true" />}
        {badge > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-danger-600 px-1 text-[11px] font-semibold text-white" aria-hidden="true">
            {badge}
          </span>
        )}
      </button>
      {open && (
        <section
          id="support-chat"
          role="dialog"
          aria-label="ManushyaM support chat"
          className="fixed inset-x-0 bottom-0 z-50 flex h-[85vh] flex-col overflow-hidden rounded-t-xl border border-sand-400 bg-cream-50 shadow-xl sm:inset-x-auto sm:bottom-[176px] sm:right-6 sm:h-[540px] sm:max-h-[calc(100vh-200px)] sm:w-[380px] sm:rounded-xl"
          onKeyDown={(e) => e.key === "Escape" && onClose()}
        >
          <header className="flex items-center justify-between bg-brown-700 px-4 py-3 text-white">
            <div>
              <h2 className="font-serif text-lg text-white">ManushyaM Support</h2>
              <p className="text-xs text-white/80">Ayurvedic hair-care help, 9 am – 7 pm</p>
            </div>
            <button type="button" aria-label="Close support chat" onClick={onClose} className="flex h-10 w-10 items-center justify-center rounded-full hover:bg-white/10">
              <X className="h-5 w-5" aria-hidden="true" />
            </button>
          </header>
          {children}
        </section>
      )}
    </>
  );
}
