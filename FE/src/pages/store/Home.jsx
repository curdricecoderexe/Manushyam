import { Link } from "react-router";
import { Seo } from "../../components/Seo";
import { siteJsonLd } from "../../lib/seo";
import { CONTACT } from "../../data/site";
import { HeroCarousel } from "../../components/home/HeroCarousel";
import { ProductGrid } from "../../components/product/ProductCard";
import { AddToCartButton } from "../../components/product/AddToCartButton";
import { SectionTitle, LineLabel } from "../../components/ui/ornaments";
import { Badge, Skeleton, Star } from "../../components/ui/primitives";
import { PathIcon } from "../../components/ui/icons";
import { buttonVariants } from "../../components/ui/button-variants";
import { ArrowIcon } from "../../components/ui/button";
import { useQuery } from "../../lib/query";
import { cn, formatPaise } from "../../lib/cn";
import { HOME_FEATURES, RITUAL_STEPS, TESTIMONIAL } from "../../data/content";
import { useAppearance } from "../../lib/appearance";


function BestsellerCard({ product, rating }) {
  const packShot = useAppearance("homeBestseller");
  if (!product) return <Skeleton className="h-[380px] rounded-lg" />;
  return (
    <div className="grid overflow-hidden rounded-lg border border-sand-400 bg-cream-200 shadow-lg md:grid-cols-2">
      <img src={packShot.src} alt={packShot.alt} className="h-full min-h-[300px] w-full object-cover md:min-h-[380px]" />
      <div className="flex flex-col justify-center gap-[18px] p-8 lg:p-14">
        <Badge className="self-start">{product.badges[0] || "Bestseller"}</Badge>
        <h2 className="text-[clamp(30px,3vw,42px)] leading-[1.15]">{product.name}</h2>
        <p className="max-w-[420px] text-[17px]">{product.summary}. {product.tagline}.</p>
        <div className="flex flex-wrap items-center gap-3.5">
          <span className="font-serif text-[30px] text-cocoa-900">{formatPaise(product.price)}</span>
          {rating && (
            <span className="flex items-center gap-1.5 text-sm text-ink-700">
              <Star />
              {rating.value} · {rating.source}
            </span>
          )}
        </div>
        <div className="mt-1.5 flex flex-wrap items-center gap-3.5">
          <AddToCartButton product={product} size="md" showIcon className="text-[17px]" />
          <Link to={`/solutions/${product.slug}`} className={cn(buttonVariants({ variant: "arrow" }), "px-1 py-3 text-[15px]")}>
            Shop Now
            <ArrowIcon />
          </Link>
        </div>
      </div>
    </div>
  );
}

