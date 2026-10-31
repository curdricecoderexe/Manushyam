import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router";
import { Download, UserPlus } from "lucide-react";
import { AdminPage, Panel } from "../../components/admin/AdminPage";
import { DataTable, ErrorNote, FilterSelect, Pager, SearchInput } from "../../components/admin/controls";
import { useUrlParams } from "../../lib/admin";
import { Dialog } from "../../components/ui/Dialog";
import { Field, Skeleton, StatusPill } from "../../components/ui/primitives";
import { Button } from "../../components/ui/button";
import { useAuth } from "../../auth/context";
import { useToast } from "../../toast/context";
import { api } from "../../lib/api";
import { downloadExcel, today } from "../../lib/exporters";
import { formatDate, STATUS_LABELS } from "../../lib/orders";
import { formatPaise } from "../../lib/cn";

const ROLE_TONE = { admin: "purple", staff: "blue", customer: "grey" };
const ROLE_LABEL = { admin: "Admin", staff: "Staff", customer: "Customer" };

function statusOf(u) {
  if (u.deletedAt) return { label: "Deleted", tone: "red" };
  return u.isActive ? { label: "Active", tone: "green" } : { label: "Inactive", tone: "amber" };
}

function NewUserForm({ onCreated }) {
  const [v, setV] = useState({ name: "", email: "", phone: "", role: "customer" });
  const [errors, setErrors] = useState({});
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const bind = (k) => ({ value: v[k], onChange: (e) => setV((s) => ({ ...s, [k]: e.target.value })), error: errors[k] });
  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setErrors({});
    try {
      const { user } = await api("/api/admin/users", { method: "POST", body: { name: v.name, email: v.email, role: v.role, ...(v.phone.trim() ? { phone: v.phone.trim() } : {}) } });
      onCreated(user);
    } catch (err) {
      setErrors(err.fieldErrors);
      setError(err.message);
      setBusy(false);
    }
  }
  return (
    <form aria-label="New user" onSubmit={submit} className="flex flex-col gap-4 p-5">
      <Field label="Full name" required {...bind("name")} />
      <Field label="Email" type="email" required {...bind("email")} />
      <Field label="Mobile (optional)" inputMode="numeric" maxLength={10} {...bind("phone")} />
      <FilterSelect label="Role" value={v.role} onChange={(role) => setV((s) => ({ ...s, role }))} options={Object.entries(ROLE_LABEL)} />
      <p className="text-sm text-ink-500">We’ll email them a link to choose their own password. Staff and admins confirm every sign-in with an emailed code.</p>
      <ErrorNote>{error}</ErrorNote>
      <Button type="submit" variant="brown" size="sm" disabled={busy}>
        Create account
      </Button>
    </form>
  );
}

