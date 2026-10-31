import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { Seo } from "../../components/Seo";
import { Breadcrumbs } from "../../components/ui/Breadcrumbs";
import { Tabs } from "../../components/ui/Tabs";
import { Accordion } from "../../components/ui/Accordion";
import { SectionTitle } from "../../components/ui/ornaments";
import { QuantityStepper, RatingBadge, Skeleton } from "../../components/ui/primitives";
import { PathIcon } from "../../components/ui/icons";
import { ICONS } from "../../components/ui/icon-paths";
import { buttonVariants } from "../../components/ui/button-variants";
import { Button } from "../../components/ui/button";
import { ProductGallery } from "../../components/product/ProductGallery";
import { ProductCarousel } from "../../components/product/ProductCarousel";
import { useCart } from "../../cart/context";
import { useToast } from "../../toast/context";
import { DeliveryCheck } from "../../components/product/DeliveryCheck";
import { ProductReviews } from "../../components/reviews/ProductReviews";
import { Stars } from "../../components/reviews/Stars";
import { WishlistButton } from "../../components/product/WishlistButton";
import { useQuery, withQuery } from "../../lib/query";
import { useMediaQuery } from "../../hooks/useMediaQuery";
import { getRecentlyViewed, recordView } from "../../lib/recentlyViewed";
import { APP_URL, absoluteUrl, breadcrumbJsonLd } from "../../lib/seo";
import { cn, formatPaise } from "../../lib/cn";
import { AUDIENCE_LABELS, FREE_FROM_LABELS, PRODUCT_TRUST } from "../../data/content";
import NotFound from "../NotFound";

function LeafList({ items, className }) {
  return (
    <ul className={cn("flex flex-col gap-2.5 text-[15px]", className)}>
      {items.map((b) => (
        <li key={b} className="flex items-center gap-3">
          <PathIcon d={ICONS.leafSprig} size={18} strokeWidth={1.5} className="text-gold-600" />
          {b}
        </li>
      ))}
    </ul>
  );
}

function FreeFromGrid({ flags }) {
  if (!flags.length) return null;
  return (
    <ul className="grid grid-cols-2 content-start gap-x-2.5 gap-y-[18px] rounded-lg border border-sand-400 bg-cream-100 p-5 sm:grid-cols-3" aria-label="Free from">
      {flags.map((f) => (
        <li key={f} className="flex items-center gap-2.5 text-[13px] leading-tight text-cocoa-900">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-sand-500 bg-cream-50 text-leaf-800">
            <PathIcon d={ICONS.leafSprig} size={20} strokeWidth={1.5} />
          </span>
          {FREE_FROM_LABELS[f]}
        </li>
      ))}
    </ul>
  );
}

