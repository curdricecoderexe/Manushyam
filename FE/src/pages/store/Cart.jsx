import { useState } from "react";
import { Link, useLocation } from "react-router";
import { Seo } from "../../components/Seo";
import { QuantityStepper, Skeleton } from "../../components/ui/primitives";
import { Accordion } from "../../components/ui/Accordion";
import { Button, ArrowIcon } from "../../components/ui/button";
import { buttonVariants } from "../../components/ui/button-variants";
import { PathIcon } from "../../components/ui/icons";
import { ICONS } from "../../components/ui/icon-paths";
import { useCart } from "../../cart/context";
import { useAuth } from "../../auth/context";
import { useWishlist } from "../../wishlist/context";
import { useToast } from "../../toast/context";
import { useQuery } from "../../lib/query";
import { cn, formatPaise } from "../../lib/cn";

function CartLine({ line }) {
  const { setQty, removeItem } = useCart();
  const { isAuthenticated } = useAuth();
  const wishlist = useWishlist();
  const { toast } = useToast();
  const location = useLocation();
  const [busy, setBusy] = useState(false);

  const act = async (fn, done) => {
    setBusy(true);
    try {
      await fn();
      if (done) toast(done);
    } catch (err) {
      toast({ message: err.message, tone: "error" });
    } finally {
      setBusy(false);
    }
  };
  const moveToWishlist = () =>
    act(async () => {
      await wishlist.add(line.slug);
      await removeItem(line.sku);
    }, { message: `Moved ${line.name} to your wishlist.`, action: { label: "View", to: "/wishlist" } });

  return (
    <li className="flex flex-wrap gap-[18px] rounded-lg border border-sand-400 bg-cream-50 p-4" aria-busy={busy || undefined}>
      <Link to={`/solutions/${line.slug}`} className="shrink-0" tabIndex={-1} aria-hidden="true">
        {line.image && <img src={line.image.url} alt="" className="h-[132px] w-[120px] rounded-[10px] bg-[#F4EADB] object-cover" />}
      </Link>
      <div className="flex min-w-0 flex-[1_1_240px] flex-col gap-1.5">
        <div className="flex items-start justify-between gap-3">
          <h2 className="text-xl">
            <Link to={`/solutions/${line.slug}`} className="text-cocoa-900 hover:text-gold-700">
              {line.name}
            </Link>
          </h2>
          <span className="whitespace-nowrap font-serif text-xl font-bold text-cocoa-900">{formatPaise(line.price * line.qty)}</span>
        </div>
        <span className="text-sm text-ink-500">
          {line.variantLabel} · {formatPaise(line.price)} each
        </span>
        {line.inStock ? (
          <span className={cn("flex items-center gap-1.5 text-[13px]", line.lowStock ? "text-danger-600" : "text-leaf-800")}>
            <span className={cn("h-[7px] w-[7px] rounded-full", line.lowStock ? "bg-danger-600" : "bg-leaf-800")} aria-hidden="true" />
            {line.lowStock ? `Only ${line.lowStock} left` : "In stock"}
          </span>
        ) : (
          <span className="text-[13px] font-medium text-danger-600">Out of stock — remove it or save it for later</span>
        )}
        <div className="mt-auto flex flex-wrap items-center gap-[18px] pt-2">
          {line.inStock && (
            <QuantityStepper value={line.qty} max={Math.min(10, line.lowStock ?? 10)} size="sm" label={`Quantity of ${line.name}`} onChange={(q) => act(() => setQty(line.sku, q))} />
          )}
          {isAuthenticated ? (
            <button type="button" disabled={busy} onClick={moveToWishlist} className="flex items-center gap-1.5 py-2 text-sm text-cocoa-900 hover:text-gold-700">
              <PathIcon d={ICONS.heart} size={16} strokeWidth={1.7} className="text-brown-700" />
              Move to wishlist
            </button>
          ) : (
            <Link to={`/login?next=${encodeURIComponent(location.pathname)}`} className="flex items-center gap-1.5 py-2 text-sm text-cocoa-900 hover:text-gold-700">
              <PathIcon d={ICONS.heart} size={16} strokeWidth={1.7} className="text-brown-700" />
              Sign in to save for later
            </Link>
          )}
          <button
            type="button"
            disabled={busy}
            aria-label={`Remove ${line.name}`}
            onClick={() => act(() => removeItem(line.sku), { message: `Removed ${line.name}.`, tone: "info" })}
            className="flex items-center gap-1.5 py-2 text-sm text-danger-600"
          >
            <PathIcon d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" size={16} strokeWidth={1.7} />
            Remove
          </button>
        </div>
      </div>
    </li>
  );
}

