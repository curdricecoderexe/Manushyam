// Customer-facing wording for order states (BE/Models/Order.js) and the progress line they map to.
export const STATUS_LABELS = {
  payment_pending: "Awaiting payment",
  cod_pending_confirmation: "Awaiting confirmation",
  paid: "Confirmed",
  cod_confirmed: "Confirmed",
  processing: "Processing",
  packed: "Packed",
  shipped: "Shipped",
  out_for_delivery: "Out for delivery",
  delivered: "Delivered",
  cancelled: "Cancelled",
  rto: "Returned to us",
  refunded: "Refunded",
};

export const STATUS_TONES = {
  payment_pending: "amber",
  cod_pending_confirmation: "amber",
  paid: "blue",
  cod_confirmed: "blue",
  processing: "blue",
  packed: "purple",
  shipped: "purple",
  out_for_delivery: "purple",
  delivered: "green",
  cancelled: "red",
  rto: "red",
  refunded: "grey",
};

// The happy path shown as a timeline.
export const TIMELINE = [
  { key: "confirmed", label: "Order confirmed", statuses: ["paid", "cod_confirmed"] },
  { key: "processing", label: "Processing", statuses: ["processing"] },
  { key: "packed", label: "Packed", statuses: ["packed"] },
  { key: "shipped", label: "Shipped", statuses: ["shipped"] },
  { key: "out_for_delivery", label: "Out for delivery", statuses: ["out_for_delivery"] },
  { key: "delivered", label: "Delivered", statuses: ["delivered"] },
];

const ORDER = ["paid", "cod_confirmed", "processing", "packed", "shipped", "out_for_delivery", "delivered"];

// Index of the furthest timeline step reached (from the history, so a cancelled order still shows how far it got).
export function reachedStep(order) {
  const seen = new Set((order.history ?? []).map((h) => h.status).concat(order.status));
  let reached = -1;
  TIMELINE.forEach((step, i) => {
    if (step.statuses.some((s) => seen.has(s))) reached = i;
  });
  // Skipped steps (e.g. paid → packed) count as done once a later step is reached.
  return reached;
}

export function stepTime(order, step) {
  const hit = [...(order.history ?? [])].reverse().find((h) => step.statuses.includes(h.status));
  return hit?.at ?? null;
}

export const isClosed = (status) => ["cancelled", "rto", "refunded"].includes(status);
export const isActiveOrder = (status) => ORDER.includes(status) && status !== "delivered";

export function formatDate(value, opts = { day: "numeric", month: "short", year: "numeric" }) {
  return value ? new Date(value).toLocaleDateString("en-IN", opts) : "";
}

export function formatDateTime(value) {
  return value ? new Date(value).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }) : "";
}

// "Thu, 8 Oct – Mon, 12 Oct" from an ETA in days, counted from `from` (default today).
export function etaRange(minDays, maxDays, from = new Date()) {
  if (minDays === null || minDays === undefined) return "";
  const day = (n) => {
    const d = new Date(from);
    d.setDate(d.getDate() + n);
    return d.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" });
  };
  return minDays === maxDays || maxDays === undefined ? day(minDays) : `${day(minDays)} – ${day(maxDays)}`;
}
