import { useState } from "react";
import { PathIcon } from "../ui/icons";
import { ICONS } from "../ui/icon-paths";
import { api } from "../../lib/api";
import { etaRange } from "../../lib/orders";
import { formatPaise } from "../../lib/cn";

const PIN_KEY = "mm_pin";

function savedPin() {
  try {
    return localStorage.getItem(PIN_KEY) || "";
  } catch {
    return "";
  }
}

// "Check delivery" on the product page: ETA and COD for a PIN code (a preview; checkout recomputes it).
export function DeliveryCheck({ subtotal }) {
  const [pin, setPin] = useState(savedPin);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function check(e) {
    e.preventDefault();
    if (!/^[1-9][0-9]{5}$/.test(pin)) return setError("Enter a valid 6-digit PIN code");
    setBusy(true);
    setError("");
    try {
      const { delivery } = await api(`/api/delivery/check?pincode=${pin}${subtotal ? `&subtotal=${subtotal}` : ""}`, { auth: false });
      setResult(delivery);
      try {
        localStorage.setItem(PIN_KEY, pin);
      } catch {
        // storage blocked; nothing to remember
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
    return undefined;
  }

  const fastest = result?.methods?.[0];
  return (
    <div className="flex flex-col gap-2">
      <form onSubmit={check} noValidate className="flex h-12">
        <label htmlFor="pdp-pin" className="sr-only">
          Delivery PIN code
        </label>
        <span className="flex items-center rounded-l-md border border-r-0 border-sand-400 bg-white pl-3.5 text-gold-600" aria-hidden="true">
          <PathIcon d={ICONS.truck} size={18} strokeWidth={1.6} />
        </span>
        <input
          id="pdp-pin"
          inputMode="numeric"
          autoComplete="postal-code"
          maxLength={6}
          placeholder="Enter PIN code"
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
          aria-invalid={error ? "true" : undefined}
          aria-describedby={error ? "pdp-pin-error" : undefined}
          className="min-w-0 flex-1 border border-x-0 border-sand-400 bg-white px-3 text-[15px] text-cocoa-900 focus:outline-none"
        />
        <button type="submit" disabled={busy} className="rounded-r-md border border-sand-400 bg-cream-200 px-4 font-sans text-sm font-semibold uppercase tracking-[0.12em] text-gold-700 disabled:opacity-60">
          {busy ? "…" : "Check"}
        </button>
      </form>
      {error && (
        <p id="pdp-pin-error" role="alert" className="text-[13px] text-danger-600">
          {error}
        </p>
      )}
      {result && (
        <p role="status" className="text-sm">
          {result.serviceable ? (
            <>
              <span className="text-leaf-800">
                Delivery by <strong className="font-semibold">{etaRange(fastest.etaMinDays, fastest.etaMaxDays)}</strong>
                {fastest.fee ? ` · ${formatPaise(fastest.fee)}` : " · Free"}
              </span>
              <span className="text-ink-500"> · {result.codAvailable ? "COD available" : "Prepaid only"}</span>
            </>
          ) : (
            <span className="text-danger-600">{result.message}</span>
          )}
        </p>
      )}
    </div>
  );
}
