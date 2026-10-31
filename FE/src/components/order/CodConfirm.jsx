import { useEffect, useState } from "react";
import { OtpInput } from "../ui/OtpInput";
import { Button } from "../ui/button";
import { api } from "../../lib/api";

const COOLDOWN_S = 30;

// Confirms a Cash on Delivery order with the 6-digit code emailed to the customer.
export function CodConfirm({ orderNumber, sentTo, onConfirmed }) {
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [wait, setWait] = useState(COOLDOWN_S);

  useEffect(() => {
    if (wait <= 0) return undefined;
    const t = setTimeout(() => setWait((w) => w - 1), 1000);
    return () => clearTimeout(t);
  }, [wait]);

  async function confirm(e) {
    e.preventDefault();
    if (code.length !== 6) return setError("Enter the 6-digit code");
    setBusy(true);
    setError("");
    try {
      const { order } = await api(`/api/orders/${orderNumber}/cod/confirm`, { method: "POST", body: { code } });
      await onConfirmed(order);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
    return undefined;
  }

  async function resend() {
    setError("");
    setNotice("");
    try {
      await api(`/api/orders/${orderNumber}/cod/resend`, { method: "POST" });
      setNotice("We’ve sent a new code.");
      setWait(COOLDOWN_S);
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <form onSubmit={confirm} noValidate className="flex flex-col gap-4">
      <p className="text-[15px]">
        To prevent fake orders, we’ve emailed a 6-digit code{sentTo ? ` to ${sentTo}` : ""}. Enter it to confirm your Cash on Delivery order.
      </p>
      <OtpInput value={code} onChange={setCode} invalid={Boolean(error)} label="Confirmation code" />
      {error && (
        <p role="alert" className="text-sm text-danger-600">
          {error}
        </p>
      )}
      {notice && !error && (
        <p role="status" className="text-sm text-leaf-800">
          {notice}
        </p>
      )}
      <Button type="submit" variant="green" size="lg" disabled={busy}>
        {busy ? "Confirming…" : "Confirm order"}
      </Button>
      <button type="button" onClick={resend} disabled={wait > 0} className="text-sm font-semibold text-gold-700 disabled:text-ink-500">
        {wait > 0 ? `Resend code in ${wait}s` : "Resend code"}
      </button>
    </form>
  );
}
