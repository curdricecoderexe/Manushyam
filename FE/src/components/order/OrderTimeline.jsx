import { Check } from "lucide-react";
import { TIMELINE, STATUS_LABELS, reachedStep, stepTime, isClosed, formatDateTime } from "../../lib/orders";
import { cn } from "../../lib/cn";

// Vertical progress line: confirmed → … → delivered, with a closing row for cancelled/returned/refunded.
export function OrderTimeline({ order }) {
  const reached = reachedStep(order);
  const closed = isClosed(order.status);
  const awaiting = ["payment_pending", "cod_pending_confirmation"].includes(order.status);

  return (
    <ol aria-label="Order progress" className="flex flex-col">
      {awaiting && (
        <li className="flex gap-3.5 pb-1">
          <span className="mt-0.5 h-6 w-6 shrink-0 rounded-full border-2 border-dashed border-gold-600" aria-hidden="true" />
          <span className="font-medium text-cocoa-900">{STATUS_LABELS[order.status]}</span>
        </li>
      )}
      {!awaiting &&
        TIMELINE.map((step, i) => {
          const done = i <= reached;
          const current = i === reached && !closed;
          // Hide the not-reached tail of a closed order; it never happens.
          if (closed && !done) return null;
          const at = stepTime(order, step);
          return (
            <li key={step.key} aria-current={current ? "step" : undefined} className="relative flex gap-3.5 pb-6 last:pb-0">
              {i < TIMELINE.length - 1 && !(closed && i === reached) && (
                <span className={cn("absolute left-3 top-7 h-[calc(100%-28px)] w-px", i < reached ? "bg-leaf-800" : "bg-sand-400")} aria-hidden="true" />
              )}
              <span
                className={cn(
                  "relative z-[1] flex h-6 w-6 shrink-0 items-center justify-center rounded-full border",
                  done ? "border-leaf-800 bg-leaf-800 text-white" : "border-sand-500 bg-cream-50",
                  current && "ring-4 ring-leaf-50"
                )}
                aria-hidden="true"
              >
                {done && <Check className="h-3.5 w-3.5" strokeWidth={2.5} />}
              </span>
              <span className="flex flex-col">
                <span className={cn("text-[15px]", done ? "font-medium text-cocoa-900" : "text-ink-500")}>
                  {step.label}
                  <span className="sr-only">{done ? " — done" : " — pending"}</span>
                </span>
                {at && <span className="text-xs text-ink-500">{formatDateTime(at)}</span>}
              </span>
            </li>
          );
        })}
      {closed && (
        <li className="flex gap-3.5 pt-6">
          <span className="h-6 w-6 shrink-0 rounded-full border border-danger-600 bg-danger-50" aria-hidden="true" />
          <span className="flex flex-col">
            <span className="text-[15px] font-medium text-danger-600">{STATUS_LABELS[order.status]}</span>
            {order.cancelReason && <span className="text-xs text-ink-500">{order.cancelReason}</span>}
          </span>
        </li>
      )}
    </ol>
  );
}

// Courier scans, newest first.
export function ShipmentEvents({ shipment }) {
  if (!shipment) return null;
  const events = [...(shipment.events ?? [])].sort((a, b) => new Date(b.at) - new Date(a.at));
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
        <span>
          {shipment.courier && <strong className="font-medium text-cocoa-900">{shipment.courier}</strong>}
          {shipment.awb && <span className="text-ink-500"> · AWB {shipment.awb}</span>}
        </span>
        {shipment.trackingUrl && (
          <a href={shipment.trackingUrl} target="_blank" rel="noopener noreferrer" className="font-semibold text-gold-700">
            Track with courier ↗
          </a>
        )}
      </div>
      {events.length > 0 && (
        <ul className="flex flex-col gap-2.5 border-l border-sand-400 pl-4 text-sm">
          {events.map((e) => (
            <li key={`${e.at}-${e.activity}`}>
              <span className="text-cocoa-900">{e.activity || e.status}</span>
              <span className="block text-xs text-ink-500">
                {formatDateTime(e.at)}
                {e.location && ` · ${e.location}`}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
