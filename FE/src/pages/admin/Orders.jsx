import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router";
import { Download, ExternalLink, Printer, RotateCw, Search } from "lucide-react";
import { AdminPage, Panel } from "../../components/admin/AdminPage";
import { DataTable, ErrorNote, Pager } from "../../components/admin/controls";
import { Dialog } from "../../components/ui/Dialog";
import { Field, Skeleton, StatusPill } from "../../components/ui/primitives";
import { Button } from "../../components/ui/button";
import { useAuth } from "../../auth/context";
import { useToast } from "../../toast/context";
import { api, downloadFile } from "../../lib/api";
import { downloadCsv, downloadExcel, today } from "../../lib/exporters";
import { STATUS_LABELS, STATUS_TONES, formatDate, formatDateTime } from "../../lib/orders";
import { cn, formatPaise } from "../../lib/cn";

// Mirrors BE/Services/orderState.js (the server is the authority and rejects anything else).
const NEXT = {
  paid: ["processing", "packed"],
  cod_confirmed: ["processing", "packed"],
  processing: ["packed"],
  packed: ["shipped", "rto"],
  shipped: ["out_for_delivery", "delivered", "rto"],
  out_for_delivery: ["delivered", "rto"],
};
const CANCELLABLE = ["payment_pending", "cod_pending_confirmation", "paid", "cod_confirmed", "processing", "packed"];
const ACTION_LABELS = { processing: "Start processing", packed: "Mark as packed", shipped: "Mark as shipped", out_for_delivery: "Out for delivery", delivered: "Mark as delivered", rto: "Returned to origin (RTO)" };
const STATUS_ORDER = ["paid", "cod_confirmed", "processing", "packed", "shipped", "out_for_delivery", "delivered", "payment_pending", "cod_pending_confirmation", "cancelled", "rto", "refunded"];
const PAYMENT = { razorpay: "Prepaid", cod: "COD" };

