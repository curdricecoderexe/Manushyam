import { useEffect, useState } from "react";
import { Link } from "react-router";
import { CircleCheck, TriangleAlert, CircleAlert, OctagonX, Package, Truck, ClipboardList, MessageSquare, Boxes, Wrench, Plus, ShoppingBag } from "lucide-react";
import { AdminPage, Panel, StatTile } from "../../components/admin/AdminPage";
import { ColumnChart } from "../../components/admin/ColumnChart";
import { DataTable } from "../../components/admin/controls";
import { useCountUp } from "../../components/admin/motion";
import { Skeleton } from "../../components/ui/primitives";
import { useAuth } from "../../auth/context";
import { api } from "../../lib/api";
import { formatPaise } from "../../lib/cn";

// Stock health uses the reserved status colours, always with an icon and a label.
const LEVELS = [
  { key: "healthy", label: "Healthy", color: "#0ca30c", Icon: CircleCheck },
  { key: "low", label: "Low", color: "#fab219", Icon: TriangleAlert },
  { key: "critical", label: "Critical", color: "#ec835a", Icon: CircleAlert },
  { key: "out", label: "Out of stock", color: "#d03b3b", Icon: OctagonX },
];

const dayLabel = (iso, opts) => new Date(`${iso}T12:00:00+05:30`).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", ...opts });

function LevelTile({ label, color, Icon, count, total }) {
  const shown = useCountUp(count);
  return (
    <li className="flex flex-col gap-3 rounded-xl bg-panel-muted p-4">
      <span className="flex items-center gap-2 text-xs font-medium text-ink-700">
        <Icon className="h-4 w-4 shrink-0" style={{ color }} aria-hidden="true" />
        {label}
      </span>
      <span className="text-2xl font-semibold leading-none tabular-nums text-cocoa-900">{shown}</span>
      <span className="h-1.5 overflow-hidden rounded-full bg-panel-sunken" aria-hidden="true">
        <span className="block h-full rounded-full" style={{ width: `${total ? (count / total) * 100 : 0}%`, background: color }} />
      </span>
    </li>
  );
}

function StockHealth({ stock }) {
  const total = LEVELS.reduce((n, l) => n + stock[l.key], 0);
  return (
    <Panel title="Stock health" actions={<span className="text-xs text-ink-500">Per variant · critical ≤ {stock.thresholds.critical}, low ≤ {stock.thresholds.low}</span>}>
      <ul className="grid grid-cols-2 gap-3 p-4 sm:p-5 lg:grid-cols-4">
        {LEVELS.map(({ key, label, color, Icon }) => (
          <LevelTile key={key} label={label} color={color} Icon={Icon} count={stock[key]} total={total} />
        ))}
      </ul>
      {stock.watch.length > 0 ? (
        <div className="border-t border-sand-400/60">
          <DataTable caption="Variants that need restocking" head={["Product", "SKU", { label: "Stock", className: "text-right" }, "Level"]} minWidth={520}>
            {stock.watch.map((w) => {
              const level = LEVELS.find((l) => l.key === w.level);
              return (
                <tr key={w.sku}>
                  <td>
                    <Link to={`/admin/products/${w.productId}`} className="font-medium text-cocoa-900 hover:text-gold-700">
                      {w.name}
                    </Link>
                    <span className="block text-xs text-ink-500">{w.label}</span>
                  </td>
                  <td className="font-mono text-xs">{w.sku}</td>
                  <td className="text-right tabular-nums">{w.stock}</td>
                  <td>
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-panel-muted px-2.5 py-1 text-xs font-medium text-cocoa-900 ring-1 ring-inset ring-sand-400/60">
                      <level.Icon className="h-3.5 w-3.5" style={{ color: level.color }} aria-hidden="true" />
                      {level.label}
                    </span>
                  </td>
                </tr>
              );
            })}
          </DataTable>
        </div>
      ) : (
        <p className="px-5 pb-5 text-sm text-ink-500">Every variant is well stocked.</p>
      )}
    </Panel>
  );
}

