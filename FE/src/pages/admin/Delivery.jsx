import { useCallback, useEffect, useRef, useState } from "react";
import { Download, Plus, Upload } from "lucide-react";
import { AdminPage, Panel } from "../../components/admin/AdminPage";
import { Checkbox, DataTable, ErrorNote, FilterSelect, SearchInput, Toggle } from "../../components/admin/controls";
import { paiseToRupees, rupeesToPaise } from "../../lib/admin";
import { Dialog } from "../../components/ui/Dialog";
import { Tabs } from "../../components/ui/Tabs";
import { Field, Skeleton, StatusPill } from "../../components/ui/primitives";
import { Button } from "../../components/ui/button";
import { useToast } from "../../toast/context";
import { api, downloadFile } from "../../lib/api";
import { today } from "../../lib/exporters";
import { formatPaise } from "../../lib/cn";
import { INDIA_STATES } from "../../data/indiaStates";

function SettingsForm({ settings, shiprocket, onSaved }) {
  const [v, setV] = useState(() => ({
    standardFee: paiseToRupees(settings.standard.fee),
    standardMin: String(settings.standard.eta.min),
    standardMax: String(settings.standard.eta.max),
    freeShippingThreshold: paiseToRupees(settings.freeShippingThreshold),
    expressEnabled: settings.express.enabled,
    expressFee: paiseToRupees(settings.express.fee),
    expressMin: String(settings.express.eta.min),
    expressMax: String(settings.express.eta.max),
    codEnabled: settings.cod.enabled,
    codFee: paiseToRupees(settings.cod.fee),
    codMax: paiseToRupees(settings.cod.maxOrder),
    minOrder: paiseToRupees(settings.minOrder),
    serviceByDefault: settings.serviceByDefault,
  }));
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const bind = (k) => ({ value: v[k], onChange: (e) => setV((s) => ({ ...s, [k]: e.target.value })) });
  const set = (k) => (val) => setV((s) => ({ ...s, [k]: val }));

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const { settings: saved } = await api("/api/admin/delivery", {
        method: "PUT",
        body: {
          standard: { fee: rupeesToPaise(v.standardFee) ?? 0, eta: { min: Number(v.standardMin), max: Number(v.standardMax) } },
          freeShippingThreshold: rupeesToPaise(v.freeShippingThreshold) ?? 0,
          express: { enabled: v.expressEnabled, fee: rupeesToPaise(v.expressFee) ?? 0, eta: { min: Number(v.expressMin), max: Number(v.expressMax) } },
          cod: { enabled: v.codEnabled, fee: rupeesToPaise(v.codFee) ?? 0, maxOrder: rupeesToPaise(v.codMax) ?? 0 },
          minOrder: rupeesToPaise(v.minOrder) ?? 0,
          serviceByDefault: v.serviceByDefault,
        },
      });
      onSaved(saved);
    } catch (err) {
      setError(err.details?.length ? `${err.message}: ${err.details.map((d) => `${d.path} ${d.message}`).join("; ")}` : err.message);
    } finally {
      setBusy(false);
    }
  }

  const num = { type: "number", min: "0", step: "0.01" };
  const days = { type: "number", min: "0", max: "30", step: "1" };
  return (
    <form aria-label="Delivery settings" onSubmit={submit} className="flex flex-col gap-6">
      <p className="text-sm text-ink-700">{shiprocket ? "Shiprocket is connected: PIN codes must also be serviceable by a courier." : "Shiprocket isn’t connected, so delivery is quoted only from these rules."}</p>
      <Panel title="Standard delivery">
        <div className="grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Fee (₹)" {...num} {...bind("standardFee")} />
          <Field label="Free above (₹)" {...num} {...bind("freeShippingThreshold")} hint="0 = no threshold" />
          <Field label="Fastest (days)" {...days} {...bind("standardMin")} />
          <Field label="Slowest (days)" {...days} {...bind("standardMax")} />
        </div>
      </Panel>
      <Panel title="Express delivery" actions={<Toggle checked={v.expressEnabled} onChange={set("expressEnabled")} label="Offer express" />}>
        <div className="grid gap-4 p-5 sm:grid-cols-3">
          <Field label="Express fee (₹)" {...num} {...bind("expressFee")} />
          <Field label="Express fastest (days)" {...days} {...bind("expressMin")} />
          <Field label="Express slowest (days)" {...days} {...bind("expressMax")} />
        </div>
      </Panel>
      <Panel title="Cash on Delivery" actions={<Toggle checked={v.codEnabled} onChange={set("codEnabled")} label="Offer COD" />}>
        <div className="grid gap-4 p-5 sm:grid-cols-2">
          <Field label="COD fee (₹)" {...num} {...bind("codFee")} />
          <Field label="Largest COD order (₹)" {...num} {...bind("codMax")} />
        </div>
      </Panel>
      <Panel title="Orders">
        <div className="flex flex-col gap-4 p-5">
          <Field label="Minimum order (₹)" {...num} {...bind("minOrder")} className="max-w-xs" />
          <Toggle checked={v.serviceByDefault} onChange={set("serviceByDefault")} label="Deliver to PIN codes without a rule" />
        </div>
      </Panel>
      <ErrorNote>{error}</ErrorNote>
      <Button type="submit" variant="brown" size="sm" disabled={busy} className="self-start">
        Save delivery settings
      </Button>
    </form>
  );
}

