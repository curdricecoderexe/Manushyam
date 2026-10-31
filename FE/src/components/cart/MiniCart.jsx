import { Link } from "react-router";
import { useCart } from "../../cart/context";
import { Dialog } from "../ui/Dialog";
import { buttonVariants } from "../ui/button-variants";
import { cn, formatPaise } from "../../lib/cn";

// Slide-in cart drawer shown after "Add to Cart" (Overlays artboard · MINI CART).
export function MiniCart() {
  const { cart, drawerOpen, closeDrawer, isLoading } = useCart();
  const lines = cart.lines ?? [];

  return (
    <Dialog open={drawerOpen} onClose={closeDrawer} title={`Your Cart (${cart.count})`} side="right">
      {cart.count > 0 && (
        <p role="status" className="mx-5 mt-3.5 flex items-center gap-2.5 rounded-md bg-leaf-50 px-3 py-2.5 text-[13px] text-leaf-800">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <path d="M5 12l5 5 9-10" />
          </svg>
          Added to cart · Free shipping unlocked
        </p>
      )}
      <ul className="flex flex-1 flex-col px-5 py-2.5">
        {isLoading && !lines.length && <li className="py-6 text-sm text-ink-500">Loading your cart…</li>}
        {!isLoading && !lines.length && <li className="py-6 text-sm text-ink-500">Your cart is empty.</li>}
        {lines.map((l) => (
          <li key={l.sku} className="flex gap-3 border-b border-sand-400 py-3.5">
            {l.image && <img src={l.image.url} alt="" className="h-[78px] w-[72px] rounded-md object-cover" />}
            <span className="flex flex-1 flex-col gap-1.5">
              <Link to={`/solutions/${l.slug}`} onClick={closeDrawer} className="font-serif text-base text-cocoa-900 hover:text-gold-700">
                {l.name}
              </Link>
              <span className="text-[13px] text-ink-500">{l.inStock ? `Qty ${l.qty}` : "Out of stock"}</span>
            </span>
            <strong className="text-cocoa-900">{formatPaise(l.price * l.qty)}</strong>
          </li>
        ))}
      </ul>
      <div className="mt-auto flex flex-col gap-2.5 border-t border-sand-400 bg-cream-200 px-5 py-[18px]">
        <div className="flex justify-between text-[15px]">
          <span>Subtotal</span>
          <strong className="font-serif text-xl text-cocoa-900">{formatPaise(cart.subtotal)}</strong>
        </div>
        <span className="text-xs text-ink-500">Coupons and delivery are applied at checkout.</span>
        <Link to="/checkout" onClick={closeDrawer} aria-disabled={!cart.canCheckout || undefined} className={cn(buttonVariants({ variant: "green" }), "min-h-[52px] text-lg")}>
          Checkout
        </Link>
        <Link to="/cart" onClick={closeDrawer} className={cn(buttonVariants({ variant: "outline" }), "min-h-[46px]")}>
          View cart
        </Link>
      </div>
    </Dialog>
  );
}