export default function Dashboard() {
  const { user } = useAuth();
  const isAdmin = user.role === "admin";
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    api("/api/admin/dashboard")
      .then((d) => !cancelled && setData(d))
      .catch((err) => !cancelled && setError(err.message));
    return () => {
      cancelled = true;
    };
  }, []);

  const first = user.name.split(" ")[0];
  return (
    <AdminPage
      title={`Namaste, ${first}`}
      eyebrow={new Date().toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", weekday: "long", day: "numeric", month: "long" })}
      subtitle="Today’s work at a glance"
      band
      actions={
        <>
          {isAdmin && (
            <Link to="/admin/products/new" className="admin-pill-light">
              <Plus className="h-4 w-4" aria-hidden="true" /> New product
            </Link>
          )}
          <Link to="/admin/orders" className="admin-pill-ghost">
            <ShoppingBag className="h-4 w-4" aria-hidden="true" /> View orders
          </Link>
        </>
      }
    >
      {error && (
        <p role="alert" className="text-danger-600">
          {error}
        </p>
      )}
      {!data && !error ? (
        <div className="flex flex-col gap-6">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
            {[1, 2, 3, 4, 5, 6].map((n) => (
              <Skeleton key={n} className="h-32 rounded-2xl" />
            ))}
          </div>
          <Skeleton className="h-72 rounded-2xl" />
        </div>
      ) : (
        data && (
          <>
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6" aria-label="Workload">
              <li>
                <StatTile label="To process" value={data.fulfilment.toProcess} hint="Confirmed, not started" icon={<ClipboardList className="text-gold-700" aria-hidden="true" />} to="/admin/orders?status=paid" />
              </li>
              <li>
                <StatTile label="Processing" value={data.fulfilment.processing} icon={<Boxes className="text-gold-700" aria-hidden="true" />} to="/admin/orders?status=processing" />
              </li>
              <li>
                <StatTile label="Packed" value={data.fulfilment.packed} hint="Awaiting pickup" icon={<Package className="text-gold-700" aria-hidden="true" />} to="/admin/orders?status=packed" />
              </li>
              <li>
                <StatTile label="In transit" value={data.fulfilment.inTransit} icon={<Truck className="text-gold-700" aria-hidden="true" />} to="/admin/orders?status=shipped" />
              </li>
              <li>
                <StatTile label="Needs attention" value={data.fulfilment.needsAttention} tone="alert" hint={isAdmin ? "Booking failed or refund due" : "Courier booking failed"} icon={<Wrench className="text-gold-700" aria-hidden="true" />} />
              </li>
              <li>
                <StatTile label="Waiting chats" value={data.support.pending} tone="alert" hint={`${data.support.mine} assigned to you`} icon={<MessageSquare className="text-gold-700" aria-hidden="true" />} to="/admin/support" />
              </li>
            </ul>

            <div className={isAdmin ? "grid gap-6 xl:grid-cols-2" : "grid gap-6"}>
              <Panel>
                <div className="p-5">
                  <ColumnChart
                    title="Confirmed orders, last 7 days"
                    data={data.ordersByDay.map((d) => ({ key: d.date, label: dayLabel(d.date, { weekday: "short" }), fullLabel: dayLabel(d.date, { weekday: "long", day: "numeric", month: "short" }), value: d.orders }))}
                  />
                  <p className="mt-3 border-t border-sand-400/50 pt-3 text-xs text-ink-500">Today: {data.today.orders} orders · India time</p>
                </div>
              </Panel>
              {isAdmin && (
                <Panel>
                  <div className="p-5">
                    <ColumnChart
                      title="Order value, last 7 days"
                      format={(v) => formatPaise(v)}
                      data={data.ordersByDay.map((d) => ({ key: d.date, label: dayLabel(d.date, { weekday: "short" }), fullLabel: dayLabel(d.date, { weekday: "long", day: "numeric", month: "short" }), value: d.revenue }))}
                    />
                    <p className="mt-3 border-t border-sand-400/50 pt-3 text-xs text-ink-500">Today: {formatPaise(data.today.revenue)} · excludes cancelled and refunded orders</p>
                  </div>
                </Panel>
              )}
            </div>

            <StockHealth stock={data.stock} />
          </>
        )
      )}
    </AdminPage>
  );
}
