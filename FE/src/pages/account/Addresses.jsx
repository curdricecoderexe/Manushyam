import { useCallback, useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { api } from "../../lib/api";
import { INDIA_STATES } from "../../data/indiaStates";
import { Badge, Card, Field, Skeleton } from "../../components/ui/primitives";
import { Button } from "../../components/ui/button";
import { cn } from "../../lib/cn";

const EMPTY = { label: "Home", fullName: "", phone: "", line1: "", line2: "", landmark: "", city: "", state: "", pincode: "", isDefault: false };

function validate(v) {
  const e = {};
  if (v.fullName.trim().length < 2) e.fullName = "Enter the recipient’s name";
  if (!/^(\+?91|0)?[6-9]\d{9}$/.test(v.phone.replace(/[\s-]/g, ""))) e.phone = "Enter a valid 10-digit mobile number";
  if (v.line1.trim().length < 3) e.line1 = "Enter house / street";
  if (v.city.trim().length < 2) e.city = "Enter a city";
  if (!v.state) e.state = "Choose a state";
  if (!/^[1-9][0-9]{5}$/.test(v.pincode)) e.pincode = "Enter a valid 6-digit PIN code";
  return e;
}

// Drop empty optional fields so the strict server schema gets only what the user typed.
function toBody(v) {
  return Object.fromEntries(Object.entries(v).filter(([k, val]) => !(["line2", "landmark"].includes(k) && !val)));
}

export function AddressForm({ initial = EMPTY, onSaved, onCancel }) {
  const [values, setValues] = useState({ ...EMPTY, ...initial });
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const bind = (name) => ({ value: values[name] ?? "", error: errors[name], onChange: (e) => setValues((v) => ({ ...v, [name]: e.target.value })) });

  async function submit(e) {
    e.preventDefault();
    const found = validate(values);
    setErrors(found);
    if (Object.keys(found).length) return;
    setBusy(true);
    try {
      const { id, createdAt: _c, updatedAt: _u, ...fields } = values;
      const body = toBody(fields);
      const data = id ? await api(`/api/addresses/${id}`, { method: "PUT", body }) : await api("/api/addresses", { method: "POST", body });
      onSaved(data.address);
    } catch (err) {
      setErrors({ form: err.message, ...err.fieldErrors });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card as="form" onSubmit={submit} noValidate className="grid gap-4 p-6 sm:grid-cols-2" aria-label={initial.id ? "Edit address" : "New address"}>
      {errors.form && <p role="alert" className="text-sm text-danger-600 sm:col-span-2">{errors.form}</p>}
      <Field label="Full name" autoComplete="name" {...bind("fullName")} />
      <Field label="Mobile number" type="tel" autoComplete="tel-national" {...bind("phone")} />
      <Field label="House no., building, street" autoComplete="address-line1" className="sm:col-span-2" {...bind("line1")} />
      <Field label="Area, locality (optional)" autoComplete="address-line2" {...bind("line2")} />
      <Field label="Landmark (optional)" {...bind("landmark")} />
      <Field label="PIN code" inputMode="numeric" autoComplete="postal-code" maxLength={6} {...bind("pincode")} />
      <Field label="City" autoComplete="address-level2" {...bind("city")} />
      <Field as="select" label="State" autoComplete="address-level1" {...bind("state")}>
        <option value="">Choose a state</option>
        {INDIA_STATES.map((s) => (
          <option key={s} value={s}>{s}</option>
        ))}
      </Field>
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-sm font-medium text-cocoa-900">Save as</legend>
        <div className="flex gap-2">
          {["Home", "Work", "Other"].map((l) => (
            <button
              key={l}
              type="button"
              aria-pressed={values.label === l}
              onClick={() => setValues((v) => ({ ...v, label: l }))}
              className={cn("min-h-11 rounded-md border px-4 text-sm", values.label === l ? "border-brown-700 bg-brown-700 text-white" : "border-sand-500 bg-white text-cocoa-900")}
            >
              {l}
            </button>
          ))}
        </div>
      </fieldset>
      <label className="flex items-center gap-2.5 text-sm sm:col-span-2">
        <input type="checkbox" className="h-[18px] w-[18px] accent-brown-700" checked={values.isDefault} onChange={(e) => setValues((v) => ({ ...v, isDefault: e.target.checked }))} />
        Make this my default address
      </label>
      <div className="flex gap-3 sm:col-span-2">
        <Button type="submit" variant="brown" disabled={busy}>
          {busy ? "Saving…" : "Save address"}
        </Button>
        <Button variant="outline" onClick={onCancel}>Cancel</Button>
      </div>
    </Card>
  );
}

function AddressCard({ address, onEdit, onChanged }) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function run(fn) {
    setBusy(true);
    setError("");
    try {
      await fn();
      await onChanged();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <Card className={cn("flex flex-col gap-1.5 p-5 text-sm leading-relaxed", address.isDefault && "border-2 border-gold-600")}>
      <div className="flex items-center justify-between">
        <strong className="text-base font-medium text-cocoa-900">{address.label}</strong>
        {address.isDefault && <Badge className="border-leaf-800/30 bg-leaf-50 text-leaf-800">Default</Badge>}
      </div>
      <span className="text-cocoa-900">{address.fullName}</span>
      <span>
        {address.line1}
        {address.line2 && `, ${address.line2}`}
        {address.landmark && ` (near ${address.landmark})`}
      </span>
      <span>
        {address.city}, {address.state} {address.pincode}
      </span>
      <span className="text-ink-500">+91 {address.phone}</span>
      {error && <span role="alert" className="text-danger-600">{error}</span>}
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
        {confirming ? (
          <>
            <span className="py-1.5 text-cocoa-900">Delete this address?</span>
            <button type="button" disabled={busy} onClick={() => run(() => api(`/api/addresses/${address.id}`, { method: "DELETE" }))} className="py-1.5 font-semibold text-danger-600">
              Yes, delete
            </button>
            <button type="button" onClick={() => setConfirming(false)} className="py-1.5 font-semibold text-gold-700">Keep</button>
          </>
        ) : (
          <>
            {!address.isDefault && (
              <button type="button" disabled={busy} onClick={() => run(() => api(`/api/addresses/${address.id}/default`, { method: "PATCH" }))} className="py-1.5 font-semibold text-gold-700">
                Set as default
              </button>
            )}
            <button type="button" onClick={() => onEdit(address)} className="py-1.5 font-semibold text-gold-700">Edit</button>
            <button type="button" onClick={() => setConfirming(true)} className="py-1.5 font-semibold text-danger-600">Delete</button>
          </>
        )}
      </div>
    </Card>
  );
}

export default function Addresses() {
  const [addresses, setAddresses] = useState(null);
  const [editing, setEditing] = useState(null);
  const [error, setError] = useState("");

  const fetchAll = useCallback(() => api("/api/addresses").then((d) => d.addresses), []);

  // Reload after a change (add / edit / delete / set default).
  const load = useCallback(async () => {
    try {
      setAddresses(await fetchAll());
    } catch (err) {
      setError(err.message);
    }
  }, [fetchAll]);

  useEffect(() => {
    let cancelled = false;
    fetchAll()
      .then((list) => !cancelled && setAddresses(list))
      .catch((err) => !cancelled && setError(err.message));
    return () => {
      cancelled = true;
    };
  }, [fetchAll]);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-[26px]">Saved addresses</h2>
        {!editing && (
          <Button variant="brown" size="sm" onClick={() => setEditing(EMPTY)}>
            <Plus className="h-4 w-4" aria-hidden="true" /> Add address
          </Button>
        )}
      </div>
      {error && <p role="alert" className="text-danger-600">{error}</p>}
      {editing && (
        <AddressForm
          initial={editing}
          onCancel={() => setEditing(null)}
          onSaved={async () => {
            setEditing(null);
            await load();
          }}
        />
      )}
      {addresses === null && !error ? (
        <div className="grid gap-4 sm:grid-cols-2"><Skeleton className="h-44" /><Skeleton className="h-44" /></div>
      ) : addresses?.length === 0 && !editing ? (
        <Card className="p-8 text-center">
          <p className="mb-4">You haven’t saved any addresses yet.</p>
          <Button variant="brown" onClick={() => setEditing(EMPTY)}>Add your first address</Button>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {addresses?.map((a) => (
            <AddressCard key={a.id} address={a} onEdit={setEditing} onChanged={load} />
          ))}
        </div>
      )}
    </div>
  );
}
