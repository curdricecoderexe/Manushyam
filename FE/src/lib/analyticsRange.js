import { useUrlParams } from "./admin";
import { today } from "./exporters";

// Analytics screen helpers: IST date ranges kept in the URL, presets and trend labels.
const DAY_MS = 86400000;
export const shiftDay = (day, n) => new Date(Date.parse(`${day}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);
// Indian financial year starts 1 April.
function fyStart(day) {
  const [y, m] = day.split("-").map(Number);
  return `${m >= 4 ? y : y - 1}-04-01`;
}
export const PRESETS = [
  { id: "7d", label: "7 days", range: (t) => [shiftDay(t, -6), t] },
  { id: "30d", label: "30 days", range: (t) => [shiftDay(t, -29), t] },
  { id: "90d", label: "90 days", range: (t) => [shiftDay(t, -89), t] },
  { id: "fy", label: "This financial year", range: (t) => [fyStart(t), t] },
];

export const dayLabel = (key, opts) => new Date(key.length === 7 ? `${key}-01T12:00:00+05:30` : `${key}T12:00:00+05:30`).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", ...opts });
export const pct = (v) => `${(v * 100).toFixed(1)}%`;

// Chart rows for a day/month trend.
export function trendBars(rows, monthly, value) {
  return rows.map((r) => ({
    key: r.key,
    label: monthly ? dayLabel(r.key, { month: "short" }) : dayLabel(r.key, { day: "numeric", month: "short" }),
    fullLabel: monthly ? dayLabel(r.key, { month: "long", year: "numeric" }) : dayLabel(r.key, { weekday: "short", day: "numeric", month: "short" }),
    value: value(r),
  }));
}

export function useDateRange() {
  const { get, setParamsMany } = useUrlParams();
  const t = today();
  const preset = PRESETS.find((p) => p.id === get("range", "30d"));
  const [from, to] = preset ? preset.range(t) : [get("from") || shiftDay(t, -29), get("to") || t];
  return { today: t, preset, from, to, setParamsMany };
}
