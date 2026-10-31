import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { Seo } from "../../components/Seo";
import { Badge, Card, RatingBadge, Skeleton } from "../../components/ui/primitives";
import { Button, ArrowIcon } from "../../components/ui/button";
import { buttonVariants } from "../../components/ui/button-variants";
import { SectionTitle, WheatArrow } from "../../components/ui/ornaments";
import { PathIcon } from "../../components/ui/icons";
import { ICONS } from "../../components/ui/icon-paths";
import { ArticleCard, ArticleMeta } from "../../components/blog/ArticleCard";
import { NewsletterForm } from "../../components/engagement/NewsletterForm";
import { Stars } from "../../components/reviews/Stars";
import { api } from "../../lib/api";
import { useQuery, withQuery } from "../../lib/query";
import { cn } from "../../lib/cn";
import { useAppearance } from "../../lib/appearance";

const PAGE_SIZE = 4;

const HERO_BADGES = [
  { label: "Ayurvedic Time-Tested", icon: ICONS.mortar },
  { label: "Backed by Ayurveda", icon: ICONS.sprout },
  { label: "Real People Real Results", icon: ICONS.shieldCheck },
  { label: "Honest & Helpful", icon: ICONS.heart },
];

const TRUST = [
  { label: "100% Ayurvedic", icon: ICONS.leafSprig },
  { label: "Made in India", icon: ICONS.globe },
  { label: "Cruelty Free", icon: ICONS.heart },
];