function infoSections(product) {
  const prose = (paras) => (
    <div className="flex flex-col gap-3.5 text-base leading-relaxed">
      {paras.map((p) => (
        <p key={p}>{p}</p>
      ))}
    </div>
  );
  const ing = product.ingredients;
  return [
    {
      id: "description",
      label: "Description",
      content: (
        <div className="flex flex-wrap gap-8">
          <div className="flex flex-[1_1_420px] flex-col gap-3.5">
            <h2 className="text-[22px]">About this therapy</h2>
            {prose(product.description)}
          </div>
          <div className="flex-[1_1_320px]">
            <FreeFromGrid flags={product.freeFrom} />
          </div>
        </div>
      ),
    },
    { id: "benefits", label: "Benefits", content: <LeafList items={product.benefits} /> },
    {
      id: "ingredients",
      label: "Ingredients",
      content: (
        <dl className="grid gap-5 sm:grid-cols-3">
          {[
            ["Powerful extracts", ing.extracts],
            ["Nourishing oils", ing.oils],
            ["Key support ingredients", ing.support],
          ]
            .filter(([, list]) => list?.length)
            .map(([title, list]) => (
              <div key={title} className="flex flex-col gap-2">
                <dt className="font-serif text-lg text-cocoa-900">{title}</dt>
                <dd className="text-[15px] leading-relaxed">{list.join(", ")}</dd>
              </div>
            ))}
        </dl>
      ),
    },
    {
      id: "how-to-use",
      label: "How to Use",
      content: (
        <ol className="flex flex-col gap-3 text-base leading-relaxed">
          {product.howToUse.map((step, i) => (
            <li key={step} className="flex gap-3">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-gold-600 font-serif text-gold-700">{i + 1}</span>
              <span className="pt-1">{step}</span>
            </li>
          ))}
        </ol>
      ),
    },
    {
      id: "shipping",
      label: "Shipping & COD",
      content: prose(["Free shipping on all orders, shipped via Shiprocket within 24 hours.", "Cash on Delivery available on serviceable PIN codes.", "GST invoice included with every order."]),
    },
    product.faqs.length && {
      id: "faq",
      label: "FAQ",
      content: (
        <dl className="flex flex-col gap-4">
          {product.faqs.map((f) => (
            <div key={f.q}>
              <dt className="font-serif text-lg text-cocoa-900">{f.q}</dt>
              <dd className="text-[15px] leading-relaxed">{f.a}</dd>
            </div>
          ))}
        </dl>
      ),
    },
  ].filter(Boolean);
}

function productJsonLd(product) {
  return {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.name,
    description: product.seo.description,
    image: product.images.map((i) => absoluteUrl(i.url)),
    sku: product.defaultSku,
    brand: { "@type": "Brand", name: "ManushyaM" },
    offers: product.variants.map((v) => ({
      "@type": "Offer",
      sku: v.sku,
      price: (v.price / 100).toFixed(2),
      priceCurrency: "INR",
      availability: v.inStock ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
      url: `${APP_URL}/solutions/${product.slug}`,
    })),
    // Only our own verified reviews count here (never the marketplace rating).
    ...(product.rating?.count > 0 ? { aggregateRating: { "@type": "AggregateRating", ratingValue: product.rating.average, reviewCount: product.rating.count, bestRating: 5, worstRating: 1 } } : {}),
  };
}

function ProductSkeleton() {
  return (
    <div className="container-page grid gap-10 pt-16 md:grid-cols-2" aria-busy="true" aria-label="Loading product">
      <Skeleton className="aspect-[1/1.1]" />
      <div className="flex flex-col gap-4">
        <Skeleton className="h-10 w-3/4" />
        <Skeleton className="h-10 w-32" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-14 w-full" />
      </div>
    </div>
  );
}

function RecentlyViewed({ currentSlug }) {
  const [slugs] = useState(() => getRecentlyViewed().filter((s) => s !== currentSlug).slice(0, 4));
  const { data } = useQuery(slugs.length ? withQuery("/api/products", { slugs }) : null);
  // Copy before sorting: `data` is the shared query cache.
  const items = [...(data?.products ?? [])].sort((a, b) => slugs.indexOf(a.slug) - slugs.indexOf(b.slug));
  if (!items.length) return null;
  return (
    <section aria-labelledby="recent-title" className="pb-24">
      <h2 id="recent-title" className="mb-6 text-2xl">
        Recently Viewed
      </h2>
      <ProductCarousel products={items} label="Recently viewed" />
    </section>
  );
}