export default function Home() {
  const ritual = useAppearance("homeRitual");
  const content = useQuery("/api/content/home");
  // Same path as the header's Solutions menu (shared cache entry).
  const catalogue = useQuery("/api/products?limit=8");
  const settings = content.data?.settings;
  const products = catalogue.data?.products ?? [];
  const bestseller = products.find((p) => p.badges.includes("Bestseller")) ?? products[0];

  return (
    <>
      <Seo
        description="Ayurvedic anti-hair-fall therapy for men and women, crafted with the 5000-year-old KASHAYAM process. Free shipping, COD available."
        path="/"
        jsonLd={siteJsonLd({ email: CONTACT.careEmail, phone: `+${CONTACT.whatsapp}` })}
      />

      {content.data ? (
        <HeroCarousel slides={content.data.slides} subline={settings?.heroSubline} />
      ) : (
        <section className="bg-cocoa-950 px-4 pb-[140px] pt-6 md:px-6" aria-label="Featured">
          <div className="mx-auto flex min-h-[600px] max-w-[1320px] items-center rounded-xl border border-[#C9A063]/55 bg-grad-hero px-10">
            {/* Keep an h1 on the page even before the slides arrive. */}
            <h1 className="whitespace-pre-line font-display text-display-xl text-ivory">{"Rooted in\nRitual."}</h1>
          </div>
        </section>
      )}

      <section className="container-page relative z-[2] -mt-[110px]">
        <BestsellerCard product={bestseller} rating={settings?.rating} />
      </section>

      <section aria-label="Why it works" className="container-page mt-8">
        <ul className="grid grid-cols-2 rounded-lg border border-sand-400 bg-cream-200 px-2 py-7 lg:grid-cols-4">
          {HOME_FEATURES.map((f, i) => (
            <li key={f.title} className={cn("flex flex-col items-center gap-2.5 px-4 py-2 text-center", i < HOME_FEATURES.length - 1 && "lg:border-r lg:border-sand-400", i % 2 === 0 && "max-lg:border-r max-lg:border-sand-400")}>
              <span className="flex h-16 w-16 items-center justify-center rounded-full border border-sand-500 bg-cream-100 text-gold-600">
                <PathIcon d={f.icon} size={28} />
              </span>
              <span className="text-base font-medium text-cocoa-900">{f.title}</span>
              <span className="text-sm text-ink-500">{f.sub}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="container-page pb-6 pt-24" aria-labelledby="shop-title">
        <SectionTitle subtitle="A KASHAYAM ritual for every head of hair." className="mb-10">
          <span id="shop-title">Shop the Therapy</span>
        </SectionTitle>
        {catalogue.error ? (
          <p className="text-center text-ink-500">
            We couldn’t load the products just now.{" "}
            <button type="button" onClick={catalogue.refetch} className="font-semibold text-gold-700 underline">
              Try again
            </button>
          </p>
        ) : (
          <ProductGrid products={products.slice(0, 4)} loading={catalogue.isLoading} variant="compact" />
        )}
      </section>

      <section className="container-page pt-[72px]">
        <div className="grid overflow-hidden rounded-lg border border-sand-400 bg-cream-200 md:grid-cols-2">
          <img src={ritual.src} alt={ritual.alt} loading="lazy" className="h-full min-h-[300px] w-full object-cover" />
          <div className="flex flex-col justify-center gap-4 p-8 lg:p-14">
            <span className="eyebrow">Our Philosophy</span>
            <h2 className="text-[clamp(30px,3vw,40px)] leading-[1.15]">Conscious. Creative. Caring.</h2>
            <p className="max-w-[460px] text-[17px]">We source ethically, blend mindfully and create therapies that honour your hair, your wellbeing and our planet.</p>
            <Link to="/about" className={cn(buttonVariants({ variant: "link" }), "gap-3.5 self-start text-[15px]")}>
              Learn More
              <ArrowIcon />
            </Link>
          </div>
        </div>
      </section>

      <section aria-labelledby="ritual-title" className="container-page pt-8">
        <div className="rounded-lg border border-sand-400 bg-cream-200 px-5 pb-9 pt-8 lg:px-12">
          <LineLabel className="mb-7">
            <span id="ritual-title">The ManushyaM Ritual</span>
          </LineLabel>
          <ol className="grid gap-6 md:grid-cols-3">
            {RITUAL_STEPS.map((r) => (
              <li key={r.n} className="flex items-center gap-[18px]">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-gold-600 font-serif text-base text-gold-700">{r.n}</span>
                <PathIcon d={r.icon} size={54} viewBox="0 0 48 48" strokeWidth={1.3} className="text-cocoa-900" />
                <div className="flex flex-col gap-1.5">
                  <span className="text-[15px] font-semibold uppercase tracking-[0.14em] text-cocoa-900">{r.title}</span>
                  <span className="text-sm leading-normal text-ink-700">{r.sub}</span>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section aria-label="Customer review" className="container-page pb-24 pt-8">
        <figure className="flex flex-wrap items-center justify-between gap-6 rounded-lg border border-sand-400 bg-cream-200 px-5 py-7 lg:px-12">
          <div className="flex flex-[1_1_520px] items-start gap-[22px]">
            <span aria-hidden="true" className="font-display text-[96px] leading-[0.8] text-gold-600">
              “
            </span>
            <blockquote className="font-serif text-[clamp(18px,1.7vw,22px)] leading-normal text-cocoa-900">{TESTIMONIAL.quote}</blockquote>
          </div>
          <figcaption className="flex flex-col gap-1.5">
            <span className="flex gap-[3px]" role="img" aria-label="Rated 5 out of 5">
              {Array.from({ length: 5 }, (_, i) => (
                <Star key={i} className="h-5 w-5" />
              ))}
            </span>
            <span className="text-sm font-semibold uppercase tracking-[0.16em] text-cocoa-900">{TESTIMONIAL.name}</span>
            <span className="text-[13px] text-ink-500">Verified Customer</span>
          </figcaption>
        </figure>
      </section>
    </>
  );
}
