import { useState } from "react";
import { Link, useSearchParams } from "react-router";
import { SlidersHorizontal } from "lucide-react";
import { Seo } from "../../components/Seo";
import { Breadcrumbs } from "../../components/ui/Breadcrumbs";
import { Dialog } from "../../components/ui/Dialog";
import { Button, ArrowIcon } from "../../components/ui/button";
import { buttonVariants } from "../../components/ui/button-variants";
import { ProductGrid } from "../../components/product/ProductCard";
import { useQuery, withQuery } from "../../lib/query";
import { cn } from "../../lib/cn";
import { CONCERN_LABELS, SORT_OPTIONS, TYPE_LABELS } from "../../data/content";
import { useAppearance } from "../../lib/appearance";
import { breadcrumbJsonLd } from "../../lib/seo";

const CRUMBS = [{ label: "Home", to: "/" }, { label: "Solutions" }];

const PAGE_SIZE = 12;
const csv = (v) => (v ? v.split(",").filter(Boolean) : []);
const rupees = (v) => (/^\d{1,6}$/.test(v ?? "") ? Number(v) : undefined);

// URL → filter state. The URL is the single source of truth so filtered views can be shared.
function readFilters(params) {
  return {
    for: ["men", "women"].includes(params.get("for")) ? params.get("for") : "",
    type: csv(params.get("type")).filter((t) => t in TYPE_LABELS),
    concern: csv(params.get("concern")).filter((c) => c in CONCERN_LABELS),
    min: rupees(params.get("min")),
    max: rupees(params.get("max")),
    inStock: params.get("inStock") === "1",
    sort: SORT_OPTIONS.some(([v]) => v === params.get("sort")) ? params.get("sort") : "recommended",
    page: Math.max(1, Number.parseInt(params.get("page"), 10) || 1),
  };
}

function apiPath(f) {
  return withQuery("/api/products", {
    for: f.for,
    type: f.type,
    concern: f.concern,
    minPrice: f.min !== undefined ? f.min * 100 : undefined,
    maxPrice: f.max !== undefined ? f.max * 100 : undefined,
    inStock: f.inStock ? "true" : undefined,
    sort: f.sort === "recommended" ? undefined : f.sort,
    page: f.page > 1 ? f.page : undefined,
    limit: PAGE_SIZE,
  });
}

const CHIPS = [
  ["all", "All", (f) => !f.for && !f.type.length],
  ["men", "Men", (f) => f.for === "men" && !f.type.length],
  ["women", "Women", (f) => f.for === "women" && !f.type.length],
  ["combo", "Combos", (f) => !f.for && f.type.length === 1 && f.type[0] === "combo"],
];

function CheckboxGroup({ legend, options, selected, onToggle, first }) {
  return (
    <fieldset className={cn("flex flex-col gap-3", !first && "border-t border-sand-400 pt-[22px]")}>
      <legend className="mb-3 float-left w-full text-xs font-semibold uppercase tracking-[0.16em] text-cocoa-900">{legend}</legend>
      {Object.entries(options).map(([value, label]) => (
        <label key={value} className="flex min-h-[28px] cursor-pointer items-center gap-2.5 text-[15px]">
          <input type="checkbox" checked={selected.includes(value)} onChange={() => onToggle(value)} className="h-[18px] w-[18px] accent-brown-700" />
          {label}
        </label>
      ))}
    </fieldset>
  );
}

function PriceRange({ min, max, onApply }) {
  const submit = (e) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    onApply(form.get("min"), form.get("max"));
  };
  const input = "h-11 w-full min-w-0 rounded-md border border-sand-400 bg-white px-3 text-[15px] text-cocoa-900 focus:border-gold-600 focus:outline-none focus:ring-[3px] focus:ring-gold-500/20";
  return (
    <form onSubmit={submit} onBlur={(e) => !e.currentTarget.contains(e.relatedTarget) && e.currentTarget.requestSubmit()} className="flex flex-col gap-3 border-t border-sand-400 pt-[22px]" aria-label="Price range">
      <span className="text-xs font-semibold uppercase tracking-[0.16em] text-cocoa-900">Price (₹)</span>
      {/* key resets the inputs when the URL changes (e.g. "Clear all"). */}
      <div key={`${min}-${max}`} className="flex items-center gap-2.5">
        <label className="flex min-w-0 flex-1 flex-col gap-1.5 text-xs text-ink-500">
          Min
          <input name="min" inputMode="numeric" pattern="[0-9]*" defaultValue={min ?? ""} placeholder="0" className={input} />
        </label>
        <label className="flex min-w-0 flex-1 flex-col gap-1.5 text-xs text-ink-500">
          Max
          <input name="max" inputMode="numeric" pattern="[0-9]*" defaultValue={max ?? ""} placeholder="1,500" className={input} />
        </label>
      </div>
      <button type="submit" className="sr-only">
        Apply price
      </button>
    </form>
  );
}

