import { useEffect, useState } from "react";
import { Download } from "lucide-react";
import { AdminPage, Panel, StatTile } from "../../components/admin/AdminPage";
import { ColumnChart } from "../../components/admin/ColumnChart";
import { DataTable, ErrorNote } from "../../components/admin/controls";
import { Change, RangePicker, ShareRow } from "../../components/admin/analyticsParts";
import { Skeleton, StatusPill } from "../../components/ui/primitives";
import { Button } from "../../components/ui/button";
import { useToast } from "../../toast/context";
import { api } from "../../lib/api";
import { downloadCsv } from "../../lib/exporters";
import { pct, trendBars, useDateRange } from "../../lib/analyticsRange";

const LIVE_POLL_MS = 30000;
const num = (v) => v.toLocaleString("en-IN");

function formatDuration(ms) {
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  return m < 60 ? `${m}m ${String(s % 60).padStart(2, "0")}s` : `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, "0")}m`;
}

// Google's Core Web Vitals thresholds (good ≤ first, poor > second).
const VITALS = {
  LCP: { label: "Largest Contentful Paint", good: 2500, poor: 4000, unit: "ms" },
  INP: { label: "Interaction to Next Paint", good: 200, poor: 500, unit: "ms" },
  CLS: { label: "Cumulative Layout Shift", good: 0.1, poor: 0.25, unit: "" },
  FCP: { label: "First Contentful Paint", good: 1800, poor: 3000, unit: "ms" },
  TTFB: { label: "Time to First Byte", good: 800, poor: 1800, unit: "ms" },
};

function vitalStatus(name, value) {
  const v = VITALS[name];
  if (value <= v.good) return { tone: "green", text: "Good" };
  if (value <= v.poor) return { tone: "amber", text: "Needs improvement" };
  return { tone: "red", text: "Poor" };
}

const formatVital = (name, value) => (name === "CLS" ? value.toFixed(2) : value >= 1000 ? `${(value / 1000).toFixed(2)} s` : `${Math.round(value)} ms`);

function VitalTile({ vital }) {
  const meta = VITALS[vital.name];
  const status = vital.count ? vitalStatus(vital.name, vital.average) : null;
  return (
    <li className="flex flex-col gap-2 rounded-lg border border-sand-400 bg-white p-4">
      <span className="flex items-center justify-between gap-2 text-sm text-ink-700">
        <abbr title={meta.label} className="no-underline">
          {vital.name}
        </abbr>
        {status && <StatusPill tone={status.tone}>{status.text}</StatusPill>}
      </span>
      <span className="font-sans text-[26px] font-semibold leading-none text-cocoa-900">{vital.count ? formatVital(vital.name, vital.average) : "—"}</span>
      <span className="text-xs text-ink-500">{vital.count ? `Average · ${pct(vital.good / vital.count)} good of ${num(vital.count)} visits` : "No measurements yet"}</span>
    </li>
  );
}

function CountList({ rows, total, unit, empty }) {
  if (!rows.length) return <p className="p-6 text-center text-sm text-ink-500">{empty}</p>;
  return (
    <ul className="flex flex-col gap-4 p-5">
      {rows.map((r) => (
        <ShareRow key={r.key} name={r.key} value={r.count} total={total} format={(v) => `${num(v)} ${unit}`} />
      ))}
    </ul>
  );
}

