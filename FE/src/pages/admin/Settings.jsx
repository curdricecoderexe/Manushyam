import { Fragment, useEffect, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { AdminPage, Panel } from "../../components/admin/AdminPage";
import { DataTable, ErrorNote, FilterSelect, Pager } from "../../components/admin/controls";
import { Tabs } from "../../components/ui/Tabs";
import { Field, Skeleton, StatusPill } from "../../components/ui/primitives";
import { Button } from "../../components/ui/button";
import { useToast } from "../../toast/context";
import { useUrlParams } from "../../lib/admin";
import { api } from "../../lib/api";
import { clearQueryCache } from "../../lib/query";
import { formatDateTime } from "../../lib/orders";

function SiteSettings() {
  const { toast } = useToast();
  const [v, setV] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    api("/api/admin/settings")
      .then(({ settings }) => setV({ announcements: settings.announcements, heroSubline: settings.heroSubline, ratingValue: String(settings.rating.value), ratingSource: settings.rating.source, trustedBy: settings.trustedBy }))
      .catch((err) => setError(err.message));
  }, []);
  if (!v) return error ? <ErrorNote>{error}</ErrorNote> : <Skeleton className="h-64" />;
  const bind = (k) => ({ value: v[k], onChange: (e) => setV((s) => ({ ...s, [k]: e.target.value })) });
  const setAnn = (i, text) => setV((s) => ({ ...s, announcements: s.announcements.map((a, j) => (j === i ? text : a)) }));

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api("/api/admin/settings", {
        method: "PUT",
        body: { announcements: v.announcements.map((a) => a.trim()).filter(Boolean), heroSubline: v.heroSubline, rating: { value: Number(v.ratingValue), source: v.ratingSource }, trustedBy: v.trustedBy },
      });
      clearQueryCache();
      toast({ message: "Store settings saved." });
    } catch (err) {
      setError(err.details?.length ? `${err.message}: ${err.details.map((d) => `${d.path} ${d.message}`).join("; ")}` : err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form aria-label="Store settings" onSubmit={submit} className="flex max-w-3xl flex-col gap-6">
      <Panel title="Announcement bar">
        <div className="flex flex-col gap-3 p-5">
          <p className="text-sm text-ink-500">Short messages that rotate at the top of every page (up to 6, 60 characters each).</p>
          {v.announcements.map((a, i) => (
            <div key={i} className="flex items-end gap-2">
              <Field label={`Message ${i + 1}`} value={a} maxLength={60} onChange={(e) => setAnn(i, e.target.value)} className="flex-1" />
              <Button type="button" size="icon" variant="danger" className="mb-1" aria-label={`Remove message ${i + 1}`} onClick={() => setV((s) => ({ ...s, announcements: s.announcements.filter((_, j) => j !== i) }))}>
                <Trash2 className="h-4 w-4" aria-hidden="true" />
              </Button>
            </div>
          ))}
          {v.announcements.length < 6 && (
            <Button type="button" size="sm" variant="outline" className="self-start" onClick={() => setV((s) => ({ ...s, announcements: [...s.announcements, ""] }))}>
              <Plus className="h-4 w-4" aria-hidden="true" /> Add message
            </Button>
          )}
        </div>
      </Panel>
      <Panel title="Homepage">
        <div className="grid gap-4 p-5 sm:grid-cols-2">
          <Field label="Hero subline" maxLength={120} {...bind("heroSubline")} className="sm:col-span-2" />
          <Field label="Rating shown" type="number" min="0" max="5" step="0.1" {...bind("ratingValue")} />
          <Field label="Rating source" maxLength={60} {...bind("ratingSource")} hint="e.g. on Amazon & Flipkart" />
          <Field label="Trusted-by line" maxLength={120} {...bind("trustedBy")} className="sm:col-span-2" />
        </div>
      </Panel>
      <ErrorNote>{error}</ErrorNote>
      <Button type="submit" variant="brown" size="sm" disabled={busy} className="self-start">
        Save settings
      </Button>
    </form>
  );
}

const show = (v) => (v === undefined ? "—" : typeof v === "string" ? v : JSON.stringify(v));

