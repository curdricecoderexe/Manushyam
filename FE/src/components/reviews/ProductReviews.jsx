import { useEffect, useState } from "react";
import { Link } from "react-router";
import { Skeleton } from "../ui/primitives";
import { Button } from "../ui/button";
import { Stars } from "./Stars";
import { api } from "../../lib/api";
import { formatDate } from "../../lib/orders";
import { cn } from "../../lib/cn";

// Product page reviews: summary with a rating breakdown, sortable list, "load more".
// Only verified buyers can review — from their delivered order.
export function ProductReviews({ slug }) {
  const [sort, setSort] = useState("newest");
  const [state, setState] = useState({ slug: null, sort: null, summary: null, reviews: [], page: 1, pages: 1 });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api(`/api/products/${slug}/reviews?sort=${sort}`, { auth: false })
      .then((d) => !cancelled && setState({ slug, sort, summary: d.summary, reviews: d.reviews, page: d.page, pages: d.pages }))
      .catch((err) => !cancelled && setError(err.message));
    return () => {
      cancelled = true;
    };
  }, [slug, sort]);

  async function loadMore() {
    setBusy(true);
    try {
      const d = await api(`/api/products/${slug}/reviews?sort=${sort}&page=${state.page + 1}`, { auth: false });
      setState((s) => ({ ...s, reviews: [...s.reviews, ...d.reviews], page: d.page, pages: d.pages }));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  const loading = state.slug !== slug || state.sort !== sort;
  const { summary } = state;

  return (
    <section id="reviews" aria-labelledby="reviews-title" className="scroll-mt-28 pt-[72px]">
      <h2 id="reviews-title" className="mb-6 text-[clamp(28px,2.8vw,36px)]">
        Customer Reviews
      </h2>
      {error ? (
        <p role="alert" className="text-danger-600">
          {error}
        </p>
      ) : loading && !summary ? (
        <Skeleton className="h-40" />
      ) : summary.count === 0 ? (
        <div className="rounded-lg border border-sand-400 bg-cream-50 p-6 text-[15px]">
          <p className="font-serif text-xl text-cocoa-900">No reviews yet</p>
          <p className="mt-1">Reviews come only from verified buyers. Bought this? You can review it from your delivered order.</p>
          <Link to="/account/orders" className="mt-3 inline-block text-sm font-semibold text-gold-700">
            Go to my orders →
          </Link>
        </div>
      ) : (
        <div className="grid items-start gap-8 md:grid-cols-[300px_1fr]">
          <div className="flex flex-col gap-4 rounded-lg border border-sand-400 bg-cream-50 p-6">
            <div className="flex items-end gap-3">
              <span className="font-serif text-[48px] leading-none text-cocoa-900">{summary.average.toFixed(1)}</span>
              <div className="pb-1">
                <Stars value={summary.average} />
                <p className="text-xs text-ink-500">
                  {summary.count} verified {summary.count === 1 ? "review" : "reviews"}
                </p>
              </div>
            </div>
            <ul aria-label="Rating breakdown" className="flex flex-col gap-1.5 text-sm">
              {[5, 4, 3, 2, 1].map((n) => {
                const count = summary.distribution[n] ?? 0;
                const pct = summary.count ? Math.round((count / summary.count) * 100) : 0;
                return (
                  <li key={n} className="flex items-center gap-2">
                    <span className="w-8 text-ink-700">{n} ★</span>
                    <span className="h-2 flex-1 overflow-hidden rounded-full bg-cream-300" aria-hidden="true">
                      <span className="block h-full rounded-full bg-gold-500" style={{ width: `${pct}%` }} />
                    </span>
                    <span className="w-9 text-right text-ink-500">
                      {count}
                      <span className="sr-only"> reviews with {n} stars</span>
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-end gap-2 text-sm">
              <label htmlFor="review-sort">Sort by</label>
              <select id="review-sort" value={sort} onChange={(e) => setSort(e.target.value)} className="h-10 rounded-md border border-sand-400 bg-white px-3">
                <option value="newest">Newest</option>
                <option value="highest">Highest rated</option>
                <option value="lowest">Lowest rated</option>
              </select>
            </div>
            <ul className={cn("flex flex-col divide-y divide-sand-400", loading && "opacity-60")} aria-busy={loading || undefined}>
              {state.reviews.map((r) => (
                <li key={r.id} className="flex flex-col gap-1.5 py-5 first:pt-0">
                  <div className="flex flex-wrap items-center gap-3">
                    <Stars value={r.rating} />
                    {r.title && <span className="font-serif text-lg text-cocoa-900">{r.title}</span>}
                  </div>
                  <p className="whitespace-pre-line text-[15px] leading-relaxed">{r.body}</p>
                  <p className="text-xs text-ink-500">
                    — {r.authorName} · <span className="text-leaf-800">Verified purchase</span> · {formatDate(r.createdAt)}
                  </p>
                </li>
              ))}
            </ul>
            {state.page < state.pages && (
              <Button variant="outline" size="sm" className="self-center" disabled={busy} onClick={loadMore}>
                {busy ? "Loading…" : "Show more reviews"}
              </Button>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