function LiveTile() {
  const [live, setLive] = useState(null);
  useEffect(() => {
    let cancelled = false;
    const load = () =>
      api("/api/admin/analytics/live")
        .then((d) => !cancelled && setLive(d))
        .catch(() => {});
    load();
    const timer = setInterval(load, LIVE_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);
  const top = live?.pages?.[0];
  return <StatTile label="Active now" value={live ? num(live.activeNow) : "…"} hint={live ? (top ? `Most on ${top.key} · updates every 30 s` : `Seen in the last ${live.windowMinutes} minutes`) : "Loading…"} />;
}

export default function WebAnalytics() {
  const { toast } = useToast();
  const range = useDateRange();
  const { from, to } = range;
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    api(`/api/admin/analytics/web?from=${from}&to=${to}`)
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
  const k = data?.kpis;
  const p = data?.previous;
  const days = data?.range.days;

  function exportCsv() {
    try {
      const rows = [
        ...data.trend.map((r) => ({ section: monthly ? "Month" : "Day", key: r.key, a: r.pageviews, b: r.sessions })),
        ...data.topPages.map((r) => ({ section: "Page", key: r.key, a: r.count, b: "" })),
        ...data.sources.map((r) => ({ section: "Source", key: r.key, a: "", b: r.count })),
        ...data.events.map((r) => ({ section: "Event", key: r.key, a: r.count, b: "" })),
      ];
      const columns = [
        { header: "Type", value: (r) => r.section },
        { header: "Name", value: (r) => r.key },
        { header: "Page views / events", value: (r) => r.a },
        { header: "Sessions", value: (r) => r.b },
      ];
      downloadCsv(`manushyam-web-analytics-${from}-to-${to}.csv`, columns, rows);
    } catch (err) {
      toast({ message: err.message || "Export failed.", tone: "error" });
    }
  }

  const c = data?.consent;
  return (
    <AdminPage
      title="Web analytics & cookies"
      subtitle="First-party analytics in India time. Only visitors who allowed analytics cookies are counted."
      actions={
        <Button size="sm" variant="outline" disabled={!data} onClick={exportCsv}>
          <Download className="h-4 w-4" aria-hidden="true" /> CSV
        </Button>
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
              <StatTile label="Page views" value={num(k.pageviews)} hint={<Change now={k.pageviews} before={p.pageviews} days={days} empty="No visits" />} />
            </li>
            <li>
              <StatTile label="Visitors" value={num(k.visitors)} hint="Each visitor counted once per day" />
            </li>
            <li>
              <StatTile label="Sessions" value={num(k.sessions)} hint={<Change now={k.sessions} before={p.sessions} days={days} empty="No visits" />} />
            </li>
            <li>
              <LiveTile />
            </li>
            <li>
              <StatTile label="Average session" value={formatDuration(k.avgSessionMs)} hint="From first to last activity" />
            </li>
            <li>
              <StatTile label="Pages per session" value={k.pagesPerSession.toFixed(2)} />
            </li>
            <li>
              <StatTile label="Bounce rate" value={pct(k.bounceRate)} hint="Sessions that viewed one page" />
            </li>
            <li>
              <StatTile label="Analytics opt-in" value={c.total ? pct(c.analyticsOn / c.total) : "—"} hint={`${num(c.total)} cookie choices in this period`} />
            </li>
          </ul>

          <Panel>
            <div className="p-5">
              <ColumnChart title={`Page views by ${monthly ? "month" : "day"}`} categoryLabel={monthly ? "Month" : "Day"} data={trendBars(data.trend, monthly, (r) => r.pageviews)} />
            </div>
          </Panel>

          <div className="grid gap-6 lg:grid-cols-2">
            <Panel title="Top pages">
              {data.topPages.length === 0 ? (
                <p className="p-6 text-center text-sm text-ink-500">No page views in this period.</p>
              ) : (
                <DataTable caption="Most viewed pages" head={["Page", { label: "Views", className: "text-right" }, { label: "Share", className: "text-right" }]} minWidth={360}>
                  {data.topPages.map((r) => (
                    <tr key={r.key}>
                      <td className="break-all font-mono text-xs">{r.key}</td>
                      <td className="text-right tabular-nums">{num(r.count)}</td>
                      <td className="text-right tabular-nums">{pct(r.count / k.pageviews)}</td>
                    </tr>
                  ))}
                </DataTable>
              )}
            </Panel>
            <Panel title="Traffic sources">
              <CountList rows={data.sources} total={k.sessions} unit="sessions" empty="No sessions in this period." />
              <p className="border-t border-sand-400 px-5 py-3 text-xs text-ink-500">UTM source when the link had one, otherwise the referring website; “direct” means typed in or bookmarked.</p>
            </Panel>
          </div>

          <Panel title="Devices">
            <div className="grid gap-x-6 md:grid-cols-3">
              {[
                ["Device type", data.devices.types],
                ["Browser", data.devices.browsers],
                ["Operating system", data.devices.os],
              ].map(([title, rows]) => (
                <div key={title}>
                  <h3 className="px-5 pt-4 font-sans text-sm font-semibold text-cocoa-900">{title}</h3>
                  <CountList rows={rows} total={k.sessions} unit="sessions" empty="No data yet." />
                </div>
              ))}
            </div>
          </Panel>

          <Panel title="Core Web Vitals">
            <ul aria-label="Core Web Vitals" className="grid gap-3 p-5 sm:grid-cols-2 xl:grid-cols-5">
              {data.vitals.map((v) => (
                <VitalTile key={v.name} vital={v} />
              ))}
            </ul>
            <p className="border-t border-sand-400 px-5 py-3 text-xs text-ink-500">Measured in visitors’ browsers. Targets: LCP under 2.5 s, INP under 200 ms, CLS under 0.1.</p>
          </Panel>

          <div className="grid gap-6 lg:grid-cols-2">
            <Panel title="Cookie consent">
              <dl className="grid grid-cols-2 gap-4 p-5 text-sm">
                {[
                  ["Choices recorded", c.total],
                  ["Accepted all", c.acceptAll],
                  ["Essential only", c.essentialOnly],
                  ["Customised", c.custom],
                  ["Withdrew analytics", c.withdraw],
                  ["Analytics on", c.analyticsOn],
                ].map(([label, value]) => (
                  <div key={label} className="flex flex-col gap-1">
                    <dt className="text-ink-700">{label}</dt>
                    <dd className="font-sans text-xl font-semibold tabular-nums text-cocoa-900">{num(value)}</dd>
                  </div>
                ))}
              </dl>
              <p className="border-t border-sand-400 px-5 py-3 text-xs text-ink-500">Every choice is kept for 13 months as the consent record (DPDP Act 2023). Raw analytics are deleted after {data.retentionDays} days; daily totals stay.</p>
            </Panel>
            <Panel title="Events">
              {data.events.length === 0 ? (
                <p className="p-6 text-center text-sm text-ink-500">No events in this period.</p>
              ) : (
                <DataTable caption="Tracked events" head={["Event", { label: "Count", className: "text-right" }]} minWidth={300}>
                  {data.events.map((r) => (
                    <tr key={r.key}>
                      <td className="font-mono text-xs">{r.key}</td>
                      <td className="text-right tabular-nums">{num(r.count)}</td>
                    </tr>
                  ))}
                </DataTable>
              )}
            </Panel>
          </div>
        </>
      )}
    </AdminPage>
  );
}
