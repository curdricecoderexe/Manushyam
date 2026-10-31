import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router";
import { ChevronLeft } from "lucide-react";
import { Card, Skeleton, StatusPill } from "../../components/ui/primitives";
import { Button } from "../../components/ui/button";
import { OrderTimeline, ShipmentEvents } from "../../components/order/OrderTimeline";
import { CodConfirm } from "../../components/order/CodConfirm";
import { ReviewForm } from "../../components/reviews/ReviewForm";
import { Stars } from "../../components/reviews/Stars";
import { useToast } from "../../toast/context";
import { useCart } from "../../cart/context";
import { api, downloadFile } from "../../lib/api";
import { openSupportChat } from "../../lib/chat";
import { STATUS_LABELS, STATUS_TONES, etaRange, formatDate } from "../../lib/orders";
import { formatPaise } from "../../lib/cn";

// "Write a review" / "Your review" under each item of a delivered order.
function ItemReview({ orderNumber, item, review, onSaved }) {
  const [editing, setEditing] = useState(false);
  if (editing) {
    return (
      <div className="mt-3 rounded-lg border border-sand-400 bg-cream-50 p-4">
        <ReviewForm
          orderNumber={orderNumber}
          product={{ slug: item.slug, name: item.name }}
          existing={review}
          onCancel={() => setEditing(false)}
          onSaved={(saved) => {
            setEditing(false);
            onSaved(saved);
          }}
        />
      </div>
    );
  }
  if (review) {
    return (
      <p className="mt-1 flex flex-wrap items-center gap-2 text-sm">
        <span className="text-ink-500">Your review:</span>
        <Stars value={review.rating} size="h-3.5 w-3.5" />
        {review.status === "hidden" && <span className="text-xs text-ink-500">(not shown publicly)</span>}
        <button type="button" onClick={() => setEditing(true)} className="font-semibold text-gold-700" aria-label={`Edit your review of ${item.name}`}>
          Edit
        </button>
      </p>
    );
  }
  return (
    <button type="button" onClick={() => setEditing(true)} className="mt-1 self-start text-sm font-semibold text-gold-700" aria-label={`Write a review of ${item.name}`}>
      ★ Write a review
    </button>
  );
}

const CANCEL_REASONS = ["Ordered by mistake", "Ordered twice", "Delivery is too slow", "Found a better price", "Other"];

