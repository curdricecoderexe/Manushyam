import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router";
import { Seo } from "../../components/Seo";
import { Card, Skeleton } from "../../components/ui/primitives";
import { Button } from "../../components/ui/button";
import { Dialog } from "../../components/ui/Dialog";
import { PathIcon } from "../../components/ui/icons";
import { ICONS } from "../../components/ui/icon-paths";
import { CheckoutSteps } from "../../components/checkout/CheckoutSteps";
import { CodConfirm } from "../../components/order/CodConfirm";
import { AddressForm } from "../account/Addresses";
import { useCart } from "../../cart/context";
import { useToast } from "../../toast/context";
import { api } from "../../lib/api";
import { payWithRazorpay } from "../../lib/razorpay";
import { etaRange } from "../../lib/orders";
import { cn, formatPaise } from "../../lib/cn";

// Errors that mean "the cart or prices moved under you": refresh everything and let the customer re-check.
const STALE_CODES = ["PRICE_CHANGED", "CART_CHANGED", "OUT_OF_STOCK", "COD_UNAVAILABLE", "DELIVERY_UNAVAILABLE", "NOT_SERVICEABLE"];
const isStale = (code) => STALE_CODES.includes(code) || String(code).startsWith("COUPON_");

function newIdempotencyKey() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  const bytes = new Uint8Array(16);
  globalThis.crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

function Radio({ name, checked, disabled, onChange, children, className }) {
  return (
    <label
      className={cn(
        "flex cursor-pointer items-start gap-3.5 rounded-lg border bg-white/70 p-4 transition-colors",
        checked ? "border-2 border-gold-600 bg-cream-50 p-[15px]" : "border-sand-400 hover:border-gold-600",
        disabled && "cursor-not-allowed opacity-60 hover:border-sand-400",
        className
      )}
    >
      <input type="radio" name={name} checked={checked} disabled={disabled} onChange={onChange} className="mt-1 h-[18px] w-[18px] shrink-0 accent-brown-700" />
      <span className="flex min-w-0 flex-1 flex-col gap-1">{children}</span>
    </label>
  );
}

function StepCard({ index, step, title, summary, onEdit, children }) {
  const open = index === step;
  const done = index < step;
  return (
    <Card as="section" aria-labelledby={`step-${index}`} className={cn("p-5 sm:p-6", !open && !done && "opacity-60")}>
      <div className="flex items-center justify-between gap-3">
        <h2 id={`step-${index}`} className="text-[22px]">
          <span className="mr-2 font-sans text-sm font-semibold text-gold-700">{index + 1}.</span>
          {title}
        </h2>
        {done && (
          <button type="button" onClick={onEdit} className="text-sm font-semibold text-gold-700" aria-label={`Change ${title.toLowerCase()}`}>
            Change
          </button>
        )}
      </div>
      {done && summary && <div className="mt-2 text-sm text-ink-700">{summary}</div>}
      {open && <div className="mt-4">{children}</div>}
    </Card>
  );
}

function addressLine(a) {
  return [a.line1, a.line2, a.landmark && `near ${a.landmark}`, `${a.city}, ${a.state} ${a.pincode}`].filter(Boolean).join(", ");
}

