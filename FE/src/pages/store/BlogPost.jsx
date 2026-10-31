import { Link, useParams } from "react-router";
import { Seo } from "../../components/Seo";
import { Badge, Card, Skeleton } from "../../components/ui/primitives";
import { Breadcrumbs } from "../../components/ui/Breadcrumbs";
import { SectionTitle } from "../../components/ui/ornaments";
import { ArticleCard, ArticleMeta } from "../../components/blog/ArticleCard";
import { NewsletterForm } from "../../components/engagement/NewsletterForm";
import { useQuery } from "../../lib/query";
import { articleJsonLd, breadcrumbJsonLd } from "../../lib/seo";
import NotFound from "../NotFound";
import { responsiveImage } from "../../lib/images";

export default function BlogPost() {
  const { slug } = useParams();
  const { data, error, isLoading } = useQuery(`/api/blog/posts/${slug}`);

  if (error?.status === 404) return <NotFound />;
  if (isLoading || !data) {
    return (
      <div className="container-page flex max-w-[820px] flex-col gap-4 py-12" aria-busy="true" aria-label="Loading article">
        <Skeleton className="h-10 w-3/4" />
        <Skeleton className="aspect-[16/9]" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  const { post, related } = data;
  const crumbs = [{ label: "Home", to: "/" }, { label: "Blogs & Reviews", to: "/blog" }, ...(post.category ? [{ label: post.category.name, to: `/blog?category=${post.category.slug}` }] : []), { label: post.title }];

  return (
    <>
      <Seo title={post.seo.title} description={post.seo.description} path={`/blog/${post.slug}`} image={post.coverImage?.url} type="article" jsonLd={[articleJsonLd(post), breadcrumbJsonLd(crumbs)]} />
      <article className="container-page max-w-[860px] pb-16 pt-6">
        <Breadcrumbs items={crumbs} />
        <header className="mt-6 flex flex-col gap-4">
          {post.category && (
            <Link to={`/blog?category=${post.category.slug}`} className="self-start">
              <Badge>{post.category.name}</Badge>
            </Link>
          )}
          <h1 className="text-[clamp(32px,4vw,52px)] leading-[1.1]">{post.title}</h1>
          {post.excerpt && <p className="font-serif text-xl leading-relaxed text-ink-700">{post.excerpt}</p>}
          <div className="flex flex-wrap items-center gap-3 text-sm text-cocoa-900">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#EAD3C0] font-serif text-xs" aria-hidden="true">
              M
            </span>
            {post.author.name}
            <ArticleMeta post={post} className="text-sm" />
          </div>
        </header>
        {post.coverImage && <img {...responsiveImage(post.coverImage.url, "full", "(min-width: 896px) 832px, 100vw")} alt={post.coverImage.alt} fetchPriority="high" className="mt-8 aspect-[16/9] w-full rounded-xl border border-sand-400 object-cover" />}
        {/* contentHtml is sanitized on the server (BE/Services/blog.js) with a strict allow-list. */}
        <div className="article-body mt-10" dangerouslySetInnerHTML={{ __html: post.contentHtml }} />
        {post.tags.length > 0 && (
          <ul aria-label="Tags" className="mt-10 flex flex-wrap gap-2">
            {post.tags.map((t) => (
              <li key={t} className="rounded-full border border-sand-400 px-3 py-1 text-xs text-ink-700">
                #{t}
              </li>
            ))}
          </ul>
        )}
        <Card className="mt-12 grid items-center gap-4 bg-grad-cream p-6 sm:grid-cols-[1fr_1.1fr]">
          <div>
            <h2 className="text-2xl">Enjoyed this article?</h2>
            <p className="mt-1 text-sm">Get new Ayurvedic hair-care guides in your inbox.</p>
          </div>
          <NewsletterForm source="article" />
        </Card>
      </article>

      {related.length > 0 && (
        <section aria-labelledby="related-title" className="container-page pb-24">
          <SectionTitle className="mb-8">
            <span id="related-title">Keep Reading</span>
          </SectionTitle>
          <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {related.map((p) => (
              <li key={p.slug}>
                <ArticleCard post={p} />
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