function FilterPanel({ filters, update, clearAll, hasFilters, showHeading = true }) {
  const toggle = (key) => (value) => update({ [key]: filters[key].includes(value) ? filters[key].filter((v) => v !== value) : [...filters[key], value] });
  return (
    <div className="flex flex-col gap-[26px]">
      <div className={cn("flex items-center justify-between", !showHeading && !hasFilters && "hidden")}>
        {showHeading ? <h2 className="text-xl">Filters</h2> : <span />}
        {hasFilters && (
          <button type="button" onClick={clearAll} className="py-2 text-[13px] font-semibold text-gold-700">
            Clear all
          </button>
        )}
      </div>
      <CheckboxGroup first legend="Concern" options={CONCERN_LABELS} selected={filters.concern} onToggle={toggle("concern")} />
      <CheckboxGroup legend="Product type" options={TYPE_LABELS} selected={filters.type} onToggle={toggle("type")} />
      <PriceRange
        min={filters.min}
        max={filters.max}
        onApply={(min, max) => update({ min: rupees(String(min).replace(/[^\d]/g, "")), max: rupees(String(max).replace(/[^\d]/g, "")) })}
      />
      <label className="flex cursor-pointer items-center justify-between gap-2.5 border-t border-sand-400 pt-[22px] text-[15px]">
        In stock only
        <input type="checkbox" checked={filters.inStock} onChange={(e) => update({ inStock: e.target.checked })} className="h-[18px] w-[18px] accent-brown-700" />
      </label>
    </div>
  );
}

function Pagination({ page, pages, onPage }) {
  if (pages <= 1) return null;
  return (
    <nav aria-label="Pagination" className="flex items-center justify-center gap-2 pt-4">
      <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => onPage(page - 1)}>
        Previous
      </Button>
      <span className="px-3 text-sm text-ink-500">
        Page {page} of {pages}
      </span>
      <Button variant="outline" size="sm" disabled={page >= pages} onClick={() => onPage(page + 1)}>
        Next
      </Button>
    </nav>
  );
}

