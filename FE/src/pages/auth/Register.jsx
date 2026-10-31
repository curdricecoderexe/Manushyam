import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { useAuth } from "../../auth/context";
import { Field } from "../../components/ui/primitives";
import { Button } from "../../components/ui/button";
import { Seo } from "../../components/Seo";
import { OtpStep } from "./OtpStep";
import { AuthTabs } from "./AuthTabs";
import { passwordStrength } from "./passwordStrength";
import { cn } from "../../lib/cn";

export default function Register() {
  const { startRegister, verifyRegister } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: "", email: "", password: "", agree: false });
  const [errors, setErrors] = useState({});
  const [challenge, setChallenge] = useState(null);
  const [busy, setBusy] = useState(false);
  const strength = passwordStrength(form.password);

  async function submit(e) {
    e.preventDefault();
    const next = {};
    if (form.name.trim().length < 2) next.name = "Enter your name";
    if (!/^\S+@\S+\.\S+$/.test(form.email)) next.email = "Enter a valid email address";
    if (!strength.valid) next.password = strength.hint;
    if (!form.agree) next.agree = "Please accept the terms to continue";
    setErrors(next);
    if (Object.keys(next).length) return;
    setBusy(true);
    try {
      const { agree: _agree, ...body } = form;
      setChallenge(await startRegister(body));
    } catch (err) {
      setErrors({ form: err.message, ...err.fieldErrors });
    } finally {
      setBusy(false);
    }
  }

  if (challenge) {
    return (
      <OtpStep
        challengeId={challenge.challengeId}
        email={challenge.email}
        submitLabel="Verify & create account"
        onBack={() => setChallenge(null)}
        onVerify={async (code) => {
          await verifyRegister({ challengeId: challenge.challengeId, code });
          navigate("/account", { replace: true });
        }}
      />
    );
  }

  return (
    <>
      <Seo title="Create account" noindex />
      <AuthTabs active="register" />
      <form onSubmit={submit} noValidate className="flex flex-col gap-4">
        <div>
          <h1 className="mb-1.5 text-[32px] leading-tight">Create your account</h1>
          <p className="text-ink-500">Join 10,000+ customers on their hair ritual.</p>
        </div>
        {errors.form && <p role="alert" className="rounded-md border border-danger-600/30 bg-danger-50 px-4 py-3 text-sm text-danger-600">{errors.form}</p>}
        <Field label="Full name" autoComplete="name" value={form.name} error={errors.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        <Field label="Email" type="email" autoComplete="email" value={form.email} error={errors.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        <div className="flex flex-col gap-2">
          <Field label="Password" type="password" autoComplete="new-password" value={form.password} error={errors.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
          {form.password && !errors.password && (
            <div aria-live="polite" className="flex flex-col gap-1.5">
              <div className="grid grid-cols-4 gap-1.5" aria-hidden="true">
                {[1, 2, 3, 4].map((n) => (
                  <span key={n} className={cn("h-1 rounded", n <= strength.score ? (strength.valid ? "bg-leaf-800" : "bg-gold-500") : "bg-sand-400")} />
                ))}
              </div>
              <span className={cn("text-xs", strength.valid ? "text-leaf-800" : "text-ink-500")}>{strength.hint}</span>
            </div>
          )}
        </div>
        <label className="flex items-start gap-2.5 text-[13px] leading-relaxed">
          <input type="checkbox" checked={form.agree} onChange={(e) => setForm({ ...form, agree: e.target.checked })} className="mt-0.5 h-[18px] w-[18px] accent-brown-700" aria-invalid={errors.agree ? "true" : undefined} />
          <span>
            I agree to the <Link to="/policies/terms">Terms</Link> and <Link to="/policies/privacy">Privacy Policy</Link>.
            {errors.agree && <span role="alert" className="block text-danger-600">{errors.agree}</span>}
          </span>
        </label>
        <Button type="submit" variant="brown" size="lg" disabled={busy}>
          {busy ? "Sending code…" : "Create account"}
        </Button>
      </form>
    </>
  );
}
