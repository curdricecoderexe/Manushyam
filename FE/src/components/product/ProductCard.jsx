import { Link } from "react-router";
import { cn, formatPaise } from "../../lib/cn";
import { AUDIENCE_LABELS } from "../../data/content";
import { Skeleton, Star } from "../ui/primitives";
import { AddToCartButton } from "./AddToCartButton";
import { WishlistButton } from "./WishlistButton";
import { responsiveImage } from "../../lib/images";

function CardBadge({ children }) {
  return (
    <span className="absolute left-3 top-3 rounded-sm border border-sand-500 bg-cream-50 px-2 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-cocoa-900">
      {children}
    </span>
  );
}

function CardImage({ product, aspect, eager }) {
  return (
    <Link to={`/solutions/${product.slug}`} className={cn("relative block overflow-hidden bg-[#F4EADB]", aspect)} tabIndex={-1} aria-hidden="true">
      {product.image && (
        <img
          {...responsiveImage(product.image.url, "card", "(min-width: 1024px) 25vw, (min-width: 640px) 50vw, 100vw")}
          alt=""
          loading={eager ? "eager" : "lazy"}
          className="h-full w-full object-cover transition-transform duration-500 ease-brand group-hover/card:scale-[1.03]"
        />
      )}
      {product.badges?.[0] && <CardBadge>{product.badges[0]}</CardBadge>}
    </Link>
  );
}

// Listing card (Solutions page): audience label, description, rating line, price + Add to Cart row.
// `compact` is the centred card used on Home and in "You May Also Like" (getdesign.md §7.4).
export function ProductCard({ product, variant = "listing", rating, eager = false, as: Comp = "article" }) {
  const audience = AUDIENCE_LABELS[product.audience] + (product.type === "combo" ? " · Combo" : "");
  const base = "group/card flex h-full flex-col overflow-hidden rounded-lg border border-sand-400 bg-cream-50 shadow-sm transition-[transform,border-color] duration-200 ease-brand hover:-translate-y-0.5 hover:border-gold-500";

  if (variant === "compact") {
    return (
      <Comp className={cn(base, "bg-white")}>
        <CardImage product={product} aspect="aspect-[4/3]" eager={eager} />
        <div className="flex flex-1 flex-col items-center gap-2 px-4 pb-5 pt-4 text-center">
          <h3 className="text-lg leading-snug">
            <Link to={`/solutions/${product.slug}`} className="text-cocoa-900 hover:text-gold-700">
              {product.name}
            </Link>
          </h3>
          <span className="mt-auto font-serif text-lg font-bold text-cocoa-900">{formatPaise(product.price)}</span>
          <AddToCartButton product={product} className="mt-1 min-h-[40px] px-6 text-[15px]" />
        </div>
      </Comp>
    );
  }

  return (
    <Comp className={cn(base, "relative")}>
      <CardImage product={product} aspect="aspect-[1/1.05]" eager={eager} />
      <WishlistButton slug={product.slug} name={product.name} className="absolute right-3 top-3" />
      <div className="flex flex-1 flex-col gap-2 px-[18px] pb-[22px] pt-4">
        <span className="text-xs font-semibold uppercase tracking-[0.14em] text-gold-700">{audience}</span>
        <h3 className="text-[19px] leading-snug">
          <Link to={`/solutions/${product.slug}`} className="text-cocoa-900 hover:text-gold-700">
            {product.name}
          </Link>
        </h3>
        <p className="text-sm leading-normal text-ink-500">{product.summary}</p>
        {rating && (
          <span className="flex items-center gap-1.5 text-[13px] text-ink-700">
            <Star className="h-3.5 w-3.5" />
            {rating.value} {rating.source}
          </span>
        )}
        <div className="mt-auto flex flex-wrap items-center justify-between gap-3 pt-2.5">
          <span className="font-serif text-[21px] font-bold text-cocoa-900">{formatPaise(product.price)}</span>
          <AddToCartButton product={product} showIcon className="min-h-[44px] px-[18px] text-[15px]" />
        </div>
      </div>
    </Comp>
  );
}

export function ProductCardSkeleton() {
  return (
    <div className="flex flex-col overflow-hidden rounded-lg border border-sand-400 bg-cream-50" aria-hidden="true">
      <Skeleton className="aspect-[1/1.05] rounded-none" />
      <div className="flex flex-col gap-3 p-[18px]">
        <Skeleton className="h-3 w-20" />
        <Skeleton className="h-5 w-3/4" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="mt-3 h-11 w-full" />
      </div>
    </div>
  );
}

export function ProductGrid({ products, loading, skeletons = 4, rating, variant, className }) {
  return (
    <ul className={cn("grid grid-cols-1 gap-6 min-[480px]:grid-cols-2 lg:grid-cols-[repeat(auto-fill,minmax(250px,1fr))]", className)} aria-busy={loading || undefined}>
      {loading
        ? Array.from({ length: skeletons }, (_, i) => (
            <li key={i}>
              <ProductCardSkeleton />
            </li>
          ))
        : products.map((p, i) => (
            <li key={p.id ?? p.slug}>
              <ProductCard product={p} rating={rating} variant={variant} eager={i < 2} as="article" />
            </li>
          ))}
    </ul>
  );
}
