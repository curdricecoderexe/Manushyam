import { useState } from "react";
import { useNavigate } from "react-router";
import { useAuth } from "../../auth/context";
import { Card, Field } from "../../components/ui/primitives";
import { Button } from "../../components/ui/button";
import { passwordStrength } from "../auth/passwordStrength";

function useFormState(initial) {
  const [values, setValues] = useState(initial);
  const [errors, setErrors] = useState({});
  const [status, setStatus] = useState({ busy: false, message: "" });
  const bind = (name) => ({ value: values[name], error: errors[name], onChange: (e) => setValues((v) => ({ ...v, [name]: e.target.value })) });
  return { values, setValues, errors, setErrors, status, setStatus, bind };
}

function ProfileForm() {
  const { user, updateProfile } = useAuth();
  const f = useFormState({ name: user.name, phone: user.phone ?? "" });

  async function submit(e) {
    e.preventDefault();
    f.setStatus({ busy: true, message: "" });
    f.setErrors({});
    try {
      const body = { name: f.values.name };
      if (f.values.phone) body.phone = f.values.phone;
      await updateProfile(body);
      f.setStatus({ busy: false, message: "Profile saved." });
    } catch (err) {
      f.setErrors(err.fieldErrors);
      f.setStatus({ busy: false, message: "" });
    }
  }

  return (
    <Card as="form" onSubmit={submit} noValidate className="grid gap-4 p-6 sm:grid-cols-2">
      <Field label="Full name" autoComplete="name" {...f.bind("name")} />
      <Field label="Mobile number" type="tel" autoComplete="tel-national" hint="10-digit Indian mobile" {...f.bind("phone")} />
      <Field label="Email" type="email" value={user.email} disabled readOnly hint="Contact support to change your email." />
      <div className="flex items-end gap-4">
        <Button type="submit" variant="brown" disabled={f.status.busy}>
          {f.status.busy ? "Saving…" : "Save changes"}
        </Button>
        <span role="status" className="pb-3 text-sm text-leaf-800">{f.status.message}</span>
      </div>
    </Card>
  );
}

function PasswordForm() {
  const { changePassword } = useAuth();
  const f = useFormState({ currentPassword: "", newPassword: "" });

  async function submit(e) {
    e.preventDefault();
    const strength = passwordStrength(f.values.newPassword);
    if (!f.values.currentPassword) return f.setErrors({ currentPassword: "Enter your current password" });
    if (!strength.valid) return f.setErrors({ newPassword: strength.hint });
    f.setErrors({});
    f.setStatus({ busy: true, message: "" });
    try {
      await changePassword(f.values);
      f.setValues({ currentPassword: "", newPassword: "" });
      f.setStatus({ busy: false, message: "Password changed. Other devices have been signed out." });
    } catch (err) {
      f.setErrors({ currentPassword: err.fieldErrors.currentPassword ?? err.message });
      f.setStatus({ busy: false, message: "" });
    }
    return undefined;
  }

  return (
    <Card as="form" onSubmit={submit} noValidate className="grid gap-4 p-6 sm:grid-cols-2">
      <h3 className="text-xl sm:col-span-2">Change password</h3>
      <Field label="Current password" type="password" autoComplete="current-password" {...f.bind("currentPassword")} />
      <Field label="New password" type="password" autoComplete="new-password" hint="8+ characters with a letter and a number" {...f.bind("newPassword")} />
      <div className="flex flex-wrap items-center gap-4 sm:col-span-2">
        <Button type="submit" variant="outline" disabled={f.status.busy}>
          {f.status.busy ? "Updating…" : "Change password"}
        </Button>
        <span role="status" className="text-sm text-leaf-800">{f.status.message}</span>
      </div>
    </Card>
  );
}

function Sessions() {
  const { logoutEverywhere } = useAuth();
  const navigate = useNavigate();
  const [confirming, setConfirming] = useState(false);

  async function signOutAll() {
    await logoutEverywhere();
    navigate("/login", { replace: true, state: { notice: "You’ve been signed out on all devices." } });
  }

  return (
    <Card className="flex flex-col gap-4 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-xl">Email code at sign-in</h3>
          <p className="text-sm text-ink-500">Every sign-in is confirmed with a one-time code sent to your email.</p>
        </div>
        <span className="rounded-full bg-leaf-50 px-3 py-1.5 text-[13px] font-semibold text-leaf-800">On</span>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-sand-400 pt-4">
        <div>
          <h3 className="text-xl">Active sessions</h3>
          <p className="text-sm text-ink-500">Signed in somewhere you don’t recognise? Sign out everywhere.</p>
        </div>
        {confirming ? (
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setConfirming(false)}>Cancel</Button>
            <Button variant="danger" size="sm" onClick={signOutAll}>Yes, sign out everywhere</Button>
          </div>
        ) : (
          <Button variant="danger" size="sm" onClick={() => setConfirming(true)}>Sign out everywhere</Button>
        )}
      </div>
    </Card>
  );
}

export default function Profile() {
  return (
    <div className="flex flex-col gap-5">
      <h2 className="text-[26px]">Profile &amp; security</h2>
      <ProfileForm />
      <PasswordForm />
      <Sessions />
    </div>
  );
}
