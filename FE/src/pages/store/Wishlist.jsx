import { useState } from "react";
import { Link } from "react-router";
import { Seo } from "../../components/Seo";
import { Skeleton } from "../../components/ui/primitives";
import { Button } from "../../components/ui/button";
import { buttonVariants } from "../../components/ui/button-variants";
import { PathIcon } from "../../components/ui/icons";
import { ICONS } from "../../components/ui/icon-paths";
import { useWishlist } from "../../wishlist/context";
import { useCart } from "../../cart/context";
import { useToast } from "../../toast/context";
import { cn, formatPaise } from "../../lib/cn";

function WishlistCard({ product }) {
  const wishlist = useWishlist();
  const { addItem } = useCart();
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);

  const run = async (fn, done) => {
    setBusy(true);
    try {
      await fn();
      if (done) toast(done);
    } catch (err) {
      toast({ message: err.message, tone: "error" });
      setBusy(false);
    }
  };

  return (
    <li className="flex flex-col overflow-hidden rounded-lg border border-sand-400 bg-cream-50" aria-busy={busy || undefined}>
      <div className="relative">
        <Link to={`/solutions/${product.slug}`} tabIndex={-1} aria-hidden="true">
          {product.image && <img src={product.image.url} alt="" className="aspect-square w-full object-cover" />}
        </Link>
        <button
          type="button"
          disabled={busy}
          onClick={() => run(() => wishlist.remove(product.slug), { message: `Removed ${product.name} from your wishlist.`, tone: "info" })}
          aria-label={`Remove ${product.name} from wishlist`}
          className="absolute right-3 top-3 flex h-10 w-10 items-center justify-center rounded-full bg-cream-50 shadow-sm"
        >
          <PathIcon d={ICONS.heart} size={18} strokeWidth={1.6} fill="#7A3A12" className="text-brown-700" />
        </button>
      </div>
      <div className="flex flex-1 flex-col gap-2 px-[18px] pb-5 pt-4">
        <h2 className="text-[19px]">
          <Link to={`/solutions/${product.slug}`} className="text-cocoa-900 hover:text-gold-700">
            {product.name}
          </Link>
        </h2>
        <span className="font-serif text-[19px] font-bold text-cocoa-900">{formatPaise(product.price)}</span>
        <span className={cn("text-[13px]", !product.inStock || product.lowStock ? "text-danger-600" : "text-leaf-800")}>
          {!product.inStock ? "Out of stock" : product.lowStock ? `Only ${product.lowStock} left` : "In stock"}
        </span>
        <button
          type="button"
          disabled={busy || !product.inStock}
          onClick={() =>
            run(async () => {
              await addItem({ sku: product.defaultSku, openDrawer: false });
              await wishlist.remove(product.slug);
            }, { message: `Moved ${product.name} to your cart.`, action: { label: "View cart", to: "/cart" } })
          }
          className={cn(buttonVariants({ variant: "brown" }), "mt-auto min-h-[46px]")}
        >
          Move to cart
        </button>
      </div>
    </li>
  );
}

export default function Wishlist() {
  const { products, isLoading, error } = useWishlist();
  return (
    <>
      <Seo title="Wishlist" path="/wishlist" noindex />
      <div className="container-page pb-24 pt-9">
        <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-[clamp(34px,3.6vw,48px)]">Wishlist</h1>
            <p className="mt-1.5 text-[15px] text-ink-500">
              {products.length} saved {products.length === 1 ? "therapy" : "therapies"} · synced to your account
            </p>
          </div>
          <Link to="/solutions" className="text-[15px]">
            Continue shopping →
          </Link>
        </div>

        {error ? (
          <div className="rounded-lg border border-sand-400 bg-cream-50 p-8 text-center">
            <p className="mb-4">We couldn’t load your wishlist.</p>
            <Button variant="outline" onClick={() => window.location.reload()}>
              Reload
            </Button>
          </div>
        ) : isLoading ? (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3" aria-busy="true" aria-label="Loading your wishlist">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="aspect-[3/4]" />
            ))}
          </div>
        ) : products.length ? (
          <ul className="grid gap-6 sm:grid-cols-2 lg:grid-cols-[repeat(auto-fill,minmax(260px,1fr))]">
            {products.map((p) => (
              <WishlistCard key={p.slug} product={p} />
            ))}
          </ul>
        ) : (
          <section className="flex flex-col items-center gap-3.5 rounded-[16px] border border-sand-400 bg-cream-50 px-6 py-16 text-center">
            <span className="flex h-[84px] w-[84px] items-center justify-center rounded-full border border-sand-500 bg-cream-200 text-gold-600">
              <PathIcon d={ICONS.heart} size={36} strokeWidth={1.3} />
            </span>
            <h2 className="text-[26px]">Nothing saved yet</h2>
            <p className="text-[15px]">Tap the heart on any therapy to keep it here.</p>
            <Link to="/solutions" className={buttonVariants({ variant: "brown" })}>
              Explore solutions
            </Link>
          </section>
        )}
      </div>
    </>
  );
}
