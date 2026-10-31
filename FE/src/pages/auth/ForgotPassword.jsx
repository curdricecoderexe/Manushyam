import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { ChevronLeft } from "lucide-react";
import { useAuth } from "../../auth/context";
import { Field } from "../../components/ui/primitives";
import { Button } from "../../components/ui/button";
import { OtpInput } from "../../components/ui/OtpInput";
import { Seo } from "../../components/Seo";
import { passwordStrength } from "./passwordStrength";

export default function ForgotPassword() {
  const { forgotPassword, resetPassword } = useAuth();
  const navigate = useNavigate();
  const [step, setStep] = useState("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState({});
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function requestCode(e) {
    e.preventDefault();
    if (!/^\S+@\S+\.\S+$/.test(email)) return setErrors({ email: "Enter a valid email address" });
    setBusy(true);
    setErrors({});
    try {
      const res = await forgotPassword(email);
      setMessage(res.message);
      setStep("reset");
    } catch (err) {
      setErrors({ form: err.message });
    } finally {
      setBusy(false);
    }
    return undefined;
  }

  async function submitReset(e) {
    e.preventDefault();
    const next = {};
    if (code.length !== 6) next.code = "Enter the 6-digit code from your email.";
    const strength = passwordStrength(password);
    if (!strength.valid) next.password = strength.hint;
    setErrors(next);
    if (Object.keys(next).length) return;
    setBusy(true);
    try {
      await resetPassword({ email, code, password });
      navigate("/login", { replace: true, state: { notice: "Password updated. Please sign in." } });
    } catch (err) {
      setErrors({ form: err.message, ...err.fieldErrors });
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Seo title="Reset password" noindex />
      <Link to="/login" className="flex items-center gap-1.5 self-start py-2 text-sm text-cocoa-900">
        <ChevronLeft className="h-4 w-4" aria-hidden="true" /> Back to sign in
      </Link>
      {step === "email" ? (
        <form onSubmit={requestCode} noValidate className="flex flex-col gap-5">
          <div>
            <h1 className="mb-1.5 text-[32px] leading-tight">Reset your password</h1>
            <p className="text-ink-500">Enter your email. If an account exists, we’ll send a reset code.</p>
          </div>
          {errors.form && <p role="alert" className="text-sm text-danger-600">{errors.form}</p>}
          <Field label="Email" type="email" autoComplete="email" value={email} error={errors.email} onChange={(e) => setEmail(e.target.value)} />
          <Button type="submit" variant="brown" size="lg" disabled={busy}>
            {busy ? "Sending…" : "Send reset code"}
          </Button>
        </form>
      ) : (
        <form onSubmit={submitReset} noValidate className="flex flex-col gap-5">
          <div>
            <h1 className="mb-1.5 text-[32px] leading-tight">Set a new password</h1>
            <p role="status" className="text-ink-500">{message}</p>
          </div>
          {errors.form && <p role="alert" className="rounded-md border border-danger-600/30 bg-danger-50 px-4 py-3 text-sm text-danger-600">{errors.form}</p>}
          <OtpInput value={code} onChange={setCode} invalid={Boolean(errors.code)} label="Reset code" />
          {errors.code && <p role="alert" className="-mt-3 text-sm text-danger-600">{errors.code}</p>}
          <Field label="New password" type="password" autoComplete="new-password" value={password} error={errors.password} hint="8+ characters with a letter and a number" onChange={(e) => setPassword(e.target.value)} />
          <Button type="submit" variant="brown" size="lg" disabled={busy}>
            {busy ? "Updating…" : "Update password"}
          </Button>
        </form>
      )}
    </>
  );
}
