import { useState } from "react";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router";
import { useAuth } from "../../auth/context";
import { Field } from "../../components/ui/primitives";
import { Button } from "../../components/ui/button";
import { Seo } from "../../components/Seo";
import { OtpStep } from "./OtpStep";
import { AuthTabs } from "./AuthTabs";
import { safeNext } from "./authUtils";

export default function Login() {
  const { login, verifyLogin } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [params] = useSearchParams();
  const [form, setForm] = useState({ email: "", password: "" });
  const [errors, setErrors] = useState({});
  const [challenge, setChallenge] = useState(null);
  const [busy, setBusy] = useState(false);

  function done(user) {
    const fallback = user.role === "customer" ? "/account" : "/admin";
    navigate(safeNext(params.get("next"), fallback), { replace: true });
  }

  async function submit(e) {
    e.preventDefault();
    const next = {};
    if (!/^\S+@\S+\.\S+$/.test(form.email)) next.email = "Enter a valid email address";
    if (!form.password) next.password = "Enter your password";
    setErrors(next);
    if (Object.keys(next).length) return;
    setBusy(true);
    try {
      const data = await login(form);
      if (data.otpRequired) setChallenge(data);
      else done(data.user);
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
        onBack={() => setChallenge(null)}
        onVerify={async (code) => done(await verifyLogin({ challengeId: challenge.challengeId, code }))}
      />
    );
  }

  return (
    <>
      <Seo title="Sign in" noindex />
      <AuthTabs active="login" />
      <form onSubmit={submit} noValidate className="flex flex-col gap-5">
        <div>
          <h1 className="mb-1.5 text-[32px] leading-tight">Welcome back</h1>
          <p className="text-ink-500">Sign in to continue to checkout and your orders.</p>
        </div>
        {location.state?.notice && !errors.form && <p role="status" className="rounded-md border border-leaf-800/20 bg-leaf-50 px-4 py-3 text-sm text-leaf-800">{location.state.notice}</p>}
        {errors.form && <p role="alert" className="rounded-md border border-danger-600/30 bg-danger-50 px-4 py-3 text-sm text-danger-600">{errors.form}</p>}
        <Field label="Email" type="email" autoComplete="email" value={form.email} error={errors.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        <Field label="Password" type="password" autoComplete="current-password" value={form.password} error={errors.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
        <Link to="/forgot-password" className="-mt-2 self-end text-sm font-medium">
          Forgot password?
        </Link>
        <Button type="submit" variant="brown" size="lg" disabled={busy}>
          {busy ? "Checking…" : "Continue"}
        </Button>
        <p className="text-center text-[13px] text-ink-500">We’ll email a 6-digit code to verify it’s you.</p>
      </form>
    </>
  );
}
