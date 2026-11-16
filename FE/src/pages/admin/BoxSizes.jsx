import { useEffect, useState } from "react";
import { Box, Plus } from "lucide-react";
import { AdminPage, Panel } from "../../components/admin/AdminPage";
import { Checkbox, DataTable, ErrorNote, Toggle } from "../../components/admin/controls";
import { Dialog } from "../../components/ui/Dialog";
import { Field, Skeleton, StatusPill } from "../../components/ui/primitives";
import { Button } from "../../components/ui/button";
import { useToast } from "../../toast/context";
import { api } from "../../lib/api";

// Mirrors BE/Services/packaging.js: couriers bill the higher of dead weight and L×B×H / 5000.
const VOLUMETRIC_DIVISOR = 5000;
const kg = (grams) => (grams === null || grams === undefined ? "—" : `${(grams / 1000).toLocaleString("en-IN", { maximumFractionDigits: 2 })} kg`);
const dims = (b) => `${b.lengthCm} × ${b.breadthCm} × ${b.heightCm} cm`;
const num = (v) => (v === "" || v === null || v === undefined ? null : Number(v));
const str = (v) => (v === null || v === undefined ? "" : String(v));

function BoxForm({ box, onSaved }) {
  const editing = Boolean(box);
  const [v, setV] = useState(() => ({
    name: box?.name ?? "",
    code: box?.code ?? "",
    lengthCm: str(box?.lengthCm),
    breadthCm: str(box?.breadthCm),
    heightCm: str(box?.heightCm),
    emptyWeightGrams: str(box?.emptyWeightGrams ?? 0),
    maxWeightKg: box?.maxWeightGrams ? String(box.maxWeightGrams / 1000) : "",
    maxUnits: str(box?.maxUnits),
    notes: box?.notes ?? "",
    isDefault: box?.isDefault ?? false,
  }));
  const [errors, setErrors] = useState({});
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const bind = (k, errKey = k) => ({ value: v[k], onChange: (e) => setV((s) => ({ ...s, [k]: e.target.value })), error: errors[errKey] });

  const l = num(v.lengthCm);
  const b = num(v.breadthCm);
  const h = num(v.heightCm);
  const volumetric = l && b && h ? Math.round(((l * b * h) / VOLUMETRIC_DIVISOR) * 1000) : null;

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setErrors({});
    const maxKg = num(v.maxWeightKg);
    const body = {
      name: v.name.trim(),
      code: v.code.trim() ? v.code.trim().toUpperCase() : editing ? null : undefined,
      lengthCm: l,
      breadthCm: b,
      heightCm: h,
      emptyWeightGrams: Math.round(num(v.emptyWeightGrams) ?? 0),
      maxWeightGrams: maxKg ? Math.round(maxKg * 1000) : editing ? null : undefined,
      maxUnits: num(v.maxUnits) ?? (editing ? null : undefined),
      notes: v.notes.trim(),
      ...(v.isDefault && !box?.isDefault ? { isDefault: true } : {}),
    };
    try {
      const res = await api(editing ? `/api/admin/boxes/${box.id}` : "/api/admin/boxes", { method: editing ? "PATCH" : "POST", body: JSON.parse(JSON.stringify(body)) });
      onSaved(res.box, editing);
    } catch (err) {
      setErrors({ ...err.fieldErrors, ...(err.fieldErrors?.maxWeightGrams ? { maxWeightKg: err.fieldErrors.maxWeightGrams } : {}) });
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <form aria-label={editing ? "Edit box size" : "New box size"} onSubmit={submit} className="flex flex-col gap-4 p-5">
      <div className="grid gap-3 sm:grid-cols-[1fr_140px]">
        <Field label="Name" required maxLength={60} placeholder="e.g. Small mailer" {...bind("name")} />
        <Field label="Code (optional)" maxLength={20} placeholder="BOX-S" {...bind("code")} />
      </div>
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-xs font-medium text-ink-700">Inside dimensions (cm)</legend>
        <div className="grid grid-cols-3 gap-3">
          <Field label="Length" type="number" min="0.5" max="300" step="0.1" required inputMode="decimal" {...bind("lengthCm")} />
          <Field label="Breadth" type="number" min="0.5" max="300" step="0.1" required inputMode="decimal" {...bind("breadthCm")} />
          <Field label="Height" type="number" min="0.5" max="300" step="0.1" required inputMode="decimal" {...bind("heightCm")} />
        </div>
        <p className="text-xs text-ink-500">{volumetric ? `Volumetric weight ${kg(volumetric)} — couriers bill whichever is higher, this or the actual weight.` : "Couriers bill the higher of the actual and the volumetric weight (L × B × H ÷ 5000)."}</p>
      </fieldset>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Empty box weight (g)" type="number" min="0" max="100000" step="1" hint="Box + filler + tape" {...bind("emptyWeightGrams")} />
        <Field label="Max contents (kg)" type="number" min="0.001" max="100" step="0.001" hint="Empty = no limit" {...bind("maxWeightKg")} />
        <Field label="Max units" type="number" min="1" max="500" step="1" hint="Empty = no limit" {...bind("maxUnits")} />
      </div>
      <Field label="Notes (internal)" maxLength={200} {...bind("notes")} />
      {box?.isDefault ? (
        <p className="text-sm text-ink-700">This is the default box — it’s used when no other box fits.</p>
      ) : (
        <Checkbox label="Use as the default when no box fits" checked={v.isDefault} onChange={(isDefault) => setV((s) => ({ ...s, isDefault }))} />
      )}
      <ErrorNote>{error}</ErrorNote>
      <Button type="submit" variant="brown" size="sm" disabled={busy}>
        {editing ? "Save box" : "Add box"}
      </Button>
    </form>
  );
}

