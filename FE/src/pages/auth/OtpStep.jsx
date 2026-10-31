import { useEffect, useState } from "react";
import { ChevronLeft, Mail } from "lucide-react";
import { OtpInput } from "../../components/ui/OtpInput";
import { Button } from "../../components/ui/button";
import { IconCircle } from "../../components/ui/primitives";
import { useAuth } from "../../auth/context";

const RESEND_SECONDS = 30;

// Shared "check your email" step for sign-up and sign-in.
export function OtpStep({ challengeId, email, onVerify, onBack, submitLabel = "Verify & sign in" }) {
  const { resendCode } = useAuth();
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [wait, setWait] = useState(RESEND_SECONDS);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    if (wait <= 0) return undefined;
    const t = setTimeout(() => setWait((w) => w - 1), 1000);
    return () => clearTimeout(t);
  }, [wait]);

  async function submit(e) {
    e.preventDefault();
    if (code.length !== 6) return setError("Enter the 6-digit code from your email.");
    setBusy(true);
    setError("");
    try {
      await onVerify(code);
    } catch (err) {
      setError(err.message);
      setCode("");
    } finally {
      setBusy(false);
    }
    return undefined;
  }

  async function resend() {
    setError("");
    try {
      await resendCode(challengeId);
      setNotice("A new code is on its way.");
      setWait(RESEND_SECONDS);
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-5">
      <button type="button" onClick={onBack} className="flex items-center gap-1.5 self-start py-2 text-sm text-cocoa-900">
        <ChevronLeft className="h-4 w-4" aria-hidden="true" /> Back
      </button>
      <IconCircle><Mail className="h-7 w-7" strokeWidth={1.4} /></IconCircle>
      <div>
        <h1 className="mb-1.5 text-[32px] leading-tight">Check your email</h1>
        <p className="text-ink-500">
          Enter the 6-digit code sent to <strong className="font-medium text-cocoa-900">{email}</strong>. It expires in 10 minutes.
        </p>
      </div>
      <OtpInput value={code} onChange={setCode} invalid={Boolean(error)} />
      <p role="alert" className="min-h-[1.25rem] text-sm text-danger-600">{error}</p>
      <Button type="submit" variant="brown" size="lg" disabled={busy} className="-mt-3">
        {busy ? "Verifying…" : submitLabel}
      </Button>
      <p className="text-center text-sm text-ink-500" aria-live="polite">
        {notice && <span className="mb-1 block text-leaf-800">{notice}</span>}
        Didn’t get it?{" "}
        {wait > 0 ? (
          <span className="text-cocoa-900">Resend in 0:{String(wait).padStart(2, "0")}</span>
        ) : (
          <button type="button" onClick={resend} className="font-medium text-gold-700 underline underline-offset-4">
            Resend code
          </button>
        )}
      </p>
    </form>
  );
}