function Summary({ quote, cart }) {
  const lines = quote?.cart.lines ?? cart.lines ?? [];
  const priced = quote?.cart ?? cart;
  const sel = quote?.selection;
  return (
    <aside aria-label="Order summary" className="flex w-full flex-col gap-4 lg:sticky lg:top-24 lg:max-w-[400px] lg:flex-[1_1_340px]">
      <div className="flex flex-col gap-4 rounded-[14px] border border-sand-400 bg-cream-50 p-6 shadow-md">
        <h2 className="text-2xl">Order Summary</h2>
        <ul className="flex flex-col gap-3">
          {lines.map((l) => (
            <li key={l.sku} className="flex items-center gap-3 text-sm">
              {l.image && <img src={l.image.url} alt="" className="h-14 w-14 shrink-0 rounded-md bg-[#F4EADB] object-cover" />}
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="font-serif text-[15px] text-cocoa-900">{l.name}</span>
                <span className="text-xs text-ink-500">Qty {l.qty}</span>
              </span>
              <span className="font-medium text-cocoa-900">{formatPaise(l.lineTotal)}</span>
            </li>
          ))}
        </ul>
        <dl className="flex flex-col gap-2.5 border-t border-sand-400 pt-4 text-[15px]">
          <div className="flex justify-between">
            <dt>Subtotal</dt>
            <dd className="text-cocoa-900">{formatPaise(priced.subtotal)}</dd>
          </div>
          {priced.discount > 0 && (
            <div className="flex justify-between">
              <dt>Discount ({priced.coupon?.code})</dt>
              <dd className="text-leaf-800">− {formatPaise(priced.discount)}</dd>
            </div>
          )}
          <div className="flex justify-between">
            <dt>Shipping</dt>
            <dd className={sel?.shipping ? "text-cocoa-900" : "text-leaf-800"}>{sel ? (sel.shipping ? formatPaise(sel.shipping) : "Free") : "—"}</dd>
          </div>
          {sel?.codFee > 0 && (
            <div className="flex justify-between">
              <dt>COD fee</dt>
              <dd className="text-cocoa-900">{formatPaise(sel.codFee)}</dd>
            </div>
          )}
          <div className="mt-1 flex items-baseline justify-between border-t border-sand-400 pt-3.5">
            <dt className="font-serif text-[19px] text-cocoa-900">Total</dt>
            <dd className="font-serif text-[26px] font-bold text-brown-700">{formatPaise(sel?.total ?? priced.total)}</dd>
          </div>
          <div className="-mt-1.5 text-right text-xs text-ink-500">Inclusive of GST</div>
        </dl>
      </div>
      <ul className="grid grid-cols-3 gap-2 text-center text-xs text-ink-700">
        {[
          ["Razorpay secure", ICONS.lock],
          ["Shiprocket shipping", ICONS.truck],
          ["GST invoice", ICONS.invoice],
        ].map(([label, icon]) => (
          <li key={label} className="flex flex-col items-center gap-1.5 rounded-[10px] border border-sand-400 bg-cream-50 px-1.5 py-3">
            <PathIcon d={icon} size={22} strokeWidth={1.5} className="text-gold-600" />
            {label}
          </li>
        ))}
      </ul>
    </aside>
  );
}