const mapsUrl = (a) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([a.line1, a.line2, a.landmark, a.city, a.state, a.pincode].filter(Boolean).join(", "))}`;

function ShipForm({ onSubmit, busy }) {
  const [v, setV] = useState({ courier: "", awb: "", trackingUrl: "" });
  const bind = (k) => ({ value: v[k], onChange: (e) => setV((s) => ({ ...s, [k]: e.target.value })) });
  return (
    <form
      className="grid gap-3 rounded-md border border-sand-400 bg-cream-50 p-3 sm:grid-cols-3"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(Object.fromEntries(Object.entries(v).filter(([, val]) => val.trim())));
      }}
    >
      <Field label="Courier" {...bind("courier")} />
      <Field label="AWB number" {...bind("awb")} />
      <Field label="Tracking link (https)" type="url" {...bind("trackingUrl")} />
      <Button type="submit" size="sm" variant="brown" disabled={busy} className="sm:col-span-3">
        Confirm shipped
      </Button>
    </form>
  );
}

function RefundForm({ order, onDone }) {
  const cod = order.paymentMethod === "cod";
  const [amount, setAmount] = useState(String(order.amounts.total / 100));
  const [note, setNote] = useState("");
  const [reference, setReference] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const paise = Math.round(Number(amount) * 100);
      const { order: updated } = await api(`/api/admin/orders/${order.id}/refund`, { method: "POST", body: { amount: paise, ...(note ? { note } : {}), ...(reference ? { reference } : {}) } });
      onDone(updated, cod ? "Refund recorded." : "Refund started with Razorpay.");
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }
  return (
    <form onSubmit={submit} className="flex flex-col gap-3 rounded-md border border-sand-400 bg-cream-50 p-3" aria-label="Refund">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Amount (₹)" type="number" min="1" step="0.01" max={order.amounts.total / 100} value={amount} onChange={(e) => setAmount(e.target.value)} />
        {cod && <Field label="Bank / UPI reference" required value={reference} onChange={(e) => setReference(e.target.value)} hint="COD refunds are paid manually" />}
      </div>
      <Field label="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
      {error && (
        <p role="alert" className="text-sm text-danger-600">
          {error}
        </p>
      )}
      <Button type="submit" size="sm" variant="danger" disabled={busy}>
        {cod ? "Record refund" : "Refund via Razorpay"}
      </Button>
    </form>
  );
}

function OrderPanel({ orderId, onChanged }) {
  const { user } = useAuth();
  const { toast } = useToast();
  const isAdmin = user.role === "admin";
  const [order, setOrder] = useState(null);
  const [shiprocket, setShiprocket] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState(null); // "ship" | "cancel" | "refund"
  const [cancelNote, setCancelNote] = useState("");

  useEffect(() => {
    let cancelled = false;
    api(`/api/admin/orders/${orderId}`)
      .then((d) => {
        if (cancelled) return;
        setOrder(d.order);
        setShiprocket(d.shiprocket);
      })
      .catch((err) => !cancelled && setError(err.message));
    return () => {
      cancelled = true;
    };
  }, [orderId]);

  const applied = (updated, message) => {
    setOrder(updated);
    setMode(null);
    onChanged();
    if (message) toast({ message });
  };

  async function move(status, extra = {}) {
    setBusy(true);
    setError("");
    try {
      const { order: updated } = await api(`/api/admin/orders/${orderId}/status`, { method: "POST", body: { status, ...extra } });
      applied(updated, `Order marked ${STATUS_LABELS[updated.status].toLowerCase()}.`);
      if (status === "packed" && updated.shipment?.error) setError(`Courier booking failed: ${updated.shipment.error}`);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function retryBooking() {
    setBusy(true);
    setError("");
    try {
      const { order: updated } = await api(`/api/admin/orders/${orderId}/shipment`, { method: "POST" });
      applied(updated, updated.shipment?.awb ? "Courier booked." : null);
      if (updated.shipment?.error) setError(`Courier booking failed: ${updated.shipment.error}`);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (error && !order) return <p className="p-6 text-danger-600">{error}</p>;
  if (!order) return <Skeleton className="m-6 h-96" />;

  const a = order.amounts;
  const s = order.shipment ?? {};
  const next = NEXT[order.status] ?? [];
  const refundable = isAdmin && ["cancelled", "delivered", "rto"].includes(order.status) && !["pending", "processed"].includes(order.refund?.status) && (order.paymentMethod === "cod" ? order.status === "delivered" : Boolean(order.payment?.capturedAt));

  return (
    <div className="flex flex-col gap-5 p-5 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-xs text-ink-500">Placed {formatDateTime(order.createdAt)}</p>
          <p className="text-ink-700">
            {PAYMENT[order.paymentMethod]} · {formatPaise(a.total)}
            {order.invoiceNumber && ` · Invoice ${order.invoiceNumber}`}
          </p>
        </div>
        <StatusPill tone={STATUS_TONES[order.status]}>{STATUS_LABELS[order.status]}</StatusPill>
      </div>

      {error && (
        <p role="alert" className="rounded-md border border-danger-600/30 bg-danger-50 px-3 py-2 text-danger-600">
          {error}
        </p>
      )}
      {order.refund?.status && order.refund.status !== "none" && (
        <p className="rounded-md bg-gold-50 px-3 py-2">
          Refund {order.refund.status}
          {order.refund.amount ? ` · ${formatPaise(order.refund.amount)}` : ""}
          {order.refund.reference ? ` · ref ${order.refund.reference}` : ""}
        </p>
      )}

      <section aria-label="Next steps" className="flex flex-col gap-2">
        <div className="flex flex-wrap gap-2">
          {next.map((to) =>
            to === "shipped" ? (
              <Button key={to} size="sm" variant={mode === "ship" ? "outline" : "brown"} disabled={busy} onClick={() => (s.awb ? move("shipped") : setMode(mode === "ship" ? null : "ship"))}>
                {ACTION_LABELS[to]}
              </Button>
            ) : (
              <Button key={to} size="sm" variant={to === "rto" ? "outline" : "brown"} disabled={busy} onClick={() => move(to)}>
                {to === "packed" && shiprocket ? "Pack & book courier" : ACTION_LABELS[to]}
              </Button>
            )
          )}
          {order.invoiceNumber && (
            <Button size="sm" variant="outline" onClick={() => downloadFile(`/api/admin/orders/${order.id}/invoice`, `invoice-${order.orderNumber}.pdf`).catch((err) => setError(err.message))}>
              GST invoice
            </Button>
          )}
          {isAdmin && CANCELLABLE.includes(order.status) && (
            <Button size="sm" variant="danger" onClick={() => setMode(mode === "cancel" ? null : "cancel")}>
              Cancel order
            </Button>
          )}
          {refundable && (
            <Button size="sm" variant="danger" onClick={() => setMode(mode === "refund" ? null : "refund")}>
              Refund
            </Button>
          )}
        </div>
        {mode === "ship" && <ShipForm busy={busy} onSubmit={(shipment) => move("shipped", Object.keys(shipment).length ? { shipment } : {})} />}
        {mode === "cancel" && (
          <form
            className="flex flex-col gap-3 rounded-md border border-danger-600/30 bg-danger-50 p-3"
            onSubmit={(e) => {
              e.preventDefault();
              move("cancelled", cancelNote ? { note: cancelNote } : {});
            }}
          >
            <Field label="Reason (shown to the customer)" value={cancelNote} onChange={(e) => setCancelNote(e.target.value)} maxLength={300} />
            {order.payment?.capturedAt && <p>The payment will be marked for refund.</p>}
            <Button type="submit" size="sm" variant="danger" disabled={busy}>
              Confirm cancellation
            </Button>
          </form>
        )}
        {mode === "refund" && <RefundForm order={order} onDone={applied} />}
      </section>

      {(s.awb || s.error || s.shipmentId) && (
        <section aria-label="Shipment" className="flex flex-col gap-1.5 rounded-md border border-sand-400 p-3">
          <h3 className="font-serif text-base text-cocoa-900">Shipment</h3>
          {s.awb && (
            <p>
              {s.courier ?? "Courier"} · AWB <span className="font-mono">{s.awb}</span>
            </p>
          )}
          <div className="flex flex-wrap gap-3">
            {s.labelUrl && (
              <a href={s.labelUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 font-semibold text-gold-700">
                <Printer className="h-4 w-4" aria-hidden="true" /> Print label
              </a>
            )}
            {s.trackingUrl && (
              <a href={s.trackingUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 font-semibold text-gold-700">
                <ExternalLink className="h-4 w-4" aria-hidden="true" /> Tracking
              </a>
            )}
          </div>
          {s.error && (
            <div className="flex flex-wrap items-center gap-2 text-danger-600">
              Booking failed: {s.error}
              {order.status === "packed" && shiprocket && (
                <Button size="sm" variant="outline" disabled={busy} onClick={retryBooking}>
                  <RotateCw className="h-4 w-4" aria-hidden="true" /> Retry booking
                </Button>
              )}
            </div>
          )}
        </section>
      )}

      <section aria-label="Items">
        <ul className="divide-y divide-sand-400 rounded-md border border-sand-400">
          {order.items.map((i) => (
            <li key={i.sku} className="flex justify-between gap-3 px-3 py-2">
              <span>
                {i.name} <span className="text-ink-500">· {i.variantLabel}</span>
                <span className="block font-mono text-xs text-ink-500">
                  {i.sku} × {i.qty}
                </span>
              </span>
              <span className="tabular-nums">{formatPaise(i.lineTotal)}</span>
            </li>
          ))}
        </ul>
        <dl className="ml-auto mt-2 grid max-w-[260px] grid-cols-2 gap-1 text-right">
          <dt className="text-ink-500">Subtotal</dt>
          <dd>{formatPaise(a.subtotal)}</dd>
          {a.discount > 0 && (
            <>
              <dt className="text-ink-500">Discount {order.coupon?.code}</dt>
              <dd>− {formatPaise(a.discount)}</dd>
            </>
          )}
          <dt className="text-ink-500">Shipping</dt>
          <dd>{a.shipping ? formatPaise(a.shipping) : "Free"}</dd>
          {a.codFee > 0 && (
            <>
              <dt className="text-ink-500">COD fee</dt>
              <dd>{formatPaise(a.codFee)}</dd>
            </>
          )}
          <dt className="font-semibold text-cocoa-900">Total</dt>
          <dd className="font-semibold text-cocoa-900">{formatPaise(a.total)}</dd>
        </dl>
      </section>

      <section aria-label="Customer" className="grid gap-3 sm:grid-cols-2">
        <div>
          <h3 className="mb-1 font-serif text-base text-cocoa-900">Ship to</h3>
          <p>{order.address.fullName}</p>
          <p>{[order.address.line1, order.address.line2, order.address.landmark].filter(Boolean).join(", ")}</p>
          <p>
            {order.address.city}, {order.address.state} {order.address.pincode}
          </p>
          <a href={mapsUrl(order.address)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-semibold text-gold-700">
            Open in Google Maps <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
          </a>
        </div>
        <div>
          <h3 className="mb-1 font-serif text-base text-cocoa-900">Contact</h3>
          <p>{order.customerName}</p>
          <p>
            <a href={`mailto:${order.email}`}>{order.email}</a>
          </p>
          <p>
            <a href={`tel:+91${order.address.phone}`}>+91 {order.address.phone}</a>
          </p>
        </div>
      </section>

      <section aria-label="History">
        <h3 className="mb-1.5 font-serif text-base text-cocoa-900">History</h3>
        <ol className="flex flex-col gap-1.5 border-l border-sand-400 pl-3">
          {[...order.history].reverse().map((h, i) => (
            <li key={`${h.at}-${i}`}>
              <span className="font-medium text-cocoa-900">{STATUS_LABELS[h.status]}</span>
              <span className="text-ink-500">
                {" "}
                · {formatDateTime(h.at)} · {h.source}
                {h.note ? ` · ${h.note}` : ""}
              </span>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}

const rupees = (p) => p / 100;
const EXPORT_COLUMNS = [
  { header: "Order", value: (r) => r.orderNumber, width: 18 },
  { header: "Invoice", value: (r) => r.invoiceNumber, width: 18 },
  { header: "Placed (IST)", value: (r) => new Date(r.placedAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }), width: 22 },
  { header: "Status", value: (r) => STATUS_LABELS[r.status] ?? r.status, width: 16 },
  { header: "Payment", value: (r) => PAYMENT[r.paymentMethod], width: 9 },
  { header: "Customer", value: (r) => r.customer, width: 22 },
  { header: "Email", value: (r) => r.email, width: 28 },
  { header: "Phone", value: (r) => r.phone, width: 12 },
  { header: "City", value: (r) => r.city, width: 14 },
  { header: "State", value: (r) => r.state, width: 14 },
  { header: "PIN", value: (r) => r.pincode, width: 8 },
  { header: "Items", value: (r) => r.items, width: 36 },
  { header: "Units", value: (r) => r.units, type: Number, width: 7 },
  { header: "Subtotal (₹)", value: (r) => rupees(r.subtotal), type: Number, format: "#,##0.00", width: 12 },
  { header: "Discount (₹)", value: (r) => rupees(r.discount), type: Number, format: "#,##0.00", width: 12 },
  { header: "Coupon", value: (r) => r.coupon, width: 12 },
  { header: "Shipping (₹)", value: (r) => rupees(r.shipping), type: Number, format: "#,##0.00", width: 12 },
  { header: "COD fee (₹)", value: (r) => rupees(r.codFee), type: Number, format: "#,##0.00", width: 11 },
  { header: "Total (₹)", value: (r) => rupees(r.total), type: Number, format: "#,##0.00", width: 12 },
  { header: "Refunded (₹)", value: (r) => rupees(r.refunded), type: Number, format: "#,##0.00", width: 12 },
  { header: "Courier", value: (r) => r.courier, width: 14 },
  { header: "AWB", value: (r) => r.awb, width: 18 },
];

function ExportOrders({ status, payment }) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [range, setRange] = useState(() => ({ from: "", to: today() }));
  const [busy, setBusy] = useState(false);
  async function run(kind) {
    setBusy(true);
    try {
      const qs = new URLSearchParams({ ...(range.from ? { from: range.from } : {}), ...(range.to ? { to: range.to } : {}), ...(status ? { status } : {}), ...(payment ? { paymentMethod: payment } : {}) });
      const { rows, truncated, limit } = await api(`/api/admin/orders-export?${qs}`);
      const name = `manushyam-orders-${range.from || "all"}-to-${range.to || today()}`;
      if (kind === "csv") downloadCsv(`${name}.csv`, EXPORT_COLUMNS, rows);
      else await downloadExcel(`${name}.xlsx`, EXPORT_COLUMNS, rows);
      toast({ message: truncated ? `Exported the latest ${limit} orders — narrow the dates for the rest.` : `Exported ${rows.length} orders.` });
      setOpen(false);
    } catch (err) {
      toast({ message: err.message || "Export failed.", tone: "error" });
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        <Download className="h-4 w-4" aria-hidden="true" /> Export
      </Button>
      <Dialog open={open} onClose={() => setOpen(false)} title="Export orders" className="admin-scope max-w-md">
        <div className="flex flex-col gap-4 p-5 text-sm">
          <p className="text-ink-700">Uses the status and payment filters on the page. Dates are in India time; leave “From” empty for all past orders.</p>
          <div className="grid grid-cols-2 gap-3">
            <Field label="From" type="date" value={range.from} max={range.to || undefined} onChange={(e) => setRange((r) => ({ ...r, from: e.target.value }))} />
            <Field label="To" type="date" value={range.to} min={range.from || undefined} onChange={(e) => setRange((r) => ({ ...r, to: e.target.value }))} />
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="brown" disabled={busy} onClick={() => run("csv")}>
              Download CSV
            </Button>
            <Button size="sm" variant="outline" disabled={busy} onClick={() => run("xlsx")}>
              Download Excel
            </Button>
          </div>
        </div>
      </Dialog>
    </>
  );
}

export default function Orders() {
  const [params, setParams] = useSearchParams();
  const status = params.get("status") ?? "";
  const payment = params.get("payment") ?? "";
  const q = params.get("q") ?? "";
  const page = Number(params.get("page") ?? 1);
  const [search, setSearch] = useState(q);
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [openId, setOpenId] = useState(null);
  const [reloadKey, setReloadKey] = useState(0);

  const setParam = useCallback(
    (key, value) =>
      setParams(
        (p) => {
          const n = new URLSearchParams(p);
          if (value) n.set(key, value);
          else n.delete(key);
          if (key !== "page") n.delete("page");
          return n;
        },
        { replace: true }
      ),
    [setParams]
  );

  // Debounced search box → ?q=
  useEffect(() => {
    if (search === q) return undefined;
    const t = setTimeout(() => setParam("q", search.trim()), 300);
    return () => clearTimeout(t);
  }, [search, q, setParam]);

  useEffect(() => {
    let cancelled = false;
    const qs = new URLSearchParams({ page: String(page), ...(status ? { status } : {}), ...(payment ? { paymentMethod: payment } : {}), ...(q ? { q } : {}) });
    api(`/api/admin/orders?${qs}`)
      .then((d) => {
        if (cancelled) return;
        setData(d);
        setError("");
        // Deep link from a notification (?q=MM…): open the order straight away.
        if (q && d.orders.length === 1 && d.orders[0].orderNumber === q.toUpperCase()) setOpenId(d.orders[0].id);
      })
      .catch((err) => !cancelled && setError(err.message));
    return () => {
      cancelled = true;
    };
  }, [status, payment, q, page, reloadKey]);

  const opened = data?.orders.find((o) => o.id === openId);
  return (
    <AdminPage title="Orders" subtitle={data ? `${data.total} matching` : undefined} actions={<ExportOrders status={status} payment={payment} />}>
      <div className="flex flex-wrap items-end gap-3">
        <div className="relative w-full min-w-0 flex-none sm:w-auto sm:min-w-[260px] sm:flex-1">
          <label htmlFor="order-search" className="sr-only">
            Search orders
          </label>
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-500" aria-hidden="true" />
          <input
            id="order-search"
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Order number, name, email, phone or AWB"
            className="h-11 w-full rounded-md border border-sand-400 bg-white pl-10 pr-3 text-sm focus:outline-none"
          />
        </div>
        <label className="flex min-w-[140px] flex-1 flex-col gap-1.5 text-xs font-medium text-ink-700 sm:flex-none">
          Status
          <select value={status} onChange={(e) => setParam("status", e.target.value)} className="h-11 w-full rounded-md border border-sand-400 bg-white px-3 text-sm sm:min-w-[180px]">
            <option value="">All statuses</option>
            {STATUS_ORDER.map((st) => (
              <option key={st} value={st}>
                {STATUS_LABELS[st]}
                {data?.counts?.[st] ? ` (${data.counts[st]})` : ""}
              </option>
            ))}
          </select>
        </label>
        <label className="flex min-w-[140px] flex-1 flex-col gap-1.5 text-xs font-medium text-ink-700 sm:flex-none">
          Payment
          <select value={payment} onChange={(e) => setParam("payment", e.target.value)} className="h-11 w-full rounded-md border border-sand-400 bg-white px-3 text-sm sm:min-w-[160px]">
            <option value="">All</option>
            <option value="razorpay">Prepaid</option>
            <option value="cod">Cash on Delivery</option>
          </select>
        </label>
      </div>

      <ErrorNote>{error}</ErrorNote>
      <Panel>
        {!data ? (
          <Skeleton className="m-5 h-64" />
        ) : data.orders.length === 0 ? (
          <p className="p-8 text-center text-ink-500">No orders match these filters.</p>
        ) : (
          <DataTable caption="Orders" head={["Order", "Customer", { label: "Items", className: "text-right" }, { label: "Total", className: "text-right" }, "Payment", "Status"]}>
            {data.orders.map((o) => (
              <tr key={o.id} className={cn("cursor-pointer", o.id === openId && "bg-cream-50")} onClick={(e) => !e.target.closest("button,a") && setOpenId(o.id)}>
                <td>
                  <button type="button" onClick={() => setOpenId(o.id)} className="font-mono font-semibold text-cocoa-900 hover:text-gold-700">
                    {o.orderNumber}
                  </button>
                  <span className="block text-xs text-ink-500">{formatDate(o.createdAt)}</span>
                </td>
                <td>
                  <span>
                    {o.address?.fullName}
                    <span className="block text-xs text-ink-500">
                      {o.address?.city}, {o.address?.pincode}
                    </span>
                  </span>
                </td>
                <td className="text-right tabular-nums">{o.items.reduce((n, i) => n + i.qty, 0)}</td>
                <td className="text-right font-medium tabular-nums text-cocoa-900">{formatPaise(o.amounts.total)}</td>
                <td>{PAYMENT[o.paymentMethod]}</td>
                <td>
                  <span className="inline-flex flex-wrap items-center justify-end gap-1">
                    <StatusPill tone={STATUS_TONES[o.status]}>{STATUS_LABELS[o.status]}</StatusPill>
                    {o.shipment?.error && o.status === "packed" && <span className="text-xs text-danger-600">booking failed</span>}
                  </span>
                </td>
              </tr>
            ))}
          </DataTable>
        )}
      </Panel>
      {data && <Pager page={data.page} pages={data.pages} onPage={(p) => setParam("page", String(p))} />}

      <Dialog open={Boolean(openId)} onClose={() => setOpenId(null)} title={opened ? `Order ${opened.orderNumber}` : "Order"} side="right" className="admin-scope w-full max-w-[640px] overflow-y-auto">
        {openId && <OrderPanel key={openId} orderId={openId} onChanged={() => setReloadKey((k) => k + 1)} />}
      </Dialog>
    </AdminPage>
  );
}