function UserPanel({ userId, onChanged }) {
  const { user: me } = useAuth();
  const { toast } = useToast();
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(null); // "soft" | "hard"

  useEffect(() => {
    let cancelled = false;
    api(`/api/admin/users/${userId}`)
      .then((d) => !cancelled && setData(d))
      .catch((err) => !cancelled && setError(err.message));
    return () => {
      cancelled = true;
    };
  }, [userId]);

  async function run(fn, message) {
    setBusy(true);
    setError("");
    try {
      const result = await fn();
      if (result?.user) setData((d) => ({ ...d, user: { ...d.user, ...result.user } }));
      onChanged(result);
      toast({ message });
      return result;
    } catch (err) {
      setError(err.message);
      return null;
    } finally {
      setBusy(false);
    }
  }

  if (!data) return error ? <p className="p-5 text-danger-600">{error}</p> : <Skeleton className="m-5 h-72" />;
  const u = data.user;
  const self = u.id === me.id;
  const st = statusOf(u);
  const patch = (body, message) => run(() => api(`/api/admin/users/${u.id}`, { method: "PATCH", body }), message);

  return (
    <div className="flex flex-col gap-5 p-5 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <StatusPill tone={ROLE_TONE[u.role]}>{ROLE_LABEL[u.role]}</StatusPill>
        <StatusPill tone={st.tone}>{st.label}</StatusPill>
        {self && <span className="text-xs text-ink-500">This is you</span>}
      </div>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-2">
        <dt className="text-ink-500">Email</dt>
        <dd className="break-all">{u.email}</dd>
        <dt className="text-ink-500">Mobile</dt>
        <dd>{u.phone ? `+91 ${u.phone}` : "—"}</dd>
        <dt className="text-ink-500">Joined</dt>
        <dd>{formatDate(u.createdAt)}</dd>
        <dt className="text-ink-500">Last sign-in</dt>
        <dd>{u.lastLoginAt ? formatDate(u.lastLoginAt) : "—"}</dd>
        <dt className="text-ink-500">Orders · spent</dt>
        <dd>
          {u.orders} · {formatPaise(u.spent)}
        </dd>
        <dt className="text-ink-500">Saved addresses</dt>
        <dd>{data.addresses}</dd>
      </dl>
      <ErrorNote>{error}</ErrorNote>

      {!u.deletedAt && !self && (
        <section aria-label="Access" className="flex flex-col gap-3 rounded-md border border-sand-400 p-3">
          <FilterSelect label="Role" value={u.role} onChange={(role) => patch({ role }, `Role changed to ${ROLE_LABEL[role]}. Their sessions were signed out.`)} options={Object.entries(ROLE_LABEL)} />
          <div className="flex flex-wrap gap-2">
            {u.isActive ? (
              <Button size="sm" variant="outline" disabled={busy} onClick={() => patch({ isActive: false }, "Account deactivated.")}>
                Deactivate
              </Button>
            ) : (
              <Button size="sm" variant="brown" disabled={busy} onClick={() => patch({ isActive: true }, "Account activated.")}>
                Activate
              </Button>
            )}
            <Button size="sm" variant="danger" disabled={busy} onClick={() => setConfirm("soft")}>
              Delete…
            </Button>
          </div>
        </section>
      )}
      {u.deletedAt && (
        <div className="flex flex-wrap items-center gap-2 rounded-md bg-danger-50 p-3">
          <span>Deleted {formatDate(u.deletedAt)}. They can’t sign in.</span>
          <Button size="sm" variant="brown" disabled={busy} onClick={() => run(() => api(`/api/admin/users/${u.id}/restore`, { method: "POST" }), "Account restored.")}>
            Restore
          </Button>
          {u.orders === 0 && (
            <Button size="sm" variant="danger" disabled={busy} onClick={() => setConfirm("hard")}>
              Delete permanently…
            </Button>
          )}
        </div>
      )}
      {confirm && (
        <div role="group" aria-label="Confirm delete" className="flex flex-col gap-3 rounded-md border border-danger-600/40 bg-danger-50 p-3">
          {confirm === "soft" ? (
            <p>The account will be hidden and can’t sign in. Orders and history are kept, and you can restore it later.</p>
          ) : (
            <p>This removes the account, addresses, cart, wishlist, reviews and chats for good. It can’t be undone.</p>
          )}
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="danger"
              disabled={busy}
              onClick={async () => {
                const r = await run(() => api(`/api/admin/users/${u.id}${confirm === "hard" ? "?mode=hard" : ""}`, { method: "DELETE" }), confirm === "hard" ? "Account deleted permanently." : "Account deleted.");
                setConfirm(null);
                if (r?.deleted === "soft") setData((d) => ({ ...d, user: { ...d.user, deletedAt: new Date().toISOString(), isActive: false } }));
              }}
            >
              {confirm === "hard" ? "Delete permanently" : "Delete account"}
            </Button>
            <Button size="sm" variant="outline" onClick={() => setConfirm(null)}>
              Keep
            </Button>
          </div>
        </div>
      )}

      <section aria-label="Recent orders">
        <h3 className="mb-1.5 font-serif text-base text-cocoa-900">Recent orders</h3>
        {data.recentOrders.length === 0 ? (
          <p className="text-ink-500">No orders yet.</p>
        ) : (
          <ul className="divide-y divide-sand-400 rounded-md border border-sand-400">
            {data.recentOrders.map((o) => (
              <li key={o.id} className="flex items-center justify-between gap-3 px-3 py-2">
                <Link to={`/admin/orders?q=${o.orderNumber}`} className="font-mono text-xs text-gold-700">
                  {o.orderNumber}
                </Link>
                <span className="text-xs text-ink-500">{STATUS_LABELS[o.status]}</span>
                <span className="tabular-nums">{formatPaise(o.total)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

async function exportUsers({ role, status, q }) {
  const users = [];
  for (let page = 1; page <= 100; page += 1) {
    const qs = new URLSearchParams({ page: String(page), limit: "100", ...(role ? { role } : {}), ...(status ? { status } : {}), ...(q ? { q } : {}) });
    const d = await api(`/api/admin/users?${qs}`);
    users.push(...d.users);
    if (page >= d.pages) break;
  }
  await downloadExcel(
    `manushyam-users-${today()}.xlsx`,
    [
      { header: "Name", value: (u) => u.name, width: 26 },
      { header: "Email", value: (u) => u.email, width: 32 },
      { header: "Mobile", value: (u) => u.phone, width: 14 },
      { header: "Role", value: (u) => ROLE_LABEL[u.role], width: 11 },
      { header: "Status", value: (u) => statusOf(u).label, width: 11 },
      { header: "Orders", value: (u) => u.orders, type: Number, width: 9 },
      { header: "Spent (₹)", value: (u) => u.spent / 100, type: Number, format: "#,##0.00", width: 13 },
      { header: "Joined", value: (u) => new Date(u.createdAt), type: Date, format: "dd/mm/yyyy", width: 12 },
      { header: "Last sign-in", value: (u) => (u.lastLoginAt ? new Date(u.lastLoginAt) : null), type: Date, format: "dd/mm/yyyy", width: 13 },
    ],
    users
  );
  return users.length;
}

export default function Users() {
  const { toast } = useToast();
  const { get, setParam } = useUrlParams();
  const q = get("q");
  const role = get("role");
  const status = get("status");
  const page = Number(get("page", "1"));
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [openId, setOpenId] = useState(null);
  const [creating, setCreating] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const commitQ = useCallback((v) => setParam("q", v), [setParam]);

  useEffect(() => {
    let cancelled = false;
    const qs = new URLSearchParams({ page: String(page), ...(q ? { q } : {}), ...(role ? { role } : {}), ...(status ? { status } : {}) });
    api(`/api/admin/users?${qs}`)
      .then((d) => {
        if (cancelled) return;
        setData(d);
        setError("");
      })
      .catch((err) => !cancelled && setError(err.message));
    return () => {
      cancelled = true;
    };
  }, [q, role, status, page, reloadKey]);

  async function onExport() {
    setExporting(true);
    try {
      toast({ message: `Exported ${await exportUsers({ role, status, q })} accounts.` });
    } catch (err) {
      toast({ message: err.message || "Export failed.", tone: "error" });
    } finally {
      setExporting(false);
    }
  }

  const opened = data?.users.find((u) => u.id === openId);
  return (
    <AdminPage
      title="Users"
      subtitle={data ? `${data.counts.customer ?? 0} customers · ${data.counts.staff ?? 0} staff · ${data.counts.admin ?? 0} admins` : undefined}
      actions={
        <>
          <Button variant="outline" size="sm" onClick={onExport} disabled={exporting}>
            <Download className="h-4 w-4" aria-hidden="true" /> {exporting ? "Exporting…" : "Export to Excel"}
          </Button>
          <Button variant="brown" size="sm" onClick={() => setCreating(true)}>
            <UserPlus className="h-4 w-4" aria-hidden="true" /> New user
          </Button>
        </>
      }
    >
      <div className="flex flex-wrap items-end gap-3">
        <SearchInput id="user-search" label="Search users" value={q} onCommit={commitQ} placeholder="Name, email or mobile" />
        <FilterSelect label="Role" value={role} onChange={(v) => setParam("role", v)} options={[["", "All roles"], ...Object.entries(ROLE_LABEL)]} />
        <FilterSelect
          label="Status"
          value={status}
          onChange={(v) => setParam("status", v)}
          options={[
            ["", "All"],
            ["active", "Active"],
            ["inactive", "Inactive"],
            ["deleted", "Deleted"],
          ]}
        />
      </div>
      <ErrorNote>{error}</ErrorNote>
      <Panel>
        {!data ? (
          <Skeleton className="m-5 h-64" />
        ) : data.users.length === 0 ? (
          <p className="p-8 text-center text-ink-500">No accounts match.</p>
        ) : (
          <DataTable caption="Accounts" head={["Name", "Role", "Status", { label: "Orders", className: "text-right" }, { label: "Spent", className: "text-right" }, "Joined"]}>
            {data.users.map((u) => {
              const st = statusOf(u);
              return (
                <tr key={u.id}>
                  <td>
                    <button type="button" onClick={() => setOpenId(u.id)} className="text-left font-medium text-cocoa-900 hover:text-gold-700">
                      {u.name}
                    </button>
                    <span className="block text-xs text-ink-500">{u.email}</span>
                  </td>
                  <td>
                    <StatusPill tone={ROLE_TONE[u.role]}>{ROLE_LABEL[u.role]}</StatusPill>
                  </td>
                  <td>
                    <StatusPill tone={st.tone}>{st.label}</StatusPill>
                  </td>
                  <td className="text-right tabular-nums">{u.orders}</td>
                  <td className="text-right tabular-nums">{formatPaise(u.spent)}</td>
                  <td className="text-ink-700">{formatDate(u.createdAt)}</td>
                </tr>
              );
            })}
          </DataTable>
        )}
      </Panel>
      {data && <Pager page={data.page} pages={data.pages} onPage={(p) => setParam("page", String(p))} />}

      <Dialog open={Boolean(openId)} onClose={() => setOpenId(null)} title={opened?.name ?? "Account"} side="right" className="admin-scope">
        {openId && <UserPanel key={openId} userId={openId} onChanged={() => setReloadKey((k) => k + 1)} />}
      </Dialog>
      <Dialog open={creating} onClose={() => setCreating(false)} title="New user" side="right" className="admin-scope">
        {creating && (
          <NewUserForm
            onCreated={(user) => {
              setCreating(false);
              setReloadKey((k) => k + 1);
              toast({ message: `Account created for ${user.email}. We’ve emailed them.` });
            }}
          />
        )}
      </Dialog>
    </AdminPage>
  );
}
