import { useState } from "react";
import { Link } from "react-router";
import { Seo } from "../../components/Seo";
import { Card, Field, StatusPill } from "../../components/ui/primitives";
import { Button } from "../../components/ui/button";
import { SectionTitle } from "../../components/ui/ornaments";
import { OrderTimeline, ShipmentEvents } from "../../components/order/OrderTimeline";
import { useAuth } from "../../auth/context";
import { api } from "../../lib/api";
import { STATUS_LABELS, STATUS_TONES, etaRange, formatDate } from "../../lib/orders";
import { formatPaise } from "../../lib/cn";

const ORDER_RE = /^MM\d{6}-[A-Z0-9]{5}$/;

export default function TrackOrder() {
  const { isAuthenticated } = useAuth();
  const [values, setValues] = useState({ orderNumber: "", email: "" });
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const [order, setOrder] = useState(null);

  async function submit(e) {
    e.preventDefault();
    const orderNumber = values.orderNumber.trim().toUpperCase();
    const found = {};
    if (!ORDER_RE.test(orderNumber)) found.orderNumber = "Enter your order number, e.g. MM261004-7KQ2X";
    if (!/^\S+@\S+\.\S+$/.test(values.email.trim())) found.email = "Enter the email used for the order";
    setErrors(found);
    if (Object.keys(found).length) return;
    setBusy(true);
    try {
      const data = await api("/api/track-order", { method: "POST", auth: false, body: { orderNumber, email: values.email.trim() } });
      setOrder(data.order);
    } catch (err) {
      setOrder(null);
      setErrors({ form: err.message, ...err.fieldErrors });
    } finally {
      setBusy(false);
    }
  }

  const bind = (name) => ({ value: values[name], error: errors[name], onChange: (e) => setValues((v) => ({ ...v, [name]: e.target.value })) });

  return (
    <div className="container-page pb-24 pt-10">
      <Seo title="Track your order" description="Check the delivery status of your ManushyaM order." path="/track-order" />
      <SectionTitle as="h1" subtitle="Enter your order number and email to see where your ritual is.">
        Track your order
      </SectionTitle>
      <div className="mx-auto mt-8 grid max-w-[1000px] items-start gap-6 md:grid-cols-[minmax(0,380px)_1fr]">
        <Card as="form" onSubmit={submit} noValidate className="flex flex-col gap-4 p-6" aria-label="Find your order">
          <Field label="Order number" placeholder="MM261004-7KQ2X" autoCapitalize="characters" {...bind("orderNumber")} />
          <Field label="Email address" type="email" autoComplete="email" {...bind("email")} />
          {errors.form && (
            <p role="alert" className="text-sm text-danger-600">
              {errors.form}
            </p>
          )}
          <Button type="submit" variant="brown" disabled={busy}>
            {busy ? "Finding your order…" : "Track order"}
          </Button>
          {isAuthenticated ? (
            <Link to="/account/orders" className="text-center text-sm font-semibold text-gold-700">
              See all my orders →
            </Link>
          ) : (
            <p className="text-center text-sm text-ink-500">
              Have an account?{" "}
              <Link to="/login?next=%2Faccount%2Forders" className="font-semibold text-gold-700">
                Sign in
              </Link>{" "}
              to see every order.
            </p>
          )}
        </Card>

        {order ? (
          <Card as="section" aria-label={`Order ${order.orderNumber}`} className="flex flex-col gap-5 p-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-2xl">{order.orderNumber}</h2>
                <p className="text-sm text-ink-500">
                  Placed {formatDate(order.createdAt)} · to {order.destination.city}, {order.destination.state} · {formatPaise(order.total)}
                </p>
              </div>
              <StatusPill tone={STATUS_TONES[order.status]}>{STATUS_LABELS[order.status]}</StatusPill>
            </div>
            <div className="grid gap-6 sm:grid-cols-2">
              <OrderTimeline order={order} />
              <div className="flex flex-col gap-3">
                {order.shipment ? <ShipmentEvents shipment={order.shipment} /> : <p className="text-sm text-ink-500">Courier tracking appears here once your order ships.</p>}
                {order.status !== "delivered" && order.delivery?.etaMaxDays != null && (
                  <p className="text-sm">Expected {etaRange(order.delivery.etaMinDays, order.delivery.etaMaxDays, new Date(order.createdAt))}</p>
                )}
              </div>
            </div>
            <ul className="flex flex-wrap gap-3 border-t border-sand-400 pt-4 text-sm">
              {order.items.map((i) => (
                <li key={i.name} className="flex items-center gap-2">
                  {i.image && <img src={i.image.url} alt="" className="h-10 w-10 rounded-md object-cover" />}
                  {i.name} × {i.qty}
                </li>
              ))}
            </ul>
          </Card>
        ) : (
          <Card className="hidden p-8 text-sm text-ink-500 md:block">Your order number is in your confirmation email and starts with “MM”.</Card>
        )}
      </div>
    </div>
  );
}