function CouponBox() {
  const { cart, applyCoupon, removeCoupon } = useCart();
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const applied = cart.coupon?.applied ? cart.coupon : null;
  const pendingMin = cart.coupon && !cart.coupon.applied && cart.coupon.reason === "MIN_ORDER" ? cart.coupon : null;

  const submit = async (e) => {
    e.preventDefault();
    if (!/^[A-Za-z0-9_-]{3,30}$/.test(code.trim())) return setError("Enter a valid code");
    setBusy(true);
    setError("");
    try {
      await applyCoupon(code);
      setCode("");
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
    return undefined;
  };

  if (applied) {
    return (
      <div className="flex items-center justify-between gap-3 rounded-md border border-[#C6DCCB] bg-leaf-50 px-3.5 py-3 text-sm text-leaf-800">
        <span className="flex items-center gap-2">
          <PathIcon d="M5 12l5 5 9-10" size={14} strokeWidth={2} />
          {applied.message}
        </span>
        <button type="button" onClick={() => removeCoupon()} className="font-medium text-cocoa-900 underline">
          Remove
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-1.5">
      <label htmlFor="coupon" className="text-sm font-medium text-cocoa-900">
        Coupon code
      </label>
      <div className="flex h-12">
        <input
          id="coupon"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          autoComplete="off"
          maxLength={30}
          aria-invalid={error ? "true" : undefined}
          aria-describedby={error ? "coupon-error" : undefined}
          className="min-w-0 flex-1 rounded-l-md border border-r-0 border-sand-400 bg-white px-3.5 text-[15px] uppercase tracking-[0.08em] text-cocoa-900 focus:border-gold-600 focus:outline-none aria-[invalid=true]:border-danger-600"
        />
        <button type="submit" disabled={busy} className="rounded-r-md border border-brown-700 bg-brown-700 px-[18px] font-serif text-[15px] text-white disabled:opacity-60">
          {busy ? "Checking…" : "Apply"}
        </button>
      </div>
      {error && (
        <span id="coupon-error" role="alert" className="text-[13px] text-danger-600">
          {error}
        </span>
      )}
      {pendingMin && !error && <span className="text-[13px] text-gold-700">{pendingMin.message}</span>}
    </form>
  );
}

function Summary() {
  const { cart } = useCart();
  return (
    <aside aria-label="Order summary" className="flex w-full flex-col gap-4 lg:sticky lg:top-24 lg:max-w-[420px] lg:flex-[1_1_340px]">
      <div className="flex flex-col gap-3.5 rounded-[14px] border border-sand-400 bg-cream-50 p-6 shadow-md">
        <h2 className="text-2xl">Order Summary</h2>
        <CouponBox />
        <dl className="mt-1.5 flex flex-col gap-2.5 text-[15px]">
          <div className="flex justify-between">
            <dt>Subtotal</dt>
            <dd className="text-cocoa-900">{formatPaise(cart.subtotal)}</dd>
          </div>
          {cart.discount > 0 && (
            <div className="flex justify-between">
              <dt>Discount ({cart.coupon.code})</dt>
              <dd className="text-leaf-800">− {formatPaise(cart.discount)}</dd>
            </div>
          )}
          <div className="flex justify-between">
            <dt>Shipping</dt>
            <dd className="text-leaf-800">{cart.shipping ? formatPaise(cart.shipping) : "Free"}</dd>
          </div>
          <div className="flex justify-between gap-4 text-[13px] text-ink-500">
            <dt>Delivery estimate</dt>
            <dd className="text-right">Calculated at checkout by PIN code</dd>
          </div>
          <div className="mt-1 flex items-baseline justify-between border-t border-sand-400 pt-3.5">
            <dt className="font-serif text-[19px] text-cocoa-900">Total</dt>
            <dd className="font-serif text-[26px] font-bold text-brown-700">{formatPaise(cart.total)}</dd>
          </div>
          <div className="-mt-1.5 text-right text-xs text-ink-500">Inclusive of GST</div>
        </dl>
        <Link to="/checkout" aria-disabled={!cart.canCheckout || undefined} className={cn(buttonVariants({ variant: "green", size: "lg" }), "min-h-14 text-[19px]")}>
          <PathIcon d={ICONS.lock} size={18} strokeWidth={1.8} />
          Secure Checkout
        </Link>
        {!cart.canCheckout && cart.count > 0 && <p className="text-center text-[13px] text-danger-600">Remove out-of-stock items to continue.</p>}
        <Link to="/solutions" className="p-1.5 text-center text-sm text-cocoa-900">
          Continue shopping
        </Link>
      </div>
      <ul className="grid grid-cols-3 gap-2 text-center text-xs text-ink-700">
        {[
          ["COD available", ICONS.cash],
          ["Razorpay secure", ICONS.lock],
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

function Upsell({ inCart }) {
  const { addItem } = useCart();
  const { data } = useQuery("/api/products?limit=8");
  const picks = (data?.products ?? []).filter((p) => p.inStock && !inCart.has(p.slug)).slice(0, 2);
  if (!picks.length) return null;
  return (
    <section aria-labelledby="upsell" className="mt-3 rounded-lg border border-sand-400 bg-cream-200 p-5">
      <h2 id="upsell" className="mb-3.5 text-xl">
        Complete the ritual
      </h2>
      <ul className="grid gap-3.5 sm:grid-cols-2">
        {picks.map((p) => (
          <li key={p.slug} className="flex items-center gap-3 rounded-[10px] border border-sand-400 bg-white p-2.5">
            {p.image && <img src={p.image.url} alt="" className="h-16 w-16 rounded-md object-cover" />}
            <span className="flex flex-1 flex-col gap-0.5">
              <Link to={`/solutions/${p.slug}`} className="font-serif text-[15px] text-cocoa-900 hover:text-gold-700">
                {p.name}
              </Link>
              <span className="text-sm font-semibold text-cocoa-900">{formatPaise(p.price)}</span>
            </span>
            <button
              type="button"
              aria-label={`Add ${p.name}`}
              onClick={() => addItem({ sku: p.defaultSku, openDrawer: false })}
              className="flex h-10 w-10 items-center justify-center rounded-full border border-brown-700 text-xl text-brown-700 hover:bg-brown-700 hover:text-white"
            >
              +
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

function CartFaqs() {
  const { data } = useQuery("/api/faqs");
  const [open, setOpen] = useState(null);
  const faqs = (data?.faqs ?? []).filter((f) => ["orders", "payments"].includes(f.topic)).slice(0, 4);
  if (!faqs.length) return null;
  return (
    <section aria-labelledby="cart-faq" className="mt-12">
      <h2 id="cart-faq" className="mb-4 text-2xl">
        Questions before you order
      </h2>
      <Accordion openId={open} onToggle={setOpen} items={faqs.map((f) => ({ id: f.id, title: f.question, content: <p>{f.answer}</p> }))} />
      <Link to="/faq" className="mt-4 inline-block text-sm">
        See all FAQs →
      </Link>
    </section>
  );
}

export default function Cart() {
  const { cart, isLoading, error } = useCart();
  const lines = cart.lines ?? [];
  const inCart = new Set(lines.map((l) => l.slug));

  return (
    <>
      <Seo title="Your Cart" path="/cart" noindex />
      <div className="container-page pb-24 pt-8">
        <h1 className="mb-1.5 text-[clamp(34px,3.6vw,48px)]">Your Cart</h1>
        <p className="mb-7 text-[15px] text-ink-500">
          {cart.count} {cart.count === 1 ? "item" : "items"} · Free shipping on every order
        </p>

        {error && !lines.length ? (
          <div className="rounded-lg border border-sand-400 bg-cream-50 p-8 text-center">
            <p className="mb-4">We couldn’t load your cart. Please check your connection.</p>
            <Button variant="outline" onClick={() => window.location.reload()}>
              Reload
            </Button>
          </div>
        ) : isLoading ? (
          <div className="flex flex-col gap-4" aria-busy="true" aria-label="Loading your cart">
            <Skeleton className="h-[164px]" />
            <Skeleton className="h-[164px]" />
          </div>
        ) : !lines.length ? (
          <section className="flex flex-col items-center gap-4 rounded-[16px] border border-sand-400 bg-cream-50 px-6 py-16 text-center">
            <span className="flex h-[88px] w-[88px] items-center justify-center rounded-full border border-sand-500 bg-cream-200 text-gold-600">
              <PathIcon d={ICONS.bag} size={40} strokeWidth={1.3} />
            </span>
            <h2 className="text-[28px]">Your cart is empty</h2>
            <p className="max-w-[380px]">Begin your ritual with our bestselling Ayurvedic therapies.</p>
            <Link to="/solutions" className={cn(buttonVariants({ variant: "gold", size: "md" }), "text-sm")}>
              Shop therapy
              <ArrowIcon />
            </Link>
          </section>
        ) : (
          <>
            <div className="flex flex-col items-start gap-7 lg:flex-row">
              <section aria-label="Cart items" className="flex w-full min-w-0 flex-col gap-4 lg:flex-[999_1_560px]">
                <p className="flex items-center gap-3 rounded-[10px] border border-[#C6DCCB] bg-leaf-50 px-4 py-3 text-sm text-leaf-800">
                  <PathIcon d={ICONS.truck} size={18} strokeWidth={1.8} />
                  <span>
                    You’ve unlocked <strong>free shipping</strong>. Orders ship within 24 hours.
                  </span>
                </p>
                {cart.issues.length > 0 && (
                  <ul role="status" className="flex flex-col gap-2 rounded-[10px] border border-gold-300 bg-[#FBF3E6] px-4 py-3 text-sm text-cocoa-900">
                    {cart.issues.map((i) => (
                      <li key={i.sku + i.type}>{i.message}</li>
                    ))}
                  </ul>
                )}
                <ul className="flex flex-col gap-4">
                  {lines.map((l) => (
                    <CartLine key={l.sku} line={l} />
                  ))}
                </ul>
                <Upsell inCart={inCart} />
              </section>
              <Summary />
            </div>
            <CartFaqs />
          </>
        )}
      </div>
    </>
  );
}
