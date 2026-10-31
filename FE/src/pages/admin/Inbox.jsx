import { useEffect, useState } from "react";
import { Download, Mail } from "lucide-react";
import { AdminPage, Panel } from "../../components/admin/AdminPage";
import { DataTable, ErrorNote, FilterSelect, Pager } from "../../components/admin/controls";
import { Tabs } from "../../components/ui/Tabs";
import { Skeleton, StatusPill } from "../../components/ui/primitives";
import { Button } from "../../components/ui/button";
import { useAuth } from "../../auth/context";
import { useToast } from "../../toast/context";
import { useUrlParams } from "../../lib/admin";
import { api } from "../../lib/api";
import { downloadCsv, today } from "../../lib/exporters";
import { formatDate, formatDateTime } from "../../lib/orders";

const MESSAGE_STATUS = { new: ["New", "blue"], read: ["Read", "grey"], replied: ["Replied", "green"], closed: ["Closed", "grey"] };
const SUBJECTS = { orders: "Orders", payments: "Payments", products: "Products", returns: "Returns", account: "Account", collaboration: "Collaboration", other: "Other" };
const SUB_STATUS = { pending: ["Awaiting confirmation", "amber"], subscribed: ["Subscribed", "green"], unsubscribed: ["Unsubscribed", "grey"] };

function Message({ m, onStatus }) {
  const [open, setOpen] = useState(false);
  const [label, tone] = MESSAGE_STATUS[m.status];
  const subject = `Re: your message to ManushyaM (${SUBJECTS[m.subject]})`;
  return (
    <li className="px-5 py-3">
      <button
        type="button"
        aria-expanded={open}
        className="flex w-full flex-wrap items-center gap-2 text-left"
        onClick={() => {
          setOpen((o) => !o);
          if (!open && m.status === "new") onStatus(m, "read");
        }}
      >
        <span className={m.status === "new" ? "font-semibold text-cocoa-900" : "text-cocoa-900"}>{m.name}</span>
        <span className="text-xs text-ink-500">{SUBJECTS[m.subject]}</span>
        <StatusPill tone={tone}>{label}</StatusPill>
        <span className="ml-auto text-xs text-ink-500">{formatDateTime(m.createdAt)}</span>
        {!open && <span className="w-full truncate text-sm text-ink-500">{m.message}</span>}
      </button>
      {open && (
        <div className="mt-2 flex flex-col gap-3 text-sm">
          <p className="whitespace-pre-line text-ink-700">{m.message}</p>
          <p className="text-xs text-ink-500">
            {m.email}
            {m.phone ? ` · +91 ${m.phone}` : ""}
          </p>
          <div className="flex flex-wrap gap-2">
            <a href={`mailto:${m.email}?subject=${encodeURIComponent(subject)}`} onClick={() => onStatus(m, "replied")} className="inline-flex min-h-[40px] items-center gap-2 rounded-md bg-brown-700 px-4 font-serif text-sm text-white hover:bg-brown-800 hover:text-white">
              <Mail className="h-4 w-4" aria-hidden="true" /> Reply by email
            </a>
            {m.status !== "closed" && (
              <Button size="sm" variant="outline" onClick={() => onStatus(m, "closed")}>
                Close
              </Button>
            )}
            {m.status !== "new" && (
              <Button size="sm" variant="outline" onClick={() => onStatus(m, "new")}>
                Mark unread
              </Button>
            )}
          </div>
        </div>
      )}
    </li>
  );
}

function Messages() {
  const { toast } = useToast();
  const { get, setParam } = useUrlParams();
  const status = get("status");
  const page = Number(get("page", "1"));
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let cancelled = false;
    api(`/api/admin/contact-messages?page=${page}${status ? `&status=${status}` : ""}`)
      .then((d) => !cancelled && setData(d))
      .catch((err) => !cancelled && setError(err.message));
    return () => {
      cancelled = true;
    };
  }, [status, page]);
  async function onStatus(m, next) {
    try {
      const { message } = await api(`/api/admin/contact-messages/${m.id}`, { method: "PATCH", body: { status: next } });
      setData((d) => ({ ...d, messages: d.messages.map((x) => (x.id === message.id ? message : x)) }));
    } catch (err) {
      toast({ message: err.message, tone: "error" });
    }
  }
  return (
    <div className="flex flex-col gap-4">
      <FilterSelect label="Show" className="w-48" value={status} onChange={(v) => setParam("status", v)} options={[["", "All messages"], ...Object.entries(MESSAGE_STATUS).map(([k, [l]]) => [k, l])]} />
      <ErrorNote>{error}</ErrorNote>
      <Panel>
        {!data ? (
          <Skeleton className="m-5 h-48" />
        ) : data.messages.length === 0 ? (
          <p className="p-8 text-center text-ink-500">No messages.</p>
        ) : (
          <ul className="divide-y divide-sand-400">
            {data.messages.map((m) => (
              <Message key={m.id} m={m} onStatus={onStatus} />
            ))}
          </ul>
        )}
      </Panel>
      {data && <Pager page={data.page} pages={data.pages} onPage={(p) => setParam("page", String(p))} />}
    </div>
  );
}