export default function Checkout() {
  const { cart, isLoading: cartLoading, reload } = useCart();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [addresses, setAddresses] = useState(null);
  const [addressId, setAddressId] = useState(null);
  const [addingAddress, setAddingAddress] = useState(false);
  const [deliveryMethod, setDeliveryMethod] = useState("standard");
  const [paymentMethod, setPaymentMethod] = useState(null);
  const [quote, setQuote] = useState(null);
  const [quoteError, setQuoteError] = useState("");
  const [quoteNonce, setQuoteNonce] = useState(0);
  const [placing, setPlacing] = useState(false);
  const [placeError, setPlaceError] = useState("");
  const [codOrder, setCodOrder] = useState(null);
  // One key per submission attempt: a retried request after a network error replays the same order.
  const idemKey = useRef(null);
  // Set once the order is placed, so the emptied cart doesn't flash the "cart is empty" screen.
  const [finished, setFinished] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api("/api/addresses")
      .then(({ addresses: list }) => {
        if (cancelled) return;
        setAddresses(list);
        const preferred = list.find((a) => a.isDefault) ?? list[0];
        if (preferred) setAddressId(preferred.id);
        else setAddingAddress(true);
      })
      .catch((err) => !cancelled && setQuoteError(err.message));
    return () => {
      cancelled = true;
    };
  }, []);

  // Re-quote whenever a choice or the cart changes. The server's numbers are the only ones shown.
  useEffect(() => {
    if (!cart.count || finished) return undefined;
    let cancelled = false;
    const body = { deliveryMethod, ...(addressId ? { addressId } : {}), ...(paymentMethod ? { paymentMethod } : {}) };
    api("/api/checkout/quote", { method: "POST", body })
      .then((q) => {
        if (cancelled) return;
        setQuote(q);
        setQuoteError("");
        if (!paymentMethod) setPaymentMethod(q.payment.razorpay.available ? "razorpay" : q.payment.cod.available ? "cod" : null);
        else if (paymentMethod === "cod" && !q.payment.cod.available && q.payment.razorpay.available) setPaymentMethod("razorpay");
        if (q.selection.deliveryMethod && q.selection.deliveryMethod !== deliveryMethod) setDeliveryMethod(q.selection.deliveryMethod);
      })
      .catch((err) => !cancelled && setQuoteError(err.message));
    idemKey.current = null;
    return () => {
      cancelled = true;
    };
  }, [addressId, deliveryMethod, paymentMethod, cart.count, cart.total, quoteNonce, finished]);

  const refreshAll = useCallback(async () => {
    await reload();
    setQuoteNonce((n) => n + 1);
  }, [reload]);

  const done = useCallback(
    async (orderNumber) => {
      setFinished(true);
      await reload();
      navigate(`/checkout/success/${orderNumber}`, { replace: true });
    },
    [reload, navigate]
  );

  async function pay({ order, next }) {
    const n = order.orderNumber;
    let result;
    try {
      result = await payWithRazorpay(next, { description: `Order ${n}` });
    } catch (err) {
      await api(`/api/orders/${n}/payment/abandon`, { method: "POST" }).catch(() => {});
      throw err;
    }
    if (result.status === "paid") {
      const r = result.response;
      try {
        await api(`/api/orders/${n}/payment/verify`, {
          method: "POST",
          body: { razorpay_order_id: r.razorpay_order_id, razorpay_payment_id: r.razorpay_payment_id, razorpay_signature: r.razorpay_signature },
        });
      } catch {
        // Razorpay's webhook confirms the payment independently; the success page waits for it.
      }
      return done(n);
    }
    // Closed the window (or every attempt failed): give the stock back straight away.
    await api(`/api/orders/${n}/payment/abandon`, { method: "POST" }).catch(() => {});
    setFinished(true);
    navigate(`/checkout/failed/${n}`, { replace: true, state: { reason: result.reason } });
    return undefined;
  }

  async function placeOrder() {
    if (placing || !quote) return;
    setPlacing(true);
    setPlaceError("");
    idemKey.current ??= newIdempotencyKey();
    try {
      const res = await api("/api/orders", {
        method: "POST",
        headers: { "Idempotency-Key": idemKey.current },
        body: { addressId, deliveryMethod: quote.selection.deliveryMethod, paymentMethod, expectedTotal: quote.selection.total },
      });
      if (res.next.type === "razorpay") await pay(res);
      else if (res.next.type === "cod_otp") setCodOrder(res);
      else await done(res.order.orderNumber);
    } catch (err) {
      // Keep the key after a network failure so retrying can't create a second order.
      if (err.status !== 0) idemKey.current = null;
      setPlaceError(err.message);
      if (isStale(err.code)) {
        await refreshAll();
        if (["COD_UNAVAILABLE", "NOT_SERVICEABLE", "DELIVERY_UNAVAILABLE"].includes(err.code)) setStep(err.code === "COD_UNAVAILABLE" ? 2 : 0);
      }
    } finally {
      setPlacing(false);
    }
  }

  if (!cartLoading && !cart.count && !finished && !codOrder) {
    return (
      <div className="container-page flex flex-col items-center gap-4 py-20 text-center">
        <Seo title="Checkout" path="/checkout" noindex />
        <h1 className="text-[36px]">Your cart is empty</h1>
        <p>Add a therapy to your cart to check out.</p>
        <Link to="/solutions" className="font-semibold text-gold-700">
          Explore solutions →
        </Link>
      </div>
    );
  }

  const address = addresses?.find((a) => a.id === addressId);
  const delivery = quote?.delivery;
  const methods = delivery?.methods ?? [];
  const chosenMethod = methods.find((m) => m.id === quote?.selection.deliveryMethod);
  const cartProblems = quote && (quote.cart.issues.length > 0 || !quote.cart.canCheckout);
  const canPlace = quote && !cartProblems && delivery?.serviceable && !delivery.belowMinOrder && paymentMethod && address;
  const payLabel = paymentMethod === "cod" ? "Place order (Cash on Delivery)" : `Pay ${formatPaise(quote?.selection.total ?? 0)} securely`;

  return (
    <div className="container-page pb-24 pt-8">
      <Seo title="Checkout" path="/checkout" noindex />
      <h1 className="mb-6 text-[clamp(34px,3.6vw,48px)]">Checkout</h1>
      <CheckoutSteps current={step} onSelect={setStep} />

      {quoteError && (
        <p role="alert" className="mb-5 rounded-[10px] border border-danger-600/30 bg-danger-50 px-4 py-3 text-sm text-danger-600">
          {quoteError}
        </p>
      )}
      {cartProblems && (
        <div role="status" className="mb-5 rounded-[10px] border border-gold-300 bg-[#FBF3E6] px-4 py-3 text-sm text-cocoa-900">
          {quote.cart.issues.map((i) => (
            <p key={i.sku + i.type}>{i.message}</p>
          ))}
          <Link to="/cart" className="font-semibold text-gold-700">
            Review your cart →
          </Link>
        </div>
      )}

      <div className="flex flex-col items-start gap-7 lg:flex-row">
        <div className="flex w-full min-w-0 flex-col gap-4 lg:flex-[999_1_560px]">
          <StepCard index={0} step={step} title="Delivery address" onEdit={() => setStep(0)} summary={address && `${address.fullName} · ${addressLine(address)}`}>
            {addresses === null ? (
              <Skeleton className="h-28" />
            ) : (
              <div className="flex flex-col gap-3">
                {!addingAddress && (
                  <fieldset className="flex flex-col gap-3">
                    <legend className="sr-only">Choose a delivery address</legend>
                    {addresses.map((a) => (
                      <Radio key={a.id} name="address" checked={a.id === addressId} onChange={() => setAddressId(a.id)}>
                        <span className="font-medium text-cocoa-900">
                          {a.fullName} <span className="ml-1 text-xs font-normal uppercase tracking-[0.12em] text-ink-500">{a.label}</span>
                        </span>
                        <span className="text-sm">{addressLine(a)}</span>
                        <span className="text-sm text-ink-500">+91 {a.phone}</span>
                      </Radio>
                    ))}
                  </fieldset>
                )}
                {addingAddress ? (
                  <AddressForm
                    initial={{ isDefault: addresses.length === 0 }}
                    onCancel={() => setAddingAddress(addresses.length === 0)}
                    onSaved={(saved) => {
                      setAddresses((list) => [...(list ?? []).map((a) => (saved.isDefault ? { ...a, isDefault: false } : a)), saved]);
                      setAddressId(saved.id);
                      setAddingAddress(false);
                    }}
                  />
                ) : (
                  <button type="button" onClick={() => setAddingAddress(true)} className="self-start py-1.5 text-sm font-semibold text-gold-700">
                    + Add a new address
                  </button>
                )}
                {!addingAddress && (
                  <Button variant="brown" className="self-start" disabled={!addressId} onClick={() => setStep(1)}>
                    Deliver here
                  </Button>
                )}
              </div>
            )}
          </StepCard>

          <StepCard
            index={1}
            step={step}
            title="Delivery"
            onEdit={() => setStep(1)}
            summary={chosenMethod && `${chosenMethod.label} · ${chosenMethod.fee ? formatPaise(chosenMethod.fee) : "Free"} · arrives ${etaRange(chosenMethod.etaMinDays, chosenMethod.etaMaxDays)}`}
          >
            {!delivery ? (
              <Skeleton className="h-20" />
            ) : !delivery.serviceable ? (
              <div className="flex flex-col gap-3">
                <p role="alert" className="text-danger-600">
                  {delivery.message}
                </p>
                <Button variant="outline" className="self-start" onClick={() => setStep(0)}>
                  Choose another address
                </Button>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                <fieldset className="flex flex-col gap-3">
                  <legend className="sr-only">Choose a delivery speed</legend>
                  {methods.map((m) => (
                    <Radio key={m.id} name="delivery" checked={m.id === quote.selection.deliveryMethod} onChange={() => setDeliveryMethod(m.id)}>
                      <span className="flex justify-between gap-3 font-medium text-cocoa-900">
                        {m.label}
                        <span className={m.fee ? "" : "text-leaf-800"}>{m.fee ? formatPaise(m.fee) : "Free"}</span>
                      </span>
                      <span className="text-sm">Arrives {etaRange(m.etaMinDays, m.etaMaxDays)}</span>
                    </Radio>
                  ))}
                </fieldset>
                {delivery.courier && <p className="text-xs text-ink-500">Ships with {delivery.courier} via Shiprocket.</p>}
                {delivery.belowMinOrder && <p className="text-sm text-danger-600">{delivery.message}</p>}
                <Button variant="brown" className="self-start" onClick={() => setStep(2)}>
                  Continue to payment
                </Button>
              </div>
            )}
          </StepCard>

          <StepCard index={2} step={step} title="Payment" onEdit={() => setStep(2)} summary={paymentMethod === "cod" ? "Cash on Delivery" : paymentMethod === "razorpay" ? "Pay online with Razorpay" : null}>
            {!quote ? (
              <Skeleton className="h-28" />
            ) : (
              <div className="flex flex-col gap-3">
                <fieldset className="flex flex-col gap-3">
                  <legend className="sr-only">Choose how to pay</legend>
                  <Radio name="payment" checked={paymentMethod === "razorpay"} disabled={!quote.payment.razorpay.available} onChange={() => setPaymentMethod("razorpay")}>
                    <span className="flex items-center gap-2 font-medium text-cocoa-900">
                      <PathIcon d={ICONS.lock} size={16} strokeWidth={1.8} className="text-gold-600" />
                      Pay online
                    </span>
                    <span className="text-sm">UPI, cards, net banking & wallets — secured by Razorpay.</span>
                    {!quote.payment.razorpay.available && <span className="text-sm text-danger-600">Online payments are unavailable right now.</span>}
                  </Radio>
                  <Radio name="payment" checked={paymentMethod === "cod"} disabled={!quote.payment.cod.available} onChange={() => setPaymentMethod("cod")}>
                    <span className="flex justify-between gap-3 font-medium text-cocoa-900">
                      <span className="flex items-center gap-2">
                        <PathIcon d={ICONS.cash} size={16} strokeWidth={1.8} className="text-gold-600" />
                        Cash on Delivery
                      </span>
                      {quote.payment.cod.fee > 0 && <span className="font-normal">+ {formatPaise(quote.payment.cod.fee)}</span>}
                    </span>
                    <span className="text-sm">{quote.payment.cod.available ? "Pay when it arrives. We’ll email you a code to confirm the order." : quote.payment.cod.reason}</span>
                  </Radio>
                </fieldset>
                <Button variant="brown" className="self-start" disabled={!paymentMethod} onClick={() => setStep(3)}>
                  Review order
                </Button>
              </div>
            )}
          </StepCard>

          <StepCard index={3} step={step} title="Review & place order">
            {quote && address && (
              <div className="flex flex-col gap-4">
                <dl className="grid gap-3 text-sm sm:grid-cols-3">
                  <div>
                    <dt className="text-xs font-semibold uppercase tracking-[0.12em] text-ink-500">Deliver to</dt>
                    <dd className="mt-1 text-cocoa-900">
                      {address.fullName}
                      <br />
                      {address.city}, {address.pincode}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs font-semibold uppercase tracking-[0.12em] text-ink-500">Arrives</dt>
                    <dd className="mt-1 text-cocoa-900">{chosenMethod ? etaRange(chosenMethod.etaMinDays, chosenMethod.etaMaxDays) : "—"}</dd>
                  </div>
                  <div>
                    <dt className="text-xs font-semibold uppercase tracking-[0.12em] text-ink-500">Payment</dt>
                    <dd className="mt-1 text-cocoa-900">{paymentMethod === "cod" ? "Cash on Delivery" : "Online (Razorpay)"}</dd>
                  </div>
                </dl>
                {placeError && (
                  <p role="alert" className="rounded-[10px] border border-danger-600/30 bg-danger-50 px-4 py-3 text-sm text-danger-600">
                    {placeError}
                  </p>
                )}
                <Button variant="green" size="lg" className="min-h-14 text-[19px]" disabled={!canPlace || placing} onClick={placeOrder}>
                  <PathIcon d={ICONS.lock} size={18} strokeWidth={1.8} />
                  {placing ? "Placing your order…" : payLabel}
                </Button>
                <p className="text-xs text-ink-500">
                  By placing this order you agree to our{" "}
                  <Link to="/policies/terms" className="underline">
                    terms
                  </Link>{" "}
                  and{" "}
                  <Link to="/policies/returns" className="underline">
                    returns policy
                  </Link>
                  .
                </p>
              </div>
            )}
          </StepCard>
        </div>
        <Summary quote={quote} cart={cart} />
      </div>

      <Dialog
        open={Boolean(codOrder)}
        onClose={() => {
          toast({ message: "Your order is saved but not confirmed yet. Confirm it from My orders within 20 minutes.", tone: "info" });
          setFinished(true);
          navigate(`/account/orders/${codOrder.order.orderNumber}`, { replace: true });
        }}
        title="Confirm your order"
        className="max-w-md"
      >
        {codOrder && <CodConfirm orderNumber={codOrder.order.orderNumber} sentTo={codOrder.next.sentTo} onConfirmed={(order) => done(order.orderNumber)} />}
      </Dialog>
    </div>
  );
}