export default function ProductDetail() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const { addItem } = useCart();
  const { toast } = useToast();
  const isPhone = useMediaQuery("(max-width: 767px)");
  const { data, error, isLoading } = useQuery(`/api/products/${encodeURIComponent(slug)}`);
  const settings = useQuery("/api/settings").data?.settings;
  const [qtyBySlug, setQtyBySlug] = useState({});
  const [tab, setTab] = useState("description");
  const [openSection, setOpenSection] = useState("description");
  const [added, setAdded] = useState(false);

  useEffect(() => {
    if (data?.product) recordView(data.product.slug);
  }, [data?.product]);

  useEffect(() => {
    if (!added) return undefined;
    const t = setTimeout(() => setAdded(false), 2000);
    return () => clearTimeout(t);
  }, [added]);

  if (error?.status === 404) return <NotFound />;
  if (error && !data) {
    return (
      <div className="container-page flex flex-col items-center gap-4 py-24 text-center">
        <h1 className="text-3xl">We couldn’t load this product</h1>
        <p className="text-ink-500">Please check your connection and try again.</p>
        <Button variant="outline" onClick={() => window.location.reload()}>
          Reload
        </Button>
      </div>
    );
  }
  if (isLoading || !data) return <ProductSkeleton />;

  const { product, related } = data;
  const qty = qtyBySlug[product.slug] ?? 1;
  const setQty = (q) => setQtyBySlug((m) => ({ ...m, [product.slug]: q }));
  const sku = product.defaultSku;
  const crumbs = [{ label: "Home", to: "/" }, { label: "Solutions", to: "/solutions" }, { label: product.name }];
  const sections = infoSections(product);
  const canBuy = product.inStock;

  const add = async () => {
    try {
      await addItem({ sku, qty });
      setAdded(true);
    } catch (err) {
      toast({ message: err.message, tone: "error" });
    }
  };
  const buyNow = async () => {
    try {
      await addItem({ sku, qty, openDrawer: false });
      navigate("/checkout");
    } catch (err) {
      toast({ message: err.message, tone: "error" });
    }
  };

  return (
    <div className="bg-cream-50 pb-24 md:pb-0">
      <Seo title={product.seo.title} description={product.seo.description} path={`/solutions/${product.slug}`} image={product.image?.url} type="product" jsonLd={[productJsonLd(product), breadcrumbJsonLd(crumbs)]} />

      <div className="container-page pt-6">
        <Breadcrumbs items={crumbs} />

        <div className="mt-6 grid items-start gap-10 md:grid-cols-[55fr_45fr]">
          <ProductGallery images={product.images} name={product.name} badge={product.badges[0]} />

          <section aria-label="Purchase" className="flex flex-col gap-[18px]">
            <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-gold-700 md:hidden">
              {AUDIENCE_LABELS[product.audience]}
              {product.badges[0] ? ` · ${product.badges[0]}` : ""}
            </span>
            <h1 className="text-[clamp(30px,3.2vw,44px)] leading-[1.12]">{product.name}</h1>
            <div className="flex flex-wrap items-baseline gap-3">
              <span className="font-serif text-[clamp(30px,3vw,38px)] font-bold text-brown-700">{formatPaise(product.price)}</span>
              {product.mrp > product.price && <s className="text-ink-500">{formatPaise(product.mrp)}</s>}
              <span className="text-[13px] text-ink-500">Inclusive of all taxes</span>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              {settings?.rating && <RatingBadge rating={settings.rating.value} source={settings.rating.source} />}
              {product.rating?.count > 0 && (
                <a href="#reviews" className="flex items-center gap-1.5 text-sm text-cocoa-900 hover:text-gold-700">
                  <Stars value={product.rating.average} />
                  {product.rating.average.toFixed(1)} · {product.rating.count} verified {product.rating.count === 1 ? "review" : "reviews"}
                </a>
              )}
            </div>
            {product.description[0] && <p className="text-[17px]">{product.description[0]}</p>}
            <LeafList items={product.benefits} />
            <div className="h-px bg-sand-400" />

            <div className="hidden flex-wrap items-center gap-4 md:flex">
              <span className="font-serif text-[17px] text-cocoa-900">Quantity:</span>
              <QuantityStepper value={qty} onChange={setQty} />
              <StockNote inStock={canBuy} />
            </div>
            <div className="hidden grid-cols-2 gap-3.5 md:grid">
              <button type="button" disabled={!canBuy} onClick={add} className={cn(buttonVariants({ variant: "brown", size: "lg" }), "min-h-14 text-[19px]")}>
                <PathIcon d={ICONS.bag} size={22} strokeWidth={1.6} />
                <span aria-live="polite">{added ? "Added to cart ✓" : "Add to Cart"}</span>
              </button>
              <button type="button" disabled={!canBuy} onClick={buyNow} className={cn(buttonVariants({ variant: "green", size: "lg" }), "min-h-14 text-[19px]")}>
                <PathIcon d={ICONS.bolt} size={20} fill="#C9944A" strokeWidth={0} />
                Buy Now
              </button>
            </div>
            <div className="md:hidden">
              <StockNote inStock={canBuy} />
            </div>
            {canBuy && <DeliveryCheck subtotal={product.price * qty} />}
            <WishlistButton slug={product.slug} name={product.name} variant="text" className="self-start" />

            <ul className="grid grid-cols-4 text-center text-[13px] text-cocoa-900 max-sm:text-[11px]">
              {PRODUCT_TRUST.map((t, i) => (
                <li key={t.label} className={cn("flex flex-col items-center gap-2 p-1.5 leading-snug", i < PRODUCT_TRUST.length - 1 && "border-r border-sand-400")}>
                  <PathIcon d={t.icon} size={30} className="text-gold-600" />
                  {t.label}
                </li>
              ))}
            </ul>
            {settings?.trustedBy && (
              <p className="flex items-center justify-center gap-2 text-sm text-ink-700">
                <PathIcon d={ICONS.shieldCheck} size={20} strokeWidth={1.6} className="text-leaf-800" />
                {settings.trustedBy}
              </p>
            )}
          </section>
        </div>

        <section aria-label="Product details" className="mt-14 md:rounded-lg md:border md:border-sand-400 md:bg-cream-50 md:px-7 md:pb-8 md:pt-2 max-md:-mx-4">
          {isPhone ? (
            <Accordion
              variant="flush"
              headingLevel={2}
              openId={openSection}
              onToggle={setOpenSection}
              items={sections.map((s) => ({ id: s.id, title: s.label, content: s.content }))}
            />
          ) : (
            <Tabs label="Product information" tabs={sections} value={tab} onChange={setTab} />
          )}
        </section>

        <ProductReviews slug={product.slug} />

        {related.length > 0 && (
          <section aria-labelledby="also-title" className="pb-16 pt-[72px] md:pb-24">
            <SectionTitle className="mb-8">
              <span id="also-title">You May Also Like</span>
            </SectionTitle>
            <ProductCarousel products={related} label="You may also like" />
          </section>
        )}

        <RecentlyViewed key={product.slug} currentSlug={product.slug} />
      </div>

      {/* Phone: sticky buy bar (getdesign.md §8.4). */}
      <div className="fixed inset-x-0 bottom-0 z-30 flex items-center gap-2.5 border-t border-sand-400 bg-cream-50 px-3 pb-5 pt-2.5 shadow-[0_-8px_24px_rgba(74,44,12,.08)] md:hidden">
        <QuantityStepper value={qty} onChange={setQty} size="sm" />
        <button type="button" disabled={!canBuy} onClick={add} className={cn(buttonVariants({ variant: "brown" }), "min-h-[52px] flex-1 px-2")}>
          {added ? "Added ✓" : "Add to Cart"}
        </button>
        <button type="button" disabled={!canBuy} onClick={buyNow} className={cn(buttonVariants({ variant: "green" }), "min-h-[52px] flex-1 px-2")}>
          Buy Now
        </button>
      </div>
    </div>
  );
}

function StockNote({ inStock }) {
  return inStock ? (
    <span className="flex items-center gap-1.5 text-[13px] text-leaf-800">
      <span className="h-2 w-2 rounded-full bg-leaf-800" aria-hidden="true" />
      In stock — ships in 24 hours
    </span>
  ) : (
    <span className="text-[13px] font-medium text-danger-600">Out of stock</span>
  );
}
