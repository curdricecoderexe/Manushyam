import { Link } from "react-router";
import { Badge } from "../ui/primitives";
import { buttonVariants } from "../ui/button-variants";
import { ArrowIcon } from "../ui/button";
import { formatDate } from "../../lib/orders";
import { cn } from "../../lib/cn";
import { responsiveImage } from "../../lib/images";

export function ArticleMeta({ post, className }) {
  return (
    <p className={cn("text-xs text-ink-500", className)}>
      <time dateTime={post.publishedAt}>{formatDate(post.publishedAt)}</time> · {post.readMinutes} min read
    </p>
  );
}

// getdesign §7.10 article card: image 4:3, tag badge, Caslon title, 3-line excerpt, meta, outline Read More.
export function ArticleCard({ post, headingLevel: H = "h3" }) {
  return (
    <article className="flex h-full flex-col overflow-hidden rounded-lg border border-sand-400 bg-cream-50 transition hover:-translate-y-0.5 hover:border-gold-600 hover:shadow-md">
      <Link to={`/blog/${post.slug}`} tabIndex={-1} aria-hidden="true">
        {post.coverImage ? <img {...responsiveImage(post.coverImage.url, "card", "(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw")} alt="" loading="lazy" className="aspect-[4/3] w-full bg-cream-300 object-cover" /> : <div className="aspect-[4/3] bg-cream-300" />}
      </Link>
      <div className="flex flex-1 flex-col gap-2.5 p-4">
        {post.category && <Badge className="self-start text-[10px]">{post.category.name}</Badge>}
        <H className="text-xl leading-snug">
          <Link to={`/blog/${post.slug}`} className="text-cocoa-900 hover:text-gold-700">
            {post.title}
          </Link>
        </H>
        <p className="line-clamp-3 text-sm text-ink-700">{post.excerpt}</p>
        <ArticleMeta post={post} className="mt-auto pt-1" />
        <Link to={`/blog/${post.slug}`} className={cn(buttonVariants({ variant: "outline", size: "sm" }), "w-full")} aria-label={`Read more: ${post.title}`}>
          Read More
          <ArrowIcon />
        </Link>
      </div>
    </article>
  );
}
