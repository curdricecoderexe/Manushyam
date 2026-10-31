import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { Download, Trash2 } from "lucide-react";
import { useAuth } from "../../auth/context";
import { Card, Field } from "../../components/ui/primitives";
import { Button } from "../../components/ui/button";
import { api, downloadFile } from "../../lib/api";
import { openCookieSettings, useConsent } from "../../lib/consent";
import { today } from "../../lib/exporters";
import { useToast } from "../../toast/context";

function CookieChoices() {
  const consent = useConsent();
  const status = !consent ? "Not chosen yet" : consent.analytics ? "Analytics allowed" : "Essential only";
  return (
    <Card className="flex flex-wrap items-center justify-between gap-4 p-6">
      <div className="max-w-xl">
        <h3 className="text-xl">Cookies on this device</h3>
        <p className="text-sm text-ink-500">
          {status}
          {consent && ` · chosen ${new Date(consent.at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}`}. You can withdraw analytics consent at any time.
        </p>
      </div>
      <Button variant="outline" size="sm" onClick={openCookieSettings}>
        Cookie settings
      </Button>
    </Card>
  );
}

function DownloadData() {
  const [state, setState] = useState({ busy: false, error: "" });
  async function download() {
    setState({ busy: true, error: "" });
    try {
      await downloadFile("/api/me/data-export", `manushyam-my-data-${today()}.json`);
      setState({ busy: false, error: "" });
    } catch (err) {
      setState({ busy: false, error: err.message });
    }
  }
  return (
    <Card className="flex flex-col gap-4 p-6">
      <div>
        <h3 className="text-xl">Download my data</h3>
        <p className="text-sm text-ink-500">One file (JSON) with your profile, addresses, orders, reviews, wishlist, support chats, newsletter status and cookie choices.</p>
      </div>
      <div className="flex flex-wrap items-center gap-4">
        <Button variant="brown" size="sm" onClick={download} disabled={state.busy}>
          <Download className="h-4 w-4" aria-hidden="true" /> {state.busy ? "Preparing…" : "Download my data"}
        </Button>
        <span role="alert" className="text-sm text-danger-600">
          {state.error}
        </span>
      </div>
    </Card>
  );
}

function DeleteAccount() {
  const { user, logout } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState({ password: "", confirm: "" });
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const isCustomer = user.role === "customer";

  async function submit(e) {
    e.preventDefault();
    const next = {};
    if (!values.password) next.password = "Enter your password";
    if (values.confirm !== "DELETE") next.confirm = "Type DELETE to confirm";
    setErrors(next);
    if (Object.keys(next).length) return;
    setBusy(true);
    try {
      await api("/api/me/delete", { method: "POST", body: values });
      // Leave the protected page first, or its sign-in guard would redirect to /login.
      await navigate("/", { replace: true });
      await logout().catch(() => {});
      toast({ message: "Your account has been deleted. A confirmation is on its way to your email." });
    } catch (err) {
      setErrors(Object.keys(err.fieldErrors).length ? err.fieldErrors : { form: err.message });
      setBusy(false);
    }
  }

  return (
    <Card className="flex flex-col gap-4 border-danger-600/40 p-6">
      <div>
        <h3 className="text-xl">Delete my account</h3>
        <p className="text-sm text-ink-500">This permanently erases your profile, addresses, wishlist, cart, reviews, support chats and newsletter subscription, and signs you out everywhere.</p>
        <p className="mt-2 text-sm text-ink-500">
          GST law requires us to keep invoices for past orders. Those are kept without your name, email, phone or street address (only the city, state and PIN code remain). Orders still on their way must be delivered or cancelled first.
        </p>
      </div>
      {!isCustomer ? (
        <p className="text-sm text-ink-700">Staff and admin accounts are removed by an admin.</p>
      ) : !open ? (
        <Button variant="danger" size="sm" className="self-start" onClick={() => setOpen(true)}>
          <Trash2 className="h-4 w-4" aria-hidden="true" /> Delete my account
        </Button>
      ) : (
        <form onSubmit={submit} noValidate aria-label="Confirm account deletion" className="grid gap-4 rounded-lg border border-danger-600/40 bg-danger-50/40 p-4 sm:grid-cols-2">
          <Field label="Your password" type="password" autoComplete="current-password" value={values.password} error={errors.password} onChange={(e) => setValues((v) => ({ ...v, password: e.target.value }))} />
          <Field label="Confirm by typing DELETE" autoComplete="off" value={values.confirm} error={errors.confirm} onChange={(e) => setValues((v) => ({ ...v, confirm: e.target.value }))} />
          {errors.form && (
            <p role="alert" className="text-sm text-danger-600 sm:col-span-2">
              {errors.form} {errors.form.includes("order") && <Link to="/account/orders" className="font-semibold underline">View my orders</Link>}
            </p>
          )}
          <div className="flex flex-wrap gap-2 sm:col-span-2">
            <Button type="submit" variant="danger" size="sm" disabled={busy}>
              {busy ? "Deleting…" : "Permanently delete my account"}
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={() => setOpen(false)} disabled={busy}>
              Cancel
            </Button>
          </div>
        </form>
      )}
    </Card>
  );
}

export default function Privacy() {
  return (
    <div className="flex flex-col gap-5">
      <div>
        <h2 className="text-[26px]">Privacy &amp; data</h2>
        <p className="text-sm text-ink-500">
          Your rights under the Digital Personal Data Protection Act, 2023. Read our{" "}
          <Link to="/policies/privacy" className="font-semibold text-gold-700 underline">
            privacy policy
          </Link>
          .
        </p>
      </div>
      <CookieChoices />
      <DownloadData />
      <DeleteAccount />
    </div>
  );
}