export default function BoxSizes() {
  const { toast } = useToast();
  const [boxes, setBoxes] = useState(null);
  const [shiprocket, setShiprocket] = useState(false);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState(null); // box | "new"

  const load = () =>
    api("/api/admin/boxes")
      .then((d) => {
        setBoxes(d.boxes);
        setShiprocket(d.shiprocket);
      })
      .catch((err) => setError(err.message));
  useEffect(() => {
    load();
  }, []);

  async function patch(b, body, message) {
    try {
      await api(`/api/admin/boxes/${b.id}`, { method: "PATCH", body });
      await load(); // setting a default changes other rows too
      toast({ message });
    } catch (err) {
      toast({ message: err.message, tone: "error" });
    }
  }

  async function remove(b) {
    try {
      await api(`/api/admin/boxes/${b.id}`, { method: "DELETE" });
      setBoxes((list) => list.filter((x) => x.id !== b.id));
      toast({ message: `${b.name} deleted.` });
    } catch (err) {
      toast({ message: err.message, tone: "error" });
    }
  }

  const active = (boxes ?? []).filter((b) => b.isActive);
  return (
    <AdminPage
      title="Box sizes"
      subtitle={boxes ? `${active.length} in use of ${boxes.length}` : undefined}
      actions={
        <Button variant="brown" size="sm" onClick={() => setEditing("new")}>
          <Plus className="h-4 w-4" aria-hidden="true" /> New box
        </Button>
      }
    >
      <p className="max-w-3xl text-sm text-ink-700">
        When an order is packed, the smallest active box that takes its weight and number of units is suggested; staff can pick another before booking the courier. Its dimensions and weight go to {shiprocket ? "Shiprocket" : "the courier"} with the shipment.
      </p>
      <ErrorNote>{error}</ErrorNote>
      <Panel>
        {!boxes ? (
          <Skeleton className="m-5 h-48" />
        ) : boxes.length === 0 ? (
          <div className="flex flex-col items-center gap-3 p-10 text-center text-ink-500">
            <Box className="h-8 w-8" aria-hidden="true" />
            <p>No box sizes yet — shipments use a 20 × 15 × 10 cm carton until you add one.</p>
            <Button size="sm" variant="outline" onClick={() => setEditing("new")}>
              Add your first box
            </Button>
          </div>
        ) : (
          <DataTable caption="Box sizes" head={["Box", "Inside (L × B × H)", { label: "Empty weight", className: "text-right" }, { label: "Volumetric", className: "text-right" }, "Fits up to", "Status", "In use", ""]} minWidth={920}>
            {boxes.map((b) => (
              <tr key={b.id}>
                <td>
                  <span className="font-medium text-cocoa-900">{b.name}</span>
                  {b.code && <span className="ml-2 font-mono text-xs text-ink-500">{b.code}</span>}
                  {b.notes && <span className="block text-xs text-ink-500">{b.notes}</span>}
                </td>
                <td className="tabular-nums">{dims(b)}</td>
                <td className="text-right tabular-nums">{b.emptyWeightGrams} g</td>
                <td className="text-right tabular-nums">{kg(b.volumetricWeightGrams)}</td>
                <td className="text-xs text-ink-700">{[b.maxWeightGrams ? kg(b.maxWeightGrams) : null, b.maxUnits ? `${b.maxUnits} units` : null].filter(Boolean).join(" · ") || "No limit"}</td>
                <td>{b.isDefault ? <StatusPill tone="green">Default</StatusPill> : b.isActive ? <StatusPill tone="blue">Active</StatusPill> : <StatusPill tone="grey">Off</StatusPill>}</td>
                <td>
                  <Toggle checked={b.isActive} disabled={b.isDefault} onChange={() => patch(b, { isActive: !b.isActive }, `${b.name} ${b.isActive ? "switched off" : "switched on"}.`)} label={`${b.name} in use`} hideLabel />
                </td>
                <td className="whitespace-nowrap text-right">
                  {!b.isDefault && b.isActive && (
                    <>
                      <Button size="sm" variant="outline" onClick={() => patch(b, { isDefault: true }, `${b.name} is now the default.`)}>
                        Make default
                      </Button>{" "}
                    </>
                  )}
                  <Button size="sm" variant="outline" onClick={() => setEditing(b)}>
                    Edit
                  </Button>{" "}
                  <Button size="sm" variant="danger" disabled={b.isDefault} onClick={() => remove(b)} aria-label={`Delete ${b.name}`}>
                    Delete
                  </Button>
                </td>
              </tr>
            ))}
          </DataTable>
        )}
      </Panel>
      <Dialog open={Boolean(editing)} onClose={() => setEditing(null)} title={editing === "new" ? "New box size" : "Edit box size"} side="right" className="admin-scope">
        {editing && (
          <BoxForm
            box={editing === "new" ? null : editing}
            onSaved={(b, wasEdit) => {
              setEditing(null);
              load();
              toast({ message: wasEdit ? `${b.name} saved.` : `${b.name} added.` });
            }}
          />
        )}
      </Dialog>
    </AdminPage>
  );
}
