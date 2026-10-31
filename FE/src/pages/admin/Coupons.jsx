import { useEffect, useState } from "react";
import { Plus, Shuffle } from "lucide-react";
import { AdminPage, Panel } from "../../components/admin/AdminPage";
import { DataTable, ErrorNote, FilterSelect, Toggle } from "../../components/admin/controls";
import { paiseToRupees, rupeesToPaise } from "../../lib/admin";
import { Dialog } from "../../components/ui/Dialog";
import { Field, Skeleton, StatusPill } from "../../components/ui/primitives";
import { Button } from "../../components/ui/button";
import { useToast } from "../../toast/context";
import { api } from "../../lib/api";
import { formatDate } from "../../lib/orders";
import { formatPaise } from "../../lib/cn";

// No 0/O/1/I so codes read clearly over the phone.
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
function generateCode(prefix = "", length = 6) {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  const tail = [...bytes].map((b) => ALPHABET[b % ALPHABET.length]).join("");
  const clean = prefix.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 20);
  return clean ? `${clean}-${tail}` : tail;
}

const toDateInput = (iso) => (iso ? new Date(iso).toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" }) : "");
const fromDateInput = (d, endOfDay) => (d ? new Date(`${d}T${endOfDay ? "23:59:59" : "00:00:00"}+05:30`).toISOString() : undefined);

function describe(c) {
  const off = c.type === "percent" ? `${c.value}% off${c.maxDiscount ? ` (up to ${formatPaise(c.maxDiscount)})` : ""}` : `${formatPaise(c.value)} off`;
  return c.minOrder ? `${off} · min ${formatPaise(c.minOrder)}` : off;
}

function couponState(c, now = Date.now()) {
  if (!c.isActive) return { label: "Inactive", tone: "grey" };
  if (c.endsAt && new Date(c.endsAt) < now) return { label: "Expired", tone: "red" };
  if (c.startsAt && new Date(c.startsAt) > now) return { label: "Scheduled", tone: "blue" };
  if (c.usageLimit && c.usedCount >= c.usageLimit) return { label: "Used up", tone: "amber" };
  return { label: "Active", tone: "green" };
}

function CouponForm({ coupon, onSaved }) {
  const editing = Boolean(coupon);
  const [prefix, setPrefix] = useState("");
  const [v, setV] = useState(() => ({
    code: coupon?.code ?? generateCode(),
    description: coupon?.description ?? "",
    type: coupon?.type ?? "percent",
    value: coupon ? (coupon.type === "percent" ? String(coupon.value) : paiseToRupees(coupon.value)) : "10",
    maxDiscount: paiseToRupees(coupon?.maxDiscount),
    minOrder: paiseToRupees(coupon?.minOrder || undefined),
    startsAt: toDateInput(coupon?.startsAt),
    endsAt: toDateInput(coupon?.endsAt),
    usageLimit: coupon?.usageLimit ? String(coupon.usageLimit) : "",
  }));
  const [errors, setErrors] = useState({});
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const bind = (k) => ({ value: v[k], onChange: (e) => setV((s) => ({ ...s, [k]: e.target.value })), error: errors[k] });

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setErrors({});
    const body = {
      ...(editing ? {} : { code: v.code.trim().toUpperCase() }),
      description: v.description.trim() || undefined,
      type: v.type,
      value: v.type === "percent" ? Number(v.value) : rupeesToPaise(v.value),
      maxDiscount: v.type === "percent" ? rupeesToPaise(v.maxDiscount) : undefined,
      minOrder: rupeesToPaise(v.minOrder) ?? 0,
      startsAt: fromDateInput(v.startsAt),
      endsAt: fromDateInput(v.endsAt, true),
      usageLimit: v.usageLimit ? Number(v.usageLimit) : undefined,
    };
    try {
      const res = await api(editing ? `/api/admin/coupons/${coupon.id}` : "/api/admin/coupons", { method: editing ? "PATCH" : "POST", body: JSON.parse(JSON.stringify(body)) });
      onSaved(res.coupon, editing);
    } catch (err) {
      setErrors(err.fieldErrors);
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <form aria-label={editing ? "Edit coupon" : "New coupon"} onSubmit={submit} className="flex flex-col gap-4 p-5">
      {editing ? (
        <p className="font-mono text-lg text-cocoa-900">{coupon.code}</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
          <Field label="Code" required {...bind("code")} hint="Letters, numbers, - or _ (3–30)" />
          <div className="flex items-end gap-2">
            <Field label="Prefix" value={prefix} onChange={(e) => setPrefix(e.target.value)} inputClassName="w-28" />
            <Button type="button" size="sm" variant="outline" className="mb-1.5" onClick={() => setV((s) => ({ ...s, code: generateCode(prefix) }))}>
              <Shuffle className="h-4 w-4" aria-hidden="true" /> Generate
            </Button>
          </div>
        </div>
      )}
      <Field label="Description (internal)" maxLength={140} {...bind("description")} />
      <div className="grid gap-3 sm:grid-cols-2">
        <FilterSelect
          label="Discount type"
          value={v.type}
          onChange={(type) => setV((s) => ({ ...s, type }))}
          options={[
            ["percent", "Percentage"],
            ["flat", "Flat amount"],
          ]}
        />
        <Field label={v.type === "percent" ? "Percent off (1–90)" : "Amount off (₹)"} type="number" min="1" step={v.type === "percent" ? "1" : "0.01"} required {...bind("value")} />
        {v.type === "percent" && <Field label="Maximum discount (₹, optional)" type="number" min="0" step="0.01" {...bind("maxDiscount")} />}
        <Field label="Minimum order (₹)" type="number" min="0" step="0.01" {...bind("minOrder")} />
        <Field label="Starts (optional)" type="date" {...bind("startsAt")} />
        <Field label="Ends (optional)" type="date" {...bind("endsAt")} />
        <Field label="Total uses (optional)" type="number" min="1" step="1" {...bind("usageLimit")} hint="Each customer can use a coupon once" />
      </div>
      <ErrorNote>{error}</ErrorNote>
      <Button type="submit" variant="brown" size="sm" disabled={busy}>
        {editing ? "Save coupon" : "Create coupon"}
      </Button>
    </form>
  );
}

export default function Coupons() {
  const { toast } = useToast();
  const [coupons, setCoupons] = useState(null);
  const [filter, setFilter] = useState("all");
  const [error, setError] = useState("");
  const [editing, setEditing] = useState(null); // coupon | "new"

  useEffect(() => {
    api("/api/admin/coupons")
      .then((d) => setCoupons(d.coupons))
      .catch((err) => setError(err.message));
  }, []);

  const upsert = (c) => setCoupons((list) => (list.some((x) => x.id === c.id) ? list.map((x) => (x.id === c.id ? { ...x, ...c } : x)) : [c, ...list]));

  async function toggle(c) {
    try {
      const { coupon } = await api(`/api/admin/coupons/${c.id}`, { method: "PATCH", body: { isActive: !c.isActive } });
      upsert(coupon);
      toast({ message: `${coupon.code} ${coupon.isActive ? "activated" : "deactivated"}.` });
    } catch (err) {
      toast({ message: err.message, tone: "error" });
    }
  }

  async function remove(c) {
    try {
      const { deleted } = await api(`/api/admin/coupons/${c.id}`, { method: "DELETE" });
      if (deleted) setCoupons((list) => list.filter((x) => x.id !== c.id));
      else upsert({ ...c, isActive: false });
      toast({ message: deleted ? `${c.code} deleted.` : `${c.code} has been used, so it was deactivated instead of deleted.` });
    } catch (err) {
      toast({ message: err.message, tone: "error" });
    }
  }

  const shown = (coupons ?? []).filter((c) => filter === "all" || (filter === "active" ? c.isActive : !c.isActive));
  return (
    <AdminPage
      title="Coupons"
      subtitle={coupons ? `${coupons.filter((c) => c.isActive).length} active of ${coupons.length}` : undefined}
      actions={
        <Button variant="brown" size="sm" onClick={() => setEditing("new")}>
          <Plus className="h-4 w-4" aria-hidden="true" /> New coupon
        </Button>
      }
    >
      <FilterSelect
        label="Show"
        className="w-48"
        value={filter}
        onChange={setFilter}
        options={[
          ["all", "All coupons"],
          ["active", "Active"],
          ["inactive", "Inactive"],
        ]}
      />
      <ErrorNote>{error}</ErrorNote>
      <Panel>
        {!coupons ? (
          <Skeleton className="m-5 h-48" />
        ) : shown.length === 0 ? (
          <p className="p-8 text-center text-ink-500">No coupons yet.</p>
        ) : (
          <DataTable caption="Coupons" head={["Code", "Discount", "Valid", { label: "Used", className: "text-right" }, { label: "Given away", className: "text-right" }, "Status", "On", ""]} minWidth={900}>
            {shown.map((c) => {
              const st = couponState(c);
              return (
                <tr key={c.id}>
                  <td>
                    <span className="font-mono font-medium text-cocoa-900">{c.code}</span>
                    {c.description && <span className="block text-xs text-ink-500">{c.description}</span>}
                  </td>
                  <td>{describe(c)}</td>
                  <td className="text-xs text-ink-700">{c.startsAt || c.endsAt ? `${c.startsAt ? formatDate(c.startsAt) : "now"} – ${c.endsAt ? formatDate(c.endsAt) : "open"}` : "Always"}</td>
                  <td className="text-right tabular-nums">
                    {c.usedCount}
                    {c.usageLimit ? ` / ${c.usageLimit}` : ""}
                  </td>
                  <td className="text-right tabular-nums">{formatPaise(c.totalDiscount ?? 0)}</td>
                  <td>
                    <StatusPill tone={st.tone}>{st.label}</StatusPill>
                  </td>
                  <td>
                    <Toggle checked={c.isActive} onChange={() => toggle(c)} label={`${c.code} active`} hideLabel />
                  </td>
                  <td className="whitespace-nowrap text-right">
                    <Button size="sm" variant="outline" onClick={() => setEditing(c)}>
                      Edit
                    </Button>{" "}
                    <Button size="sm" variant="danger" onClick={() => remove(c)} aria-label={`Delete ${c.code}`}>
                      Delete
                    </Button>
                  </td>
                </tr>
              );
            })}
          </DataTable>
        )}
      </Panel>
      <Dialog open={Boolean(editing)} onClose={() => setEditing(null)} title={editing === "new" ? "New coupon" : "Edit coupon"} side="right" className="admin-scope">
        {editing && (
          <CouponForm
            coupon={editing === "new" ? null : editing}
            onSaved={(c, wasEdit) => {
              upsert(c);
              setEditing(null);
              toast({ message: wasEdit ? `${c.code} saved.` : `${c.code} created.` });
            }}
          />
        )}
      </Dialog>
    </AdminPage>
  );
}