const EMPTY_RULE = { pincode: "", city: "", state: "", serviceable: true, codAvailable: true, expressAvailable: true, standardFee: "", etaMin: "", etaMax: "", note: "", isActive: true };

function RuleForm({ rule, onSaved }) {
  const [v, setV] = useState(() =>
    rule ? { ...EMPTY_RULE, ...rule, city: rule.city ?? "", state: rule.state ?? "", note: rule.note ?? "", standardFee: paiseToRupees(rule.standardFee), etaMin: rule.eta ? String(rule.eta.min) : "", etaMax: rule.eta ? String(rule.eta.max) : "" } : EMPTY_RULE
  );
  const [errors, setErrors] = useState({});
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const bind = (k) => ({ value: v[k], onChange: (e) => setV((s) => ({ ...s, [k]: e.target.value })), error: errors[k] });
  const set = (k) => (val) => setV((s) => ({ ...s, [k]: val }));
  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setErrors({});
    const body = {
      pincode: v.pincode.trim(),
      ...(v.city.trim() ? { city: v.city.trim() } : {}),
      ...(v.state ? { state: v.state } : {}),
      serviceable: v.serviceable,
      codAvailable: v.codAvailable,
      expressAvailable: v.expressAvailable,
      isActive: v.isActive,
      ...(v.standardFee !== "" ? { standardFee: rupeesToPaise(v.standardFee) } : {}),
      ...(v.etaMin !== "" && v.etaMax !== "" ? { eta: { min: Number(v.etaMin), max: Number(v.etaMax) } } : {}),
      ...(v.note.trim() ? { note: v.note.trim() } : {}),
    };
    try {
      const res = await api(rule ? `/api/admin/pincode-rules/${rule.id}` : "/api/admin/pincode-rules", { method: rule ? "PATCH" : "POST", body });
      onSaved(res.rule);
    } catch (err) {
      setErrors(err.fieldErrors);
      setError(err.message);
      setBusy(false);
    }
  }
  return (
    <form aria-label="PIN rule" onSubmit={submit} className="flex flex-col gap-4 p-5">
      <Field label="PIN code or 3-digit region" required inputMode="numeric" maxLength={6} {...bind("pincode")} hint="560001 matches one PIN; 560 covers every PIN starting 560" />
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="City" {...bind("city")} />
        <FilterSelect label="State" value={v.state} onChange={set("state")} options={[["", "—"], ...INDIA_STATES.map((s) => [s, s])]} />
        <Field label="Fee override (₹)" type="number" min="0" step="0.01" {...bind("standardFee")} hint="Empty = store fee" />
        <div className="grid grid-cols-2 gap-2">
          <Field label="ETA min (days)" type="number" min="0" max="30" {...bind("etaMin")} />
          <Field label="ETA max (days)" type="number" min="0" max="30" {...bind("etaMax")} />
        </div>
      </div>
      <div className="flex flex-wrap gap-x-6">
        <Toggle checked={v.serviceable} onChange={set("serviceable")} label="We deliver here" />
        <Toggle checked={v.codAvailable} onChange={set("codAvailable")} label="COD available" />
        <Toggle checked={v.expressAvailable} onChange={set("expressAvailable")} label="Express available" />
        <Toggle checked={v.isActive} onChange={set("isActive")} label="Rule active" />
      </div>
      <Field label="Note" maxLength={140} {...bind("note")} />
      <ErrorNote>{error}</ErrorNote>
      <Button type="submit" variant="brown" size="sm" disabled={busy}>
        {rule ? "Save rule" : "Add rule"}
      </Button>
    </form>
  );
}

