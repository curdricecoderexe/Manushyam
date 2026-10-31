import { useEffect, useState } from "react";
import { Link, useLocation, useParams } from "react-router";
import { Seo } from "../../components/Seo";
import { Card, Skeleton } from "../../components/ui/primitives";
import { buttonVariants } from "../../components/ui/button-variants";
import { PathIcon } from "../../components/ui/icons";
import { ICONS } from "../../components/ui/icon-paths";
import { SproutMark } from "../../components/ui/ornaments";
import { api } from "../../lib/api";
import { etaRange } from "../../lib/orders";
import { cn, formatPaise } from "../../lib/cn";

const POLL_MS = 3000;
const MAX_POLLS = 10;

function useOrder(orderNumber, { pollWhilePending = false } = {}) {
  const [order, setOrder] = useState(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let cancelled = false;
    let polls = 0;
    let timer;
    const load = () =>
      api(`/api/orders/${encodeURIComponent(orderNumber)}`)
        .then(({ order: o }) => {
          if (cancelled) return;
          setOrder(o);
          // A payment confirmed only by Razorpay's webhook can land a few seconds later.
          if (pollWhilePending && o.status === "payment_pending" && ++polls < MAX_POLLS) timer = setTimeout(load, POLL_MS);
        })
        .catch((err) => !cancelled && setError(err.message));
    load();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [orderNumber, pollWhilePending]);
  return { order, error };
}

export function OrderPlaced() {
  const { orderNumber } = useParams();
  const { order, error } = useOrder(orderNumber, { pollWhilePending: true });
  const pending = order?.status === "payment_pending";

  return (
    <div className="container-page flex justify-center pb-24 pt-10">
      <Seo title="Order placed" noindex />
      <Card className="flex w-full max-w-[640px] flex-col items-center gap-5 bg-grad-cream p-8 text-center sm:p-12">
        <SproutMark className="h-10 w-10 text-gold-600" />
        {error ? (
          <p role="alert" className="text-danger-600">
            {error}
          </p>
        ) : !order ? (
          <Skeleton className="h-40 w-full" />
        ) : pending ? (
          <>
            <h1 className="text-[clamp(30px,3.4vw,42px)]">Confirming your payment…</h1>
            <p role="status">This usually takes a few seconds. You’ll get an email as soon as it’s confirmed — you don’t need to pay again.</p>
          </>
        ) : (
          <>
            <h1 className="text-[clamp(30px,3.4vw,42px)]">Thank you for your order</h1>
            <p className="text-[17px]">
              Order <strong className="font-semibold text-cocoa-900">{order.orderNumber}</strong> is confirmed. We’ve emailed you the details.
            </p>
            <dl className="grid w-full gap-3 rounded-lg border border-sand-400 bg-cream-50 p-5 text-left text-sm sm:grid-cols-3">
              <div>
                <dt className="text-xs font-semibold uppercase tracking-[0.12em] text-ink-500">Arriving</dt>
                <dd className="mt-1 text-cocoa-900">{etaRange(order.delivery.etaMinDays, order.delivery.etaMaxDays, new Date(order.createdAt))}</dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase tracking-[0.12em] text-ink-500">Payment</dt>
                <dd className="mt-1 text-cocoa-900">{order.paymentMethod === "cod" ? "Cash on Delivery" : "Paid online"}</dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase tracking-[0.12em] text-ink-500">Total</dt>
                <dd className="mt-1 font-serif text-lg font-bold text-brown-700">{formatPaise(order.amounts.total)}</dd>
              </div>
            </dl>
          </>
        )}
        <div className="flex flex-wrap justify-center gap-3">
          <Link to={`/account/orders/${orderNumber}`} className={cn(buttonVariants({ variant: "brown" }))}>
            View order
          </Link>
          <Link to="/solutions" className={cn(buttonVariants({ variant: "outline" }))}>
            Continue shopping
          </Link>
        </div>
      </Card>
    </div>
  );
}

export function PaymentFailed() {
  const { orderNumber } = useParams();
  const { state } = useLocation();
  return (
    <div className="container-page flex justify-center pb-24 pt-10">
      <Seo title="Payment not completed" noindex />
      <Card className="flex w-full max-w-[600px] flex-col items-center gap-5 p-8 text-center sm:p-12">
        <span className="flex h-16 w-16 items-center justify-center rounded-full border border-danger-600/30 bg-danger-50 text-danger-600">
          <PathIcon d={ICONS.cash} size={28} strokeWidth={1.5} />
        </span>
        <h1 className="text-[clamp(28px,3.2vw,38px)]">Payment not completed</h1>
        <p role="status">
          {state?.reason ? `${state.reason} ` : ""}No money was taken for order {orderNumber}. Your items are still in your cart, so you can try again or choose Cash on Delivery.
        </p>
        <p className="text-sm text-ink-500">If money was deducted, it will be confirmed or refunded automatically within 5–7 working days.</p>
        <div className="flex flex-wrap justify-center gap-3">
          <Link to="/checkout" className={cn(buttonVariants({ variant: "green" }))}>
            Try again
          </Link>
          <Link to="/contact" className={cn(buttonVariants({ variant: "outline" }))}>
            Contact support
          </Link>
        </div>
      </Card>
    </div>
  );
}