function Changes({ entry }) {
  const keys = [...new Set([...Object.keys(entry.before ?? {}), ...Object.keys(entry.after ?? {})])];
  if (!keys.length) return <p className="text-xs text-ink-500">No field details recorded.</p>;
  return (
    <table className="w-full text-xs">
      <thead>
        <tr className="text-left text-ink-500">
          <th className="w-1/5 py-1 pr-2 font-medium">Field</th>
          <th className="w-2/5 py-1 pr-2 font-medium">Before</th>
          <th className="w-2/5 py-1 font-medium">After</th>
        </tr>
      </thead>
      <tbody>
        {keys.map((k) => (
          <tr key={k} className="border-t border-sand-400/60 align-top">
            <td className="py-1 pr-2 font-mono">{k}</td>
            <td className="break-all py-1 pr-2 font-mono text-danger-600">{show(entry.before?.[k])}</td>
            <td className="break-all py-1 font-mono text-leaf-800">{show(entry.after?.[k])}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function AuditLog() {
  const { get, setParam } = useUrlParams();
  const resource = get("resource");
  const actor = get("actor");
  const from = get("from");
  const to = get("to");
  const page = Number(get("page", "1"));
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [open, setOpen] = useState(null);

  useEffect(() => {
    let cancelled = false;
    const qs = new URLSearchParams({ page: String(page), ...(resource ? { resource } : {}), ...(actor ? { actor } : {}), ...(from ? { from } : {}), ...(to ? { to } : {}) });
    api(`/api/admin/audit-logs?${qs}`)
      .then((d) => {
        if (cancelled) return;
        setData(d);
        setError("");
      })
      .catch((err) => !cancelled && setError(err.message));
    return () => {
      cancelled = true;
    };
  }, [resource, actor, from, to, page]);

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-ink-700">Every change made by staff and admins: who, what, the fields before and after, and from which IP address. Entries can’t be edited or deleted.</p>
      <div className="flex flex-wrap items-end gap-3">
        <FilterSelect label="Area" value={resource} onChange={(v) => setParam("resource", v)} options={[["", "Everything"], ...(data?.facets.resources ?? []).map((r) => [r, r])]} />
        <FilterSelect label="Person" value={actor} onChange={(v) => setParam("actor", v)} options={[["", "Everyone"], ...(data?.facets.actors ?? []).map((a) => [a.id, `${a.email} (${a.role})`])]} />
        <label className="flex flex-col gap-1 text-xs text-ink-700">
          From
          <input type="date" value={from} onChange={(e) => setParam("from", e.target.value)} className="h-11 rounded-md border border-sand-400 bg-white px-2.5 text-sm" />
        </label>
        <label className="flex flex-col gap-1 text-xs text-ink-700">
          To
          <input type="date" value={to} onChange={(e) => setParam("to", e.target.value)} className="h-11 rounded-md border border-sand-400 bg-white px-2.5 text-sm" />
        </label>
      </div>
      <ErrorNote>{error}</ErrorNote>
      <Panel>
        {!data ? (
          <Skeleton className="m-5 h-64" />
        ) : data.entries.length === 0 ? (
          <p className="p-8 text-center text-ink-500">Nothing recorded for these filters.</p>
        ) : (
          <DataTable caption="Audit log" head={["When", "Who", "Action", "Record", "IP"]} minWidth={760}>
            {data.entries.map((e) => (
              <Fragment key={e.id}>
                <tr>
                  <td className="whitespace-nowrap text-ink-700">{formatDateTime(e.createdAt)}</td>
                  <td>
                    <span className="inline-flex flex-wrap items-center justify-end gap-1.5 md:justify-start">
                      <span className="break-all">{e.actorEmail}</span>
                      <StatusPill tone={e.actorRole === "admin" ? "purple" : "blue"}>{e.actorRole}</StatusPill>
                    </span>
                  </td>
                  <td>
                    <button type="button" aria-expanded={open === e.id} onClick={() => setOpen(open === e.id ? null : e.id)} className="rounded-md bg-gold-50 px-2 py-1 font-mono text-xs font-semibold text-gold-700 ring-1 ring-inset ring-gold-400/25 hover:bg-gold-100">
                      {e.action}
                    </button>
                  </td>
                  <td className="text-xs text-ink-700">{e.summary ?? e.resourceId ?? "—"}</td>
                  <td className="font-mono text-xs text-ink-500">{e.ip}</td>
                </tr>
                {open === e.id && (
                  <tr className="bg-panel-muted">
                    <td colSpan={5}>
                      <div className="overflow-x-auto">
                        <Changes entry={e} />
                      </div>
                      <p className="mt-2 break-all text-[11px] text-ink-500">
                        {e.method} {e.path} · {e.status} · request {e.requestId}
                      </p>
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </DataTable>
        )}
      </Panel>
      {data && <Pager page={data.page} pages={data.pages} onPage={(p) => setParam("page", String(p))} />}
    </div>
  );
}

export default function Settings() {
  const { get, setParamsMany } = useUrlParams();
  const tab = get("tab") === "audit" ? "audit" : "store";
  return (
    <AdminPage title="Settings & audit log">
      <Tabs
        label="Settings sections"
        value={tab}
        onChange={(t) => setParamsMany({ tab: t === "audit" ? "audit" : "", resource: "", actor: "", from: "", to: "" })}
        tabs={[
          { id: "store", label: "Store settings", content: <SiteSettings /> },
          { id: "audit", label: "Audit log", content: <AuditLog /> },
        ]}
      />
    </AdminPage>
  );
}