function Categories({ active }) {
  const { data } = useQuery("/api/blog/categories");
  const items = [{ slug: "", name: "All Articles" }, ...(data?.categories ?? []).filter((c) => c.count > 0)];
  return (
    <Card as="nav" aria-label="Article categories" className="p-4">
      <h2 className="mb-2 px-2 text-xl">Categories</h2>
      <ul className="flex flex-col">
        {items.map((c) => {
          const current = (active ?? "") === c.slug;
          return (
            <li key={c.slug || "all"} className="border-b border-sand-400 last:border-0">
              <Link
                to={c.slug ? `/blog?category=${c.slug}` : "/blog"}
                aria-current={current ? "page" : undefined}
                className={cn("my-1 flex min-h-10 items-center rounded-md px-3 font-serif text-[15px]", current ? "bg-brown-700 text-white hover:text-white" : "text-cocoa-900 hover:bg-cream-200")}
              >
                {c.name}
              </Link>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

function FeaturedArticle() {
  const { data, isLoading } = useQuery("/api/blog/featured");
  if (isLoading) return <Skeleton className="h-72" />;
  const post = data?.post;
  if (!post) return null;
  return (
    <article className="grid overflow-hidden rounded-lg border border-sand-400 bg-cream-50 shadow-sm sm:grid-cols-[1fr_1.15fr]">
      {post.coverImage && <img src={post.coverImage.url} alt={post.coverImage.alt} className="h-full min-h-[240px] w-full object-cover" />}
      <div className="flex flex-col gap-3.5 p-6 lg:p-7">
        {post.category && <Badge className="self-start">{post.category.name}</Badge>}
        <h3 className="text-[clamp(24px,2.4vw,32px)] leading-tight">
          <Link to={`/blog/${post.slug}`} className="text-cocoa-900 hover:text-gold-700">
            {post.title}
          </Link>
        </h3>
        <p className="text-[15px]">{post.excerpt}</p>
        <p className="flex items-center gap-2 text-sm text-cocoa-900">
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[#EAD3C0] font-serif text-xs" aria-hidden="true">
            M
          </span>
          {post.author.name}
        </p>
        <div className="mt-auto flex flex-wrap items-center justify-between gap-3">
          <ArticleMeta post={post} />
          <Link to={`/blog/${post.slug}`} className={buttonVariants({ variant: "brown", size: "sm" })} aria-label={`Read more: ${post.title}`}>
            Read More
            <ArrowIcon />
          </Link>
        </div>
      </div>
    </article>
  );
}

function Articles({ category }) {
  const first = useQuery(withQuery("/api/blog/posts", { category, limit: PAGE_SIZE }));
  const [more, setMore] = useState({ key: null, posts: [], page: 1 });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const key = category ?? "";
  // Extra pages belong to the category they were loaded for.
  const extra = more.key === key ? more : { key, posts: [], page: 1 };

  async function loadMore() {
    setBusy(true);
    setError("");
    try {
      const d = await api(withQuery("/api/blog/posts", { category, limit: PAGE_SIZE, page: extra.page + 1 }), { auth: false });
      setMore({ key, posts: [...extra.posts, ...d.posts], page: d.page });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (first.error?.status === 404) return <p>That category doesn’t exist.</p>;
  if (first.isLoading) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[1, 2, 3, 4].map((n) => (
          <Skeleton key={n} className="h-80" />
        ))}
      </div>
    );
  }
  const posts = [...(first.data?.posts ?? []), ...extra.posts];
  const pages = first.data?.pages ?? 1;
  if (!posts.length) return <p className="text-center">No articles here yet — check back soon.</p>;
  return (
    <div className="flex flex-col items-center gap-6">
      <ul className="grid w-full gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {posts.map((p) => (
          <li key={p.slug}>
            <ArticleCard post={p} />
          </li>
        ))}
      </ul>
      {error && (
        <p role="alert" className="text-sm text-danger-600">
          {error}
        </p>
      )}
      {extra.page < pages && (
        <Button variant="outline" disabled={busy} onClick={loadMore}>
          {busy ? "Loading…" : "Load More Articles ↓"}
        </Button>
      )}
    </div>
  );
}

function ReviewsSidebar({ settings, highlights }) {
  const firstProduct = highlights[0]?.product?.slug;
  return (
    <Card as="aside" aria-labelledby="love-title" className="flex flex-col gap-4 p-5 text-center">
      <h2 id="love-title" className="text-xl leading-snug">
        What People Love About ManushyaM
      </h2>
      {settings?.rating && (
        <div className="flex flex-col items-center gap-1">
          <span className="flex items-center gap-2 font-serif text-[48px] leading-none text-cocoa-900">
            {settings.rating.value}
            <PathIcon d="M12 2l3 7 7 .6-5.3 4.7 1.6 7.2L12 17.8 5.7 21.5l1.6-7.2L2 9.6 9 9z" size={32} fill="#C9944A" strokeWidth={0} />
          </span>
          <span className="text-sm text-cocoa-900">Average Rating</span>
          <span className="text-xs text-ink-500">{settings.rating.source}</span>
        </div>
      )}
      {highlights.length > 0 ? (
        <ul className="flex flex-col gap-3 text-left">
          {highlights.map((r) => (
            <li key={r.id} className="rounded-md border border-sand-400 bg-white/70 p-3 text-sm">
              <Stars value={r.rating} size="h-3.5 w-3.5" />
              <p className="mt-1.5 line-clamp-4">“{r.body}”</p>
              <p className="mt-1.5 text-xs text-ink-500">— {r.authorName}</p>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-ink-500">Reviews from verified buyers will appear here.</p>
      )}
      <Link to={firstProduct ? `/solutions/${firstProduct}#reviews` : "/solutions"} className={buttonVariants({ variant: "brown", size: "sm" })}>
        See All Reviews
        <ArrowIcon />
      </Link>
    </Card>
  );
}

export default function Blog() {
  const heroImage = useAppearance("blogHero");
  const [params] = useSearchParams();
  const category = params.get("category") || undefined;
  const { data: settingsData } = useQuery("/api/settings");
  const { data: highlightData } = useQuery("/api/reviews/highlights?limit=3");
  const { data: catData } = useQuery("/api/blog/categories");
  const settings = settingsData?.settings;
  const highlights = highlightData?.reviews ?? [];
  const categoryName = catData?.categories.find((c) => c.slug === category)?.name;

  useEffect(() => {
    if (category) document.getElementById("all-articles")?.scrollIntoView?.({ block: "start" });
  }, [category]);

  return (
    <>
      <Seo title={categoryName ? `${categoryName} — Blogs & Reviews` : "Blogs & Reviews"} description="Ayurvedic wisdom, real results. Expert advice, honest reviews and time-tested rituals for stronger, healthier hair." path={category ? `/blog?category=${category}` : "/blog"} />

      <section className="border-b border-sand-400 bg-grad-cream">
        <div className="container-page grid items-center gap-8 py-10 md:grid-cols-[1fr_1.1fr] lg:py-14">
          <div className="flex flex-col gap-4">
            <h1 className="font-display text-[clamp(42px,5vw,64px)] leading-[1.05]">Blogs &amp; Reviews</h1>
            <p className="font-serif text-xl text-cocoa-900">Ayurvedic wisdom, real results.</p>
            <p className="max-w-[420px] text-[17px]">Expert advice, honest reviews, and time-tested rituals for stronger, healthier hair.</p>
            {settings?.rating && <RatingBadge rating={settings.rating.value} source={settings.rating.source} className="self-start" />}
            <ul className="mt-2 grid max-w-[460px] grid-cols-4 gap-2 text-center text-xs text-cocoa-900">
              {HERO_BADGES.map((b) => (
                <li key={b.label} className="flex flex-col items-center gap-2">
                  <span className="flex h-12 w-12 items-center justify-center rounded-full border border-sand-500 bg-cream-50 text-gold-600">
                    <PathIcon d={b.icon} size={22} />
                  </span>
                  {b.label}
                </li>
              ))}
            </ul>
          </div>
          <img src={heroImage.src} alt={heroImage.alt} fetchPriority="high" className="aspect-[1.5/1] w-full rounded-xl object-cover" />
        </div>
      </section>

      <div className="container-page grid items-start gap-7 py-12 lg:grid-cols-[230px_1fr_260px]">
        <div className="flex flex-col gap-5 max-lg:order-2">
          <Categories active={category} />
          <Card className="p-5">
            <h2 className="text-xl">Stay Updated</h2>
            <p className="mb-3 mt-1 text-sm text-ink-500">Get Ayurvedic tips, new articles &amp; offers.</p>
            <NewsletterForm source="blog" stacked />
            <ul className="mt-2 grid grid-cols-3 gap-1 border-t border-sand-400 pt-4 text-center text-[11px] text-cocoa-900">
              {TRUST.map((t) => (
                <li key={t.label} className="flex flex-col items-center gap-1.5">
                  <span className="flex h-10 w-10 items-center justify-center rounded-full border border-sand-500 text-gold-600">
                    <PathIcon d={t.icon} size={18} />
                  </span>
                  {t.label}
                </li>
              ))}
            </ul>
          </Card>
        </div>

        <div className="flex min-w-0 flex-col gap-8 max-lg:order-1">
          {!category && (
            <section aria-labelledby="featured-title" className="flex flex-col gap-5">
              <SectionTitle>
                <span id="featured-title">Featured Article</span>
              </SectionTitle>
              <FeaturedArticle />
            </section>
          )}
          <section id="all-articles" aria-labelledby="all-title" className="flex scroll-mt-28 flex-col gap-5">
            <SectionTitle>
              <span id="all-title">{categoryName ?? "All Articles"}</span>
            </SectionTitle>
            <Articles category={category} />
          </section>
        </div>

        <div className="max-lg:order-3">
          <ReviewsSidebar settings={settings} highlights={highlights} />
        </div>
      </div>

      <section className="border-y border-sand-400 bg-cream-200 py-8 text-center">
        <div className="flex items-center justify-center gap-4">
          <WheatArrow className="hidden sm:block" />
          <h2 className="text-[clamp(26px,2.6vw,34px)]">{highlights.length ? "Share Your Ritual" : "Reviews Coming Soon"}</h2>
          <WheatArrow flip className="hidden sm:block" />
        </div>
        {highlights.length ? (
          <p className="mt-1.5 text-sm">
            Bought from us?{" "}
            <Link to="/account/orders" className="font-semibold text-gold-700">
              Review your delivered order
            </Link>{" "}
            — real stories help others choose.
          </p>
        ) : (
          <p className="mt-1.5 text-sm">Real stories. Real results. Stay tuned!</p>
        )}
      </section>
    </>
  );
}
