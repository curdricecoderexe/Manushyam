import { useState } from "react";
import { Link, useSearchParams } from "react-router";
import { Search } from "lucide-react";
import { Seo } from "../../components/Seo";
import { Accordion } from "../../components/ui/Accordion";
import { Skeleton } from "../../components/ui/primitives";
import { Button } from "../../components/ui/button";
import { buttonVariants } from "../../components/ui/button-variants";
import { useQuery } from "../../lib/query";
import { cn } from "../../lib/cn";
import { CONTACT } from "../../data/site";
import { FAQ_TOPICS } from "../../data/content";

const normalise = (s) => s.toLowerCase().normalize("NFKD").replace(/[^\w\s]/g, " ");

export default function Faq() {
  const { data, error, isLoading, refetch } = useQuery("/api/faqs");
  // ?topic=orders deep-links from the Contact page's "Quick Answers".
  const [params] = useSearchParams();
  const [topic, setTopic] = useState(() => params.get("topic") || "product");
  const [openId, setOpenId] = useState(undefined); // undefined = first item open
  const [query, setQuery] = useState("");

  const faqs = data?.faqs ?? [];
  const topics = FAQ_TOPICS.map(([id, label]) => ({ id, label, count: faqs.filter((f) => f.topic === id).length })).filter((t) => t.count > 0);
  const activeTopic = topics.some((t) => t.id === topic) ? topic : topics[0]?.id;
  const words = normalise(query).split(/\s+/).filter(Boolean);
  const searching = words.length > 0;
  const visible = searching ? faqs.filter((f) => words.every((w) => normalise(`${f.question} ${f.answer}`).includes(w))) : faqs.filter((f) => f.topic === activeTopic);
  const open = openId === undefined ? visible[0]?.id : openId;

  const jsonLd = faqs.length
    ? { "@context": "https://schema.org", "@type": "FAQPage", mainEntity: faqs.map((f) => ({ "@type": "Question", name: f.question, acceptedAnswer: { "@type": "Answer", text: f.answer } })) }
    : undefined;

  return (
    <>
      <Seo title="Frequently Asked Questions" description="Answers about the ManushyaM ritual, ingredients, orders, Cash on Delivery and returns." path="/faq" jsonLd={jsonLd} />

      <section className="border-b border-sand-400 bg-[linear-gradient(180deg,#FBF3E6_0%,#F3E5CF_100%)] px-4 pb-14 pt-16 text-center">
        <span className="eyebrow">Help Centre</span>
        <h1 className="mb-3 mt-3.5 font-display text-[clamp(42px,5vw,64px)] leading-[1.05]">Frequently Asked Questions</h1>
        <p className="mx-auto mb-[26px] max-w-[560px] text-[17px]">Everything about the ritual, ingredients, orders, COD and returns.</p>
        <form role="search" onSubmit={(e) => e.preventDefault()} className="mx-auto flex h-[54px] max-w-[560px] items-center gap-2.5 rounded-lg border border-sand-500 bg-white px-4 shadow-sm focus-within:border-gold-600 focus-within:ring-[3px] focus-within:ring-gold-500/20">
          <Search className="h-5 w-5 text-ink-500" aria-hidden="true" />
          <label htmlFor="faq-q" className="sr-only">
            Search questions
          </label>
          <input
            id="faq-q"
            type="search"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setOpenId(undefined);
            }}
            placeholder="Search e.g. “COD”, “results”, “refund”"
            className="min-w-0 flex-1 bg-transparent text-base text-cocoa-900 outline-none placeholder:text-ink-500"
          />
        </form>
      </section>

      <div className="mx-auto flex max-w-[1100px] flex-wrap items-start gap-8 px-4 pt-12 md:px-6">
        <nav aria-label="FAQ topics" className="flex w-full gap-2 overflow-x-auto pb-1 [scrollbar-width:none] md:w-[260px] md:flex-col md:overflow-visible">
          {isLoading
            ? Array.from({ length: 5 }, (_, i) => <Skeleton key={i} className="h-[52px] min-w-[160px]" />)
            : topics.map((t) => {
                const on = !searching && t.id === activeTopic;
                return (
                  <button
                    key={t.id}
                    type="button"
                    aria-pressed={on}
                    onClick={() => {
                      setTopic(t.id);
                      setQuery("");
                      setOpenId(undefined);
                    }}
                    className={cn(
                      "flex min-h-[52px] shrink-0 items-center justify-between gap-4 rounded-lg border px-4 text-left font-serif text-base",
                      on ? "border-brown-700 bg-brown-700 text-white" : "border-sand-400 bg-cream-50 text-cocoa-900 hover:border-gold-600"
                    )}
                  >
                    {t.label}
                    <span className={cn("font-sans text-[13px]", on ? "opacity-80" : "text-ink-500")}>{t.count}</span>
                  </button>
                );
              })}
        </nav>

        <section aria-label="Questions" className="min-w-0 flex-[999_1_520px]" aria-live={searching ? "polite" : undefined}>
          {error ? (
            <div className="rounded-lg border border-sand-400 bg-cream-50 p-8 text-center">
              <p className="mb-4">We couldn’t load the questions just now.</p>
              <Button variant="outline" onClick={refetch}>
                Try again
              </Button>
            </div>
          ) : isLoading ? (
            <div className="flex flex-col gap-3">
              {Array.from({ length: 4 }, (_, i) => (
                <Skeleton key={i} className="h-[70px]" />
              ))}
            </div>
          ) : searching && !visible.length ? (
            <p className="rounded-lg border border-sand-400 bg-cream-50 p-8 text-center">
              No questions match “{query}”. Try another word, or <Link to="/contact">ask us directly</Link>.
            </p>
          ) : (
            <>
              {searching && (
                <p className="mb-3 text-sm text-ink-500">
                  {visible.length} {visible.length === 1 ? "answer" : "answers"} for “{query}”
                </p>
              )}
              <Accordion openId={open} onToggle={setOpenId} items={visible.map((f) => ({ id: f.id, title: f.question, content: <p>{f.answer}</p> }))} />
            </>
          )}
        </section>
      </div>

      <section className="mx-auto max-w-[1100px] px-4 pb-24 pt-14 md:px-6">
        <div className="flex flex-wrap items-center justify-between gap-5 rounded-[14px] border border-sand-400 bg-cream-200 px-8 py-7">
          <div className="flex flex-col gap-1.5">
            <h2 className="text-[26px]">Still have questions?</h2>
            <p className="text-[15px]">Our team replies within a few hours, 9 am – 7 pm IST.</p>
          </div>
          <div className="flex flex-wrap gap-3">
            <a href={`https://wa.me/${CONTACT.whatsapp}`} target="_blank" rel="noopener noreferrer" className={buttonVariants({ variant: "brown" })}>
              Chat on WhatsApp
            </a>
            <Link to="/contact" className={buttonVariants({ variant: "outline" })}>
              Contact us
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