function Subscribers() {
  const { toast } = useToast();
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [exporting, setExporting] = useState(false);
  useEffect(() => {
    let cancelled = false;
    api(`/api/admin/newsletter?page=${page}${status ? `&status=${status}` : ""}`)
      .then((d) => !cancelled && setData(d))
      .catch((err) => !cancelled && setError(err.message));
    return () => {
      cancelled = true;
    };
  }, [status, page]);
  // Confirmed subscribers only: they are the ones who agreed to receive email.
  async function exportConfirmed() {
    setExporting(true);
    try {
      const rows = [];
      for (let p = 1; p <= 400; p += 1) {
        const d = await api(`/api/admin/newsletter?status=subscribed&page=${p}`);
        rows.push(...d.subscribers);
        if (p >= d.pages) break;
      }
      downloadCsv(`manushyam-subscribers-${today()}.csv`, [{ header: "email", value: (s) => s.email }, { header: "confirmed_at", value: (s) => s.confirmedAt }, { header: "source", value: (s) => s.source }], rows);
      toast({ message: `Exported ${rows.length} subscribers.` });
    } catch (err) {
      toast({ message: err.message, tone: "error" });
    } finally {
      setExporting(false);
    }
  }
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <FilterSelect
          label="Show"
          className="w-56"
          value={status}
          onChange={(v) => {
            setStatus(v);
            setPage(1);
          }}
          options={[["", "Everyone"], ...Object.entries(SUB_STATUS).map(([k, [l]]) => [k, l])]}
        />
        {data && (
          <p className="text-sm text-ink-700">
            {data.counts.subscribed ?? 0} subscribed · {data.counts.pending ?? 0} awaiting confirmation · {data.counts.unsubscribed ?? 0} unsubscribed
          </p>
        )}
        <Button size="sm" variant="outline" disabled={exporting} onClick={exportConfirmed}>
          <Download className="h-4 w-4" aria-hidden="true" /> Export subscribed (CSV)
        </Button>
      </div>
      <ErrorNote>{error}</ErrorNote>
      <Panel>
        {!data ? (
          <Skeleton className="m-5 h-48" />
        ) : data.subscribers.length === 0 ? (
          <p className="p-8 text-center text-ink-500">No subscribers yet.</p>
        ) : (
          <DataTable caption="Newsletter subscribers" head={["Email", "Status", "Source", "Signed up"]} minWidth={560}>
            {data.subscribers.map((s) => (
              <tr key={s.id}>
                <td>{s.email}</td>
                <td>
                  <StatusPill tone={SUB_STATUS[s.status][1]}>{SUB_STATUS[s.status][0]}</StatusPill>
                </td>
                <td className="text-ink-700">{s.source}</td>
                <td className="text-ink-700">{formatDate(s.createdAt)}</td>
              </tr>
            ))}
          </DataTable>
        )}
      </Panel>
      {data && <Pager page={data.page} pages={data.pages} onPage={setPage} />}
    </div>
  );
}

export default function Inbox() {
  const { user } = useAuth();
  const [tab, setTab] = useState("messages");
  const tabs = [{ id: "messages", label: "Contact messages", content: <Messages /> }];
  // Newsletter lists are admin-only (enforced on the server too).
  if (user.role === "admin") tabs.push({ id: "newsletter", label: "Newsletter", content: <Subscribers /> });
  return (
    <AdminPage title="Inbox" subtitle="Messages from the contact form">
      {tabs.length > 1 ? <Tabs label="Inbox sections" value={tab} onChange={setTab} tabs={tabs} /> : tabs[0].content}
    </AdminPage>
  );
}
