import { useEffect, useState } from "react";
import { Link } from "react-router";
import { Trash2 } from "lucide-react";
import { AdminPage, Panel } from "../../components/admin/AdminPage";
import { ErrorNote, FilterSelect, Pager } from "../../components/admin/controls";
import { Skeleton, StatusPill } from "../../components/ui/primitives";
import { Button } from "../../components/ui/button";
import { Stars } from "../../components/reviews/Stars";
import { useToast } from "../../toast/context";
import { useUrlParams } from "../../lib/admin";
import { api } from "../../lib/api";
import { clearQueryCache } from "../../lib/query";
import { formatDate } from "../../lib/orders";

function ReviewItem({ review, onChanged, onDeleted }) {
  const { toast } = useToast();
  const [note, setNote] = useState(review.moderationNote ?? "");
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const hidden = review.status === "hidden";
  async function moderate() {
    setBusy(true);
    try {
      const { review: saved } = await api(`/api/admin/reviews/${review.id}`, { method: "PATCH", body: { status: hidden ? "published" : "hidden", ...(note.trim() ? { note: note.trim() } : {}) } });
      clearQueryCache();
      onChanged({ ...review, ...saved });
      toast({ message: hidden ? "Review shown again." : "Review hidden from the store." });
    } catch (err) {
      toast({ message: err.message, tone: "error" });
    } finally {
      setBusy(false);
    }
  }
  async function remove() {
    setBusy(true);
    try {
      await api(`/api/admin/reviews/${review.id}`, { method: "DELETE" });
      clearQueryCache();
      onDeleted(review.id);
      toast({ message: "Review deleted." });
    } catch (err) {
      toast({ message: err.message, tone: "error" });
      setBusy(false);
    }
  }
  return (
    <li className="flex flex-col gap-2 px-5 py-4">
      <div className="flex flex-wrap items-center gap-2">
        <Stars value={review.rating} />
        <span className="text-sm font-medium text-cocoa-900">{review.title}</span>
        {hidden && <StatusPill tone="amber">Hidden</StatusPill>}
        <span className="ml-auto text-xs text-ink-500">{formatDate(review.createdAt)}</span>
      </div>
      <p className="whitespace-pre-line text-sm text-ink-700">{review.body}</p>
      <p className="text-xs text-ink-500">
        {review.customer ? `${review.customer.name} · ${review.customer.email}` : review.authorName}
        {review.product && (
          <>
            {" · "}
            <Link to={`/solutions/${review.product.slug}`} className="text-gold-700">
              {review.product.name}
            </Link>
          </>
        )}
        {review.orderNumber && (
          <>
            {" · "}
            <Link to={`/admin/orders?q=${review.orderNumber}`} className="text-gold-700">
              View order {review.orderNumber}
            </Link>
          </>
        )}
      </p>
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex w-full min-w-0 flex-1 flex-col gap-1 text-xs text-ink-700 sm:w-auto sm:min-w-[220px]">
          Moderation note (internal)
          <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} className="h-10 rounded-md border border-sand-400 px-3 text-sm" />
        </label>
        <Button size="sm" variant="outline" disabled={busy} onClick={moderate}>
          {hidden ? "Show" : "Hide"}
        </Button>
        {confirming ? (
          <>
            <Button size="sm" variant="danger" disabled={busy} onClick={remove}>
              Delete for good
            </Button>
            <Button size="sm" variant="outline" onClick={() => setConfirming(false)}>
              Keep
            </Button>
          </>
        ) : (
          <Button size="icon" variant="danger" aria-label="Delete review" onClick={() => setConfirming(true)}>
            <Trash2 className="h-4 w-4" aria-hidden="true" />
          </Button>
        )}
      </div>
    </li>
  );
}

export default function Reviews() {
  const { get, setParam } = useUrlParams();
  const status = get("status");
  const rating = get("rating");
  const page = Number(get("page", "1"));
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    const qs = new URLSearchParams({ page: String(page), ...(status ? { status } : {}), ...(rating ? { rating } : {}) });
    api(`/api/admin/reviews?${qs}`)
      .then((d) => !cancelled && setData(d))
      .catch((err) => !cancelled && setError(err.message));
    return () => {
      cancelled = true;
    };
  }, [status, rating, page]);

  return (
    <AdminPage title="Reviews" subtitle={data ? `${data.total} reviews` : undefined}>
      <div className="flex flex-wrap gap-3">
        <FilterSelect
          label="Status"
          value={status}
          onChange={(v) => setParam("status", v)}
          options={[
            ["", "All"],
            ["published", "Showing"],
            ["hidden", "Hidden"],
          ]}
        />
        <FilterSelect label="Rating" value={rating} onChange={(v) => setParam("rating", v)} options={[["", "Any"], ...[5, 4, 3, 2, 1].map((r) => [String(r), `${r} star${r > 1 ? "s" : ""}`])]} />
      </div>
      <ErrorNote>{error}</ErrorNote>
      <Panel>
        {!data ? (
          <Skeleton className="m-5 h-48" />
        ) : data.reviews.length === 0 ? (
          <p className="p-8 text-center text-ink-500">No reviews match.</p>
        ) : (
          <ul className="divide-y divide-sand-400">
            {data.reviews.map((r) => (
              <ReviewItem
                key={r.id}
                review={r}
                onChanged={(next) => setData((d) => ({ ...d, reviews: d.reviews.map((x) => (x.id === next.id ? next : x)) }))}
                onDeleted={(id) => setData((d) => ({ ...d, total: d.total - 1, reviews: d.reviews.filter((x) => x.id !== id) }))}
              />
            ))}
          </ul>
        )}
      </Panel>
      {data && <Pager page={data.page} pages={data.pages} onPage={(p) => setParam("page", String(p))} />}
    </AdminPage>
  );
}
