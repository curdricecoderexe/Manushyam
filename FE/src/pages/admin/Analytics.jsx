import { useEffect, useState } from "react";
import { Link } from "react-router";
import { Download, FileText } from "lucide-react";
import { AdminPage, Panel, StatTile } from "../../components/admin/AdminPage";
import { ColumnChart } from "../../components/admin/ColumnChart";
import { DataTable, ErrorNote } from "../../components/admin/controls";
import { Change, RangePicker, ShareRow } from "../../components/admin/analyticsParts";
import { pct, trendBars, useDateRange } from "../../lib/analyticsRange";
import { Skeleton } from "../../components/ui/primitives";
import { Button } from "../../components/ui/button";
import { useToast } from "../../toast/context";
import { api, downloadFile } from "../../lib/api";
import { downloadCsv, downloadExcel } from "../../lib/exporters";
import { formatPaise } from "../../lib/cn";

export default function Analytics() {
  const { toast } = useToast();
  const range = useDateRange();
  const { from, to } = range;
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");

  useEffect(() => {
    let cancelled = false;
    api(`/api/admin/analytics/sales?from=${from}&to=${to}`)
      .then((d) => {
        if (cancelled) return;
        setData(d);
        setError("");
      })
      .catch((err) => !cancelled && setError(err.message));
    return () => {
      cancelled = true;
    };
  }, [from, to]);

  const monthly = data?.range.granularity === "month";
  const trendRows = data?.trend ?? [];
  const exportColumns = [
    { header: monthly ? "Month" : "Day", value: (r) => r.key, width: 12 },
    { header: "Confirmed orders", value: (r) => r.orders, type: Number, width: 16 },
    { header: "Net revenue (₹)", value: (r) => r.revenue / 100, type: Number, format: "#,##0.00", width: 16 },
  ];
  async function run(kind, fn) {
    setBusy(kind);
    try {
      await fn();
    } catch (err) {
      toast({ message: err.message || "Export failed.", tone: "error" });
    } finally {
      setBusy("");
    }
  }
  const file = `manushyam-sales-${from}-to-${to}`;

  const k = data?.kpis;
  const p = data?.previous;
  const days = data?.range.days;
  const custTotal = data ? data.customers.new.revenue + data.customers.returning.revenue : 0;
  const payTotal = data ? data.payments.reduce((s, x) => s + x.revenue, 0) : 0;

  return (
    <AdminPage
      title="Sales analytics"
      subtitle="Confirmed orders in India time. Revenue excludes cancelled orders and refunds."
      actions={
        <>
          <Button size="sm" variant="outline" disabled={!data || Boolean(busy)} onClick={() => run("csv", async () => downloadCsv(`${file}.csv`, exportColumns, trendRows))}>
            <Download className="h-4 w-4" aria-hidden="true" /> CSV
          </Button>
          <Button size="sm" variant="outline" disabled={!data || Boolean(busy)} onClick={() => run("xlsx", () => downloadExcel(`${file}.xlsx`, exportColumns, trendRows))}>
            <Download className="h-4 w-4" aria-hidden="true" /> {busy === "xlsx" ? "Preparing…" : "Excel"}
          </Button>
          <Button size="sm" variant="brown" disabled={!data || Boolean(busy)} onClick={() => run("pdf", () => downloadFile(`/api/admin/analytics/sales.pdf?from=${from}&to=${to}`, `${file}.pdf`))}>
            <FileText className="h-4 w-4" aria-hidden="true" /> {busy === "pdf" ? "Preparing…" : "PDF report"}
          </Button>
        </>
      }
    >
      <RangePicker range={range} />
      <ErrorNote>{error}</ErrorNote>

      {!data ? (
        !error && <Skeleton className="h-96" />
      ) : (
        <>
          <ul aria-label="Key figures" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <li>
              <StatTile label="Net revenue" value={formatPaise(k.revenue)} hint={<Change now={k.revenue} before={p.revenue} days={days} />} />
            </li>
            <li>
              <StatTile label="Confirmed orders" value={k.orders.toLocaleString("en-IN")} hint={<Change now={k.orders} before={p.orders} days={days} />} />
            </li>
            <li>
              <StatTile label="Average order value" value={formatPaise(k.aov)} hint={<Change now={k.aov} before={p.aov} days={days} />} />
            </li>
            <li>
              <StatTile label="RTO rate" value={pct(data.rto.rate)} hint={`${data.rto.rto} returned of ${data.rto.rto + data.rto.delivered} completed · ${data.rto.codRto} COD`} />
            </li>
          </ul>
          <p className="-mt-2 text-xs text-ink-500">
            {k.units.toLocaleString("en-IN")} units · {k.customers} customers · {k.cancelled} cancelled · {formatPaise(k.refunds)} refunded
          </p>

          <div className="grid gap-6 xl:grid-cols-2">
            <Panel>
              <div className="p-5">
                <ColumnChart
                  title={`Net revenue by ${monthly ? "month" : "day"}`}
                  categoryLabel={monthly ? "Month" : "Day"}
                  format={(v) => formatPaise(v)}
                  data={trendBars(trendRows, monthly, (r) => r.revenue)}
                />
              </div>
            </Panel>
            <Panel>
              <div className="p-5">
                <ColumnChart
                  title={`Confirmed orders by ${monthly ? "month" : "day"}`}
                  categoryLabel={monthly ? "Month" : "Day"}
                  data={trendBars(trendRows, monthly, (r) => r.orders)}
                />
              </div>
            </Panel>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <Panel title="New vs returning customers">
              <ul className="flex flex-col gap-4 p-5">
                <ShareRow name="New customers" value={data.customers.new.revenue} total={custTotal} detail={`${data.customers.new.customers} customers · ${data.customers.new.orders} orders · first order in this period`} />
                <ShareRow name="Returning customers" value={data.customers.returning.revenue} total={custTotal} detail={`${data.customers.returning.customers} customers · ${data.customers.returning.orders} orders · ordered before`} />
              </ul>
            </Panel>
            <Panel title="Payment method">
              <ul className="flex flex-col gap-4 p-5">
                {data.payments.map((x) => (
                  <ShareRow key={x.method} name={x.method === "cod" ? "Cash on Delivery" : "Prepaid (Razorpay)"} value={x.revenue} total={payTotal} detail={`${x.orders} orders · average ${formatPaise(x.aov)}`} />
                ))}
              </ul>
            </Panel>
          </div>

          <Panel title="Top products">
            {data.topProducts.length === 0 ? (
              <p className="p-8 text-center text-ink-500">No sales in this period.</p>
            ) : (
              <DataTable caption="Top products by revenue" head={["Product", "SKU", { label: "Units", className: "text-right" }, { label: "Orders", className: "text-right" }, { label: "Revenue", className: "text-right" }]} minWidth={620}>
                {data.topProducts.map((x) => (
                  <tr key={x.sku}>
                    <td>
                      {x.slug ? (
                        <Link to={`/solutions/${x.slug}`} className="text-cocoa-900 hover:text-gold-700">
                          {x.name}
                        </Link>
                      ) : (
                        x.name
                      )}
                      {x.variant && <span className="block text-xs text-ink-500">{x.variant}</span>}
                    </td>
                    <td className="font-mono text-xs">{x.sku}</td>
                    <td className="text-right tabular-nums">{x.qty}</td>
                    <td className="text-right tabular-nums">{x.orders}</td>
                    <td className="text-right tabular-nums">{formatPaise(x.revenue)}</td>
                  </tr>
                ))}
              </DataTable>
            )}
          </Panel>
        </>
      )}
    </AdminPage>
  );
}