export default function Solutions() {
  const kit = useAppearance("solutionsKit");
  const [params, setParams] = useSearchParams();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const filters = readFilters(params);
  const { data, error, isLoading, refetch } = useQuery(apiPath(filters));
  const settings = useQuery("/api/settings").data?.settings;
  const hasFilters = Boolean(filters.for || filters.type.length || filters.concern.length || filters.min !== undefined || filters.max !== undefined || filters.inStock);

  // Any filter change goes back to page 1.
  const update = (patch, { resetPage = true } = {}) => {
    const next = { ...filters, ...patch, ...(resetPage ? { page: 1 } : {}) };
    const out = new URLSearchParams();
    if (next.for) out.set("for", next.for);
    if (next.type.length) out.set("type", next.type.join(","));
    if (next.concern.length) out.set("concern", next.concern.join(","));
    if (next.min !== undefined) out.set("min", String(next.min));
    if (next.max !== undefined) out.set("max", String(next.max));
    if (next.inStock) out.set("inStock", "1");
    if (next.sort !== "recommended") out.set("sort", next.sort);
    if (next.page > 1) out.set("page", String(next.page));
    setParams(out, { preventScrollReset: true });
  };
  const clearAll = () => update({ for: "", type: [], concern: [], min: undefined, max: undefined, inStock: false });
  const pickChip = (key) => update({ for: key === "men" || key === "women" ? key : "", type: key === "combo" ? ["combo"] : [] });

  const total = data?.total ?? 0;
  const title = filters.for === "men" ? "Solutions for Men" : filters.for === "women" ? "Solutions for Women" : "Solutions";

  return (
    <>
      <Seo title={title} description="Ayurvedic anti-hair-fall therapies for men, women and complete routines — crafted with the KASHAYAM process." path="/solutions" noindex={hasFilters} jsonLd={breadcrumbJsonLd(CRUMBS)} />

      <section className="border-b border-sand-400 bg-[linear-gradient(180deg,#FBF6EE_0%,#F4E8D6_100%)]">
        <div className="container-page pb-12 pt-7">
          <Breadcrumbs items={CRUMBS} />
          <div className="mt-7 flex flex-wrap items-end justify-between gap-6">
            <div className="flex max-w-[640px] flex-col gap-3.5">
              <span className="eyebrow">Shop for your concern</span>
              <h1 className="font-display text-[clamp(40px,5vw,64px)] leading-[1.05]">{title}</h1>
              <p className="text-[17px]">Ayurvedic therapies crafted with the 5000-year-old KASHAYAM process — for men, for women, and for complete routines.</p>
            </div>
            <div role="group" aria-label="Quick filter" className="flex flex-wrap gap-2.5">
              {CHIPS.map(([key, label, isOn]) => {
                const on = isOn(filters);
                return (
                  <button
                    key={key}
                    type="button"
                    aria-pressed={on}
                    onClick={() => pickChip(key)}
                    className={cn("min-h-[44px] rounded-md border px-5 font-serif text-[15px]", on ? "border-brown-700 bg-brown-700 text-white" : "border-sand-500 bg-cream-50 text-cocoa-900 hover:border-gold-600")}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      <div className="container-page flex items-start gap-8 pb-20 pt-10">
        <aside aria-label="Filters" className="sticky top-24 hidden w-[260px] shrink-0 rounded-lg border border-sand-400 bg-cream-200 p-6 lg:block">
          <FilterPanel filters={filters} update={update} clearAll={clearAll} hasFilters={hasFilters} />
        </aside>

        <section aria-label="Products" className="flex min-w-0 flex-1 flex-col gap-[22px]">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-[15px] text-ink-500" aria-live="polite">
              {isLoading ? (
                "Loading therapies…"
              ) : (
                <>
                  Showing <strong className="text-cocoa-900">{total}</strong> {total === 1 ? "therapy" : "therapies"}
                </>
              )}
            </p>
            <div className="flex items-center gap-3">
              <Button variant="outline" size="sm" className="font-sans lg:hidden" onClick={() => setDrawerOpen(true)}>
                <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />
                Filters{hasFilters ? " •" : ""}
              </Button>
              <label className="flex items-center gap-2.5 text-sm text-ink-500">
                Sort by
                <select
                  value={filters.sort}
                  onChange={(e) => update({ sort: e.target.value })}
                  className="h-11 rounded-md border border-sand-400 bg-white pl-3.5 pr-9 text-[15px] text-cocoa-900 focus:border-gold-600 focus:outline-none"
                >
                  {SORT_OPTIONS.map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </div>

          {error ? (
            <div className="rounded-lg border border-sand-400 bg-cream-50 p-8 text-center">
              <p className="mb-4">We couldn’t load the products. Please check your connection.</p>
              <Button variant="outline" onClick={refetch}>
                Try again
              </Button>
            </div>
          ) : !isLoading && total === 0 ? (
            <div className="flex flex-col items-center gap-4 rounded-lg border border-sand-400 bg-cream-50 p-10 text-center">
              <h2 className="text-2xl">No therapies match these filters</h2>
              <p className="text-ink-500">Try removing a filter or two.</p>
              <Button variant="outline" onClick={clearAll}>
                Clear all filters
              </Button>
            </div>
          ) : (
            <ProductGrid products={data?.products ?? []} loading={isLoading} rating={settings?.rating} skeletons={4} className="lg:grid-cols-[repeat(auto-fill,minmax(250px,1fr))]" />
          )}

          <Pagination page={filters.page} pages={data?.pages ?? 1} onPage={(p) => update({ page: p }, { resetPage: false })} />

          <div className="mt-3 grid overflow-hidden rounded-[14px] border border-[#C9A063]/50 bg-cocoa-950 text-ivory md:grid-cols-2">
            <div className="flex flex-col justify-center gap-3.5 p-9">
              <span className="text-xs font-semibold uppercase tracking-[0.18em] text-gold-400">Not sure where to start?</span>
              <h2 className="text-[30px] leading-[1.2] text-ivory">Complete Hair Fall Routine</h2>
              <p className="text-[15px] text-[#E9DEC9]">Cleanse, nourish and strengthen — the full ritual in one kit, with a free jute pouch.</p>
              <Link to="/solutions?type=combo" className={cn(buttonVariants({ variant: "gold", size: "md" }), "self-start text-sm")}>
                Explore combos
                <ArrowIcon />
              </Link>
            </div>
            <img src={kit.src} alt={kit.alt} loading="lazy" className="h-full min-h-[240px] w-full object-cover" />
          </div>
        </section>
      </div>

      <Dialog open={drawerOpen} onClose={() => setDrawerOpen(false)} title="Filters" side="left">
        <div className="flex flex-1 flex-col gap-6 p-5">
          <FilterPanel filters={filters} update={update} clearAll={clearAll} hasFilters={hasFilters} showHeading={false} />
          <Button className="mt-auto" onClick={() => setDrawerOpen(false)}>
            Show {total} {total === 1 ? "result" : "results"}
          </Button>
        </div>
      </Dialog>
    </>
  );
}