function CancelOrder({ order, onCancelled }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState(CANCEL_REASONS[0]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function cancel() {
    setBusy(true);
    setError("");
    try {
      const { order: updated } = await api(`/api/orders/${order.orderNumber}/cancel`, { method: "POST", body: { reason } });
      onCancelled(updated);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <Button variant="danger" size="sm" onClick={() => setOpen(true)}>
        Cancel order
      </Button>
    );
  }
  return (
    <div className="flex w-full flex-col gap-3 rounded-lg border border-danger-600/30 bg-danger-50 p-4">
      <label htmlFor="cancel-reason" className="text-sm font-medium text-cocoa-900">
        Why are you cancelling?
      </label>
      <select id="cancel-reason" value={reason} onChange={(e) => setReason(e.target.value)} className="h-11 rounded-md border border-sand-400 bg-white px-3 text-sm">
        {CANCEL_REASONS.map((r) => (
          <option key={r}>{r}</option>
        ))}
      </select>
      {order.paymentMethod === "razorpay" && order.status !== "payment_pending" && <p className="text-sm">Your payment will be refunded to the original method within 5–7 working days.</p>}
      {error && (
        <p role="alert" className="text-sm text-danger-600">
          {error}
        </p>
      )}
      <div className="flex gap-3">
        <Button variant="danger" size="sm" disabled={busy} onClick={cancel}>
          {busy ? "Cancelling…" : "Yes, cancel order"}
        </Button>
        <Button variant="outline" size="sm" onClick={() => setOpen(false)}>
          Keep order
        </Button>
      </div>
    </div>
  );
}

export default function OrderDetail() {
  const { orderNumber } = useParams();
  const { toast } = useToast();
  const { reload } = useCart();
  const [order, setOrder] = useState(null);
  const [error, setError] = useState("");
  const [myReviews, setMyReviews] = useState([]);
  const delivered = order?.status === "delivered";

  useEffect(() => {
    if (!delivered) return undefined;
    let cancelled = false;
    api("/api/me/reviews")
      .then((d) => !cancelled && setMyReviews(d.reviews))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [delivered]);

  useEffect(() => {
    let cancelled = false;
    api(`/api/orders/${encodeURIComponent(orderNumber)}`)
      .then(({ order: o }) => !cancelled && setOrder(o))
      .catch((err) => !cancelled && setError(err.message));
    return () => {
      cancelled = true;
    };
  }, [orderNumber]);

  const invoice = useCallback(async () => {
    try {
      await downloadFile(`/api/orders/${orderNumber}/invoice`, `ManushyaM-invoice-${orderNumber}.pdf`);
    } catch (err) {
      toast({ message: err.message, tone: "error" });
    }
  }, [orderNumber, toast]);

  if (error) {
    return (
      <Card className="p-8 text-center">
        <p role="alert" className="mb-4">
          {error}
        </p>
        <Link to="/account/orders" className="font-semibold text-gold-700">
          Back to my orders
        </Link>
      </Card>
    );
  }
  if (!order) return <Skeleton className="h-96" />;

  const a = order.amounts;
  return (
    <div className="flex flex-col gap-5">
      <Link to="/account/orders" className="flex items-center gap-1 self-start text-sm font-semibold text-gold-700">
        <ChevronLeft className="h-4 w-4" aria-hidden="true" /> All orders
      </Link>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-[26px]">Order {order.orderNumber}</h2>
          <p className="text-sm text-ink-500">Placed {formatDate(order.createdAt)}</p>
        </div>
        <StatusPill tone={STATUS_TONES[order.status]} className="text-sm">
          {STATUS_LABELS[order.status]}
        </StatusPill>
      </div>

      {order.status === "cod_pending_confirmation" && (
        <Card className="border-gold-600 p-5">
          <h3 className="mb-3 text-xl">Confirm your Cash on Delivery order</h3>
          <CodConfirm
            orderNumber={order.orderNumber}
            onConfirmed={async (o) => {
              setOrder(o);
              await reload();
              toast({ message: "Your order is confirmed.", tone: "success" });
            }}
          />
        </Card>
      )}

      <div className="grid gap-5 md:grid-cols-[1fr_1.2fr]">
        <Card className="p-5">
          <h3 className="mb-4 text-xl">Progress</h3>
          <OrderTimeline order={order} />
          {!["delivered", "cancelled", "refunded", "rto"].includes(order.status) && order.delivery?.etaMaxDays != null && (
            <p className="mt-4 text-sm text-ink-500">Expected {etaRange(order.delivery.etaMinDays, order.delivery.etaMaxDays, new Date(order.createdAt))}</p>
          )}
        </Card>
        <Card className="flex flex-col gap-4 p-5">
          <h3 className="text-xl">Shipment</h3>
          {order.shipment ? <ShipmentEvents shipment={order.shipment} /> : <p className="text-sm text-ink-500">Tracking details appear here once your order ships.</p>}
          {order.refund && (
            <p className="rounded-md bg-cream-200 px-3 py-2 text-sm">
              Refund {order.refund.status === "processed" ? `of ${formatPaise(order.refund.amount)} completed` : "in progress"} — it can take 5–7 working days to reach your account.
            </p>
          )}
        </Card>
      </div>

      <Card className="p-5">
        <h3 className="mb-3 text-xl">Items</h3>
        <ul className="flex flex-col divide-y divide-sand-400">
          {order.items.map((i) => (
            <li key={i.sku} className="flex items-start gap-3 py-3">
              {i.image && <img src={i.image.url} alt="" className="h-16 w-16 rounded-md bg-[#F4EADB] object-cover" />}
              <span className="flex min-w-0 flex-1 flex-col">
                <Link to={`/solutions/${i.slug}`} className="font-serif text-cocoa-900 hover:text-gold-700">
                  {i.name}
                </Link>
                <span className="text-sm text-ink-500">
                  {i.variantLabel} · {i.qty} × {formatPaise(i.price)}
                </span>
                {delivered && (
                  <ItemReview
                    orderNumber={order.orderNumber}
                    item={i}
                    review={myReviews.find((r) => r.orderNumber === order.orderNumber && r.product?.slug === i.slug)}
                    onSaved={(saved) => {
                      setMyReviews((list) => [{ ...saved, orderNumber: order.orderNumber, product: { slug: i.slug } }, ...list.filter((r) => r.id !== saved.id)]);
                      toast({ message: "Thank you — your review is saved.", tone: "success" });
                    }}
                  />
                )}
              </span>
              <span className="font-medium text-cocoa-900">{formatPaise(i.lineTotal)}</span>
            </li>
          ))}
        </ul>
        <dl className="ml-auto mt-3 flex max-w-xs flex-col gap-2 border-t border-sand-400 pt-3 text-sm">
          <div className="flex justify-between">
            <dt>Subtotal</dt>
            <dd>{formatPaise(a.subtotal)}</dd>
          </div>
          {a.discount > 0 && (
            <div className="flex justify-between">
              <dt>Discount{order.coupon ? ` (${order.coupon.code})` : ""}</dt>
              <dd className="text-leaf-800">− {formatPaise(a.discount)}</dd>
            </div>
          )}
          <div className="flex justify-between">
            <dt>Shipping ({order.delivery?.method === "express" ? "express" : "standard"})</dt>
            <dd>{a.shipping ? formatPaise(a.shipping) : "Free"}</dd>
          </div>
          {a.codFee > 0 && (
            <div className="flex justify-between">
              <dt>COD fee</dt>
              <dd>{formatPaise(a.codFee)}</dd>
            </div>
          )}
          <div className="flex justify-between border-t border-sand-400 pt-2 font-serif text-lg text-cocoa-900">
            <dt>Total</dt>
            <dd className="font-bold text-brown-700">{formatPaise(a.total)}</dd>
          </div>
        </dl>
      </Card>

      <div className="grid gap-5 md:grid-cols-2">
        <Card className="p-5 text-sm leading-relaxed">
          <h3 className="mb-2 text-xl">Delivery address</h3>
          <p className="text-cocoa-900">{order.address.fullName}</p>
          <p>{[order.address.line1, order.address.line2, order.address.landmark].filter(Boolean).join(", ")}</p>
          <p>
            {order.address.city}, {order.address.state} {order.address.pincode}
          </p>
          <p className="text-ink-500">+91 {order.address.phone}</p>
        </Card>
        <Card className="flex flex-col gap-3 p-5 text-sm">
          <h3 className="text-xl">Payment & invoice</h3>
          <p>{order.paymentMethod === "cod" ? "Cash on Delivery" : "Paid online via Razorpay"}</p>
          <div className="flex flex-wrap gap-3">
            {order.hasInvoice && (
              <Button variant="outline" size="sm" onClick={invoice}>
                Download GST invoice
              </Button>
            )}
            {order.canCancel && <CancelOrder order={order} onCancelled={setOrder} />}
          </div>
          <button type="button" onClick={() => openSupportChat({ orderNumber: order.orderNumber })} className="self-start font-semibold text-gold-700">
            Chat with support about this order
          </button>
        </Card>
      </div>
    </div>
  );
}