function PinRules() {
  const { toast } = useToast();
  const [q, setQ] = useState("");
  const [rules, setRules] = useState(null);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState(() => new Set());
  const [editing, setEditing] = useState(null);
  const [importErrors, setImportErrors] = useState(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef(null);

  const load = useCallback(() => {
    api(`/api/admin/pincode-rules${q ? `?q=${encodeURIComponent(q)}` : ""}`)
      .then((d) => {
        setRules(d.rules);
        setSelected(new Set());
      })
      .catch((err) => setError(err.message));
  }, [q]);
  useEffect(load, [load]);

  async function bulk(action) {
    setBusy(true);
    try {
      const { affected } = await api("/api/admin/pincode-rules/bulk", { method: "POST", body: { ids: [...selected], action } });
      toast({ message: `${affected} rule${affected === 1 ? "" : "s"} ${action === "delete" ? "deleted" : action === "activate" ? "activated" : "deactivated"}.` });
      load();
    } catch (err) {
      toast({ message: err.message, tone: "error" });
    } finally {
      setBusy(false);
    }
  }

  async function importCsv(file) {
    if (!file) return;
    setBusy(true);
    setImportErrors(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const r = await api("/api/admin/pincode-rules/import", { method: "POST", body: fd });
      toast({ message: `Imported ${r.total} rules: ${r.created} new, ${r.updated} updated.` });
      load();
    } catch (err) {
      setImportErrors({ message: err.message, lines: err.details ?? [] });
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function toggleActive(rule) {
    try {
      const { rule: saved } = await api(`/api/admin/pincode-rules/${rule.id}`, { method: "PATCH", body: { isActive: !rule.isActive } });
      setRules((list) => list.map((r) => (r.id === saved.id ? saved : r)));
    } catch (err) {
      toast({ message: err.message, tone: "error" });
    }
  }

  const allSelected = rules?.length > 0 && selected.size === rules.length;
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end gap-3">
        <SearchInput id="pin-search" label="Search PIN codes" value={q} onCommit={setQ} placeholder="Starts with…" />
        <Button size="sm" variant="outline" onClick={() => downloadFile("/api/admin/pincode-rules/export", `manushyam-pincode-rules-${today()}.csv`).catch((err) => toast({ message: err.message, tone: "error" }))}>
          <Download className="h-4 w-4" aria-hidden="true" /> Export CSV
        </Button>
        <input ref={fileRef} type="file" accept=".csv,text/csv" className="sr-only" aria-label="CSV file to import" onChange={(e) => importCsv(e.target.files?.[0])} />
        <Button size="sm" variant="outline" disabled={busy} onClick={() => fileRef.current?.click()}>
          <Upload className="h-4 w-4" aria-hidden="true" /> Import CSV
        </Button>
        <Button size="sm" variant="brown" onClick={() => setEditing("new")}>
          <Plus className="h-4 w-4" aria-hidden="true" /> Add rule
        </Button>
      </div>
      <p className="text-xs text-ink-500">CSV columns: pincode, city, state, serviceable, cod_available, standard_fee_rupees, eta_min_days, eta_max_days, express_available, note, active. Empty cells keep the current value. If any row has a problem, nothing is imported.</p>
      {importErrors && (
        <div role="alert" className="rounded-md border border-danger-600/30 bg-danger-50 p-3 text-sm text-danger-600">
          <p className="font-semibold">{importErrors.message}</p>
          <ul className="mt-1 list-disc pl-5">
            {importErrors.lines.map((l, i) => (
              <li key={i}>
                {l.path}: {l.message}
              </li>
            ))}
          </ul>
        </div>
      )}
      <ErrorNote>{error}</ErrorNote>
      {selected.size > 0 && (
        <div role="group" aria-label="Bulk actions" className="flex flex-wrap items-center gap-2 rounded-md bg-cream-200 px-3 py-2 text-sm">
          <span>{selected.size} selected</span>
          <Button size="sm" variant="outline" disabled={busy} onClick={() => bulk("activate")}>
            Activate
          </Button>
          <Button size="sm" variant="outline" disabled={busy} onClick={() => bulk("deactivate")}>
            Deactivate
          </Button>
          <Button size="sm" variant="danger" disabled={busy} onClick={() => bulk("delete")}>
            Delete
          </Button>
        </div>
      )}
      <Panel>
        {!rules ? (
          <Skeleton className="m-5 h-48" />
        ) : rules.length === 0 ? (
          <p className="p-8 text-center text-ink-500">No PIN rules{q ? " match" : " yet — every PIN code uses the store settings"}.</p>
        ) : (
          <DataTable
            caption="PIN code rules"
            head={[
              { label: <Checkbox label={<span className="sr-only">Select all</span>} checked={allSelected} onChange={(on) => setSelected(on ? new Set(rules.map((r) => r.id)) : new Set())} /> },
              "PIN",
              "Place",
              "Delivery",
              "Fee",
              "ETA",
              "Active",
              "",
            ]}
          >
            {rules.map((r) => (
              <tr key={r.id}>
                <td>
                  <Checkbox
                    label={<span className="sr-only">Select {r.pincode}</span>}
                    checked={selected.has(r.id)}
                    onChange={(on) =>
                      setSelected((s) => {
                        const n = new Set(s);
                        if (on) n.add(r.id);
                        else n.delete(r.id);
                        return n;
                      })
                    }
                  />
                </td>
                <td className="font-mono">{r.pincode.length === 3 ? `${r.pincode}xxx` : r.pincode}</td>
                <td className="text-ink-700">{[r.city, r.state].filter(Boolean).join(", ") || "—"}</td>
                <td className="flex flex-wrap gap-1">
                  {r.serviceable ? <StatusPill tone="green">Delivers</StatusPill> : <StatusPill tone="red">No delivery</StatusPill>}
                  {r.serviceable && !r.codAvailable && <StatusPill tone="amber">No COD</StatusPill>}
                </td>
                <td className="tabular-nums">{r.standardFee === undefined || r.standardFee === null ? "Store" : formatPaise(r.standardFee)}</td>
                <td>{r.eta ? `${r.eta.min}–${r.eta.max} d` : "Store"}</td>
                <td>
                  <Toggle checked={r.isActive} onChange={() => toggleActive(r)} label={`Rule ${r.pincode} active`} hideLabel />
                </td>
                <td className="text-right">
                  <Button size="sm" variant="outline" onClick={() => setEditing(r)}>
                    Edit
                  </Button>
                </td>
              </tr>
            ))}
          </DataTable>
        )}
      </Panel>
      <Dialog open={Boolean(editing)} onClose={() => setEditing(null)} title={editing === "new" ? "Add PIN rule" : `PIN rule ${editing?.pincode ?? ""}`} side="right" className="admin-scope">
        {editing && (
          <RuleForm
            rule={editing === "new" ? null : editing}
            onSaved={(rule) => {
              setEditing(null);
              toast({ message: `Rule for ${rule.pincode} saved.` });
              load();
            }}
          />
        )}
      </Dialog>
    </div>
  );
}

export default function Delivery() {
  const { toast } = useToast();
  const [tab, setTab] = useState("settings");
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  useEffect(() => {
    api("/api/admin/delivery")
      .then(setData)
      .catch((err) => setError(err.message));
  }, []);
  return (
    <AdminPage title="Delivery & PIN codes" subtitle="Fees, delivery times, Cash on Delivery and per-PIN rules">
      <ErrorNote>{error}</ErrorNote>
      <Tabs
        label="Delivery sections"
        value={tab}
        onChange={setTab}
        tabs={[
          {
            id: "settings",
            label: "Store rules",
            content: data ? (
              <SettingsForm
                settings={data.settings}
                shiprocket={data.shiprocket}
                onSaved={(settings) => {
                  setData((d) => ({ ...d, settings }));
                  toast({ message: "Delivery settings saved." });
                }}
              />
            ) : (
              <Skeleton className="h-64" />
            ),
          },
          { id: "pins", label: "PIN codes", content: <PinRules /> },
        ]}
      />
    </AdminPage>
  );
}
