import { useEffect, useState } from "react";
import { Link } from "react-router";
import { Card, Skeleton, StatusPill } from "../../components/ui/primitives";
import { Button } from "../../components/ui/button";
import { buttonVariants } from "../../components/ui/button-variants";
import { Accordion } from "../../components/ui/Accordion";
import { api } from "../../lib/api";
import { useQuery } from "../../lib/query";
import { STATUS_LABELS, STATUS_TONES, formatDate } from "../../lib/orders";
import { cn, formatPaise } from "../../lib/cn";

function OrderFaqs() {
  const { data } = useQuery("/api/faqs");
  const [open, setOpen] = useState(null);
  const faqs = (data?.faqs ?? []).filter((f) => ["orders", "returns"].includes(f.topic)).slice(0, 4);
  if (!faqs.length) return null;
  return (
    <section aria-labelledby="order-faq" className="mt-6">
      <h2 id="order-faq" className="mb-3 text-[22px]">
        Order questions
      </h2>
      <Accordion openId={open} onToggle={setOpen} items={faqs.map((f) => ({ id: f.id, title: f.question, content: <p>{f.answer}</p> }))} />
    </section>
  );
}

export default function Orders() {
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    api(`/api/orders?page=${page}`)
      .then((d) => !cancelled && setData(d))
      .catch((err) => !cancelled && setError(err.message));
    return () => {
      cancelled = true;
    };
  }, [page]);

  return (
    <div className="flex flex-col gap-5">
      <h2 className="text-[26px]">My orders</h2>
      {error && (
        <p role="alert" className="text-danger-600">
          {error}
        </p>
      )}
      {!data && !error ? (
        <div className="flex flex-col gap-4" aria-busy="true" aria-label="Loading your orders">
          <Skeleton className="h-36" />
          <Skeleton className="h-36" />
        </div>
      ) : data?.orders.length === 0 ? (
        <Card className="flex flex-col items-center gap-4 p-10 text-center">
          <p>You haven’t placed any orders yet. Your orders, tracking and invoices will appear here.</p>
          <Link to="/solutions" className={cn(buttonVariants({ variant: "brown" }))}>
            Explore solutions
          </Link>
        </Card>
      ) : (
        data && (
          <>
            <ul className="flex flex-col gap-4">
              {data.orders.map((o) => (
                <li key={o.orderNumber}>
                  <Card className="flex flex-col gap-4 p-5">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="font-serif text-lg text-cocoa-900">{o.orderNumber}</p>
                        <p className="text-sm text-ink-500">
                          Placed {formatDate(o.createdAt)} · {o.items.reduce((n, i) => n + i.qty, 0)} items
                        </p>
                      </div>
                      <StatusPill tone={STATUS_TONES[o.status]}>{STATUS_LABELS[o.status]}</StatusPill>
                    </div>
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="flex -space-x-2">
                        {o.items.slice(0, 4).map((i) => (i.image ? <img key={i.sku} src={i.image.url} alt={i.name} className="h-14 w-14 rounded-md border-2 border-cream-50 bg-[#F4EADB] object-cover" /> : null))}
                      </div>
                      <div className="flex items-center gap-4">
                        <span className="font-serif text-xl font-bold text-brown-700">{formatPaise(o.amounts.total)}</span>
                        <Link to={`/account/orders/${o.orderNumber}`} className={cn(buttonVariants({ variant: "outline", size: "sm" }))} aria-label={`View order ${o.orderNumber}`}>
                          {o.status === "cod_pending_confirmation" ? "Confirm order" : "View details"}
                        </Link>
                      </div>
                    </div>
                  </Card>
                </li>
              ))}
            </ul>
            {data.pages > 1 && (
              <div className="flex items-center justify-center gap-3">
                <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                  Newer
                </Button>
                <span className="text-sm text-ink-500">
                  Page {data.page} of {data.pages}
                </span>
                <Button variant="outline" size="sm" disabled={page >= data.pages} onClick={() => setPage((p) => p + 1)}>
                  Older
                </Button>
              </div>
            )}
          </>
        )
      )}
      <OrderFaqs />
    </div>
  );
}
