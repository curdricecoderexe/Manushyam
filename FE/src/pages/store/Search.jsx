import { Link, useSearchParams } from "react-router";
import { Seo } from "../../components/Seo";
import { SearchBox } from "../../components/search/SearchBox";
import { ProductGrid } from "../../components/product/ProductCard";
import { Button } from "../../components/ui/button";
import { useQuery, withQuery } from "../../lib/query";
import { SHOP_BY_CONCERN } from "../../data/content";

export default function SearchPage() {
  const [params] = useSearchParams();
  const q = (params.get("q") ?? "").trim().slice(0, 80);
  const { data, error, isLoading, refetch } = useQuery(q ? withQuery("/api/products", { q, limit: 24 }) : null);
  const settings = useQuery("/api/settings").data?.settings;
  const total = data?.total ?? 0;

  return (
    <>
      <Seo title={q ? `Search: ${q}` : "Search"} path="/search" noindex />
      <section className="border-b border-sand-400 bg-[linear-gradient(180deg,#FBF6EE_0%,#F4E8D6_100%)] px-4 pb-12 pt-12 text-center">
        <span className="eyebrow">Search</span>
        <h1 className="mb-6 mt-3 font-display text-[clamp(36px,4.4vw,56px)] leading-[1.05]">{q ? <>Results for “{q}”</> : "Find your therapy"}</h1>
        {/* key: a new ?q= from the header resets the box to that query. */}
        <SearchBox key={q} initialQuery={q} size="lg" autoFocus={!q} className="mx-auto max-w-[560px]" />
      </section>

      <div className="container-page pb-24 pt-10">
        {!q ? (
          <div>
            <h2 className="mb-5 text-2xl">Shop by concern</h2>
            <ul className="flex flex-wrap gap-2.5">
              {SHOP_BY_CONCERN.map((c) => (
                <li key={c.to}>
                  <Link to={c.to} className="inline-flex min-h-[44px] items-center rounded-md border border-sand-500 bg-cream-50 px-5 font-serif text-[15px] text-cocoa-900 hover:border-gold-600 hover:text-cocoa-900">
                    {c.title.replace("\n", " ")}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ) : error ? (
          <div className="rounded-lg border border-sand-400 bg-cream-50 p-8 text-center">
            <p className="mb-4">Search isn’t available right now.</p>
            <Button variant="outline" onClick={refetch}>
              Try again
            </Button>
          </div>
        ) : (
          <div className="flex flex-col gap-6">
            <p className="text-[15px] text-ink-500" aria-live="polite">
              {isLoading
                ? "Searching…"
                : total
                  ? `${total} ${total === 1 ? "product" : "products"}${data.match === "fuzzy" ? " — showing close matches" : ""}`
                  : null}
            </p>
            {!isLoading && total === 0 ? (
              <div className="flex flex-col items-center gap-4 rounded-lg border border-sand-400 bg-cream-50 p-10 text-center">
                <h2 className="text-2xl">Nothing found for “{q}”</h2>
                <p className="text-ink-500">Check the spelling or browse all therapies.</p>
                <Button as={Link} to="/solutions" variant="outline">
                  Browse all solutions
                </Button>
              </div>
            ) : (
              <ProductGrid products={data?.products ?? []} loading={isLoading} rating={settings?.rating} />
            )}
          </div>
        )}
      </div>
    </>
  );
}
