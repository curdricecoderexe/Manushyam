import { NavLink, useParams } from "react-router";
import { Seo } from "../../components/Seo";
import { Breadcrumbs } from "../../components/ui/Breadcrumbs";
import { Skeleton } from "../../components/ui/primitives";
import { useQuery } from "../../lib/query";
import { breadcrumbJsonLd } from "../../lib/seo";
import { cn } from "../../lib/cn";
import { CONTACT } from "../../data/site";
import NotFound from "../NotFound";

const dateFormat = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "long", year: "numeric" });

export default function Policy() {
  const { slug } = useParams();
  const index = useQuery("/api/pages");
  const { data, error, isLoading } = useQuery(`/api/pages/${encodeURIComponent(slug)}`);

  if (error?.status === 404 || error?.status === 400) return <NotFound />;
  const page = data?.page;
  const crumbs = [{ label: "Home", to: "/" }, { label: "Policies" }, { label: page?.title ?? "…" }];

  return (
    <div className="bg-cream-50">
      {page && <Seo title={page.title} description={page.summary || `${page.title} for orders placed on manushyam.com.`} path={`/policies/${slug}`} jsonLd={breadcrumbJsonLd(crumbs)} />}
      <div className="mx-auto max-w-[1160px] px-4 pb-24 pt-8 md:px-6">
        <Breadcrumbs items={crumbs} />
        <div className="mt-7 flex flex-wrap items-start gap-10">
          <nav aria-label="Policies" className="flex w-full flex-col gap-1 rounded-lg border border-sand-400 bg-cream-200 p-3.5 md:sticky md:top-24 md:w-[260px]">
            <h2 className="mx-2.5 mb-2.5 mt-1.5 font-sans text-xs font-semibold uppercase tracking-[0.16em] text-cocoa-900">Policies</h2>
            {(index.data?.pages ?? []).map((p) => (
              <NavLink
                key={p.slug}
                to={`/policies/${p.slug}`}
                className={({ isActive }) => cn("rounded-md px-3.5 py-3 font-serif text-[15px]", isActive ? "bg-brown-700 text-white hover:text-white" : "text-cocoa-900 hover:bg-cream-300 hover:text-cocoa-900")}
              >
                {p.title}
              </NavLink>
            ))}
          </nav>

          <article className="flex min-w-0 max-w-[760px] flex-[999_1_520px] flex-col gap-[18px] text-[17px] leading-[1.75] text-[#3B322B]">
            {error ? (
              <p>We couldn’t load this page. Please try again in a moment.</p>
            ) : isLoading || !page ? (
              <>
                <Skeleton className="h-12 w-2/3" />
                <Skeleton className="h-4 w-1/3" />
                <Skeleton className="h-40 w-full" />
              </>
            ) : (
              <>
                <h1 className="font-display text-[clamp(36px,4vw,52px)] leading-[1.1]">{page.title}</h1>
                <p className="text-sm text-ink-500">Last updated: {dateFormat.format(new Date(page.updatedAt))} · Applies to orders placed on manushyam.com</p>
                {page.summary && <p>{page.summary}</p>}
                {page.sections.map((s) => (
                  <section key={s.heading} className="flex flex-col gap-2 border-t border-sand-400 pt-[18px]">
                    <h2 className="text-2xl">{s.heading}</h2>
                    {/* Plain text from the CMS; blank lines separate paragraphs. */}
                    {s.body.split(/\n{2,}/).map((para) => (
                      <p key={para} className="whitespace-pre-line">
                        {para}
                      </p>
                    ))}
                  </section>
                ))}
                <div className="mt-3 rounded-lg border border-sand-400 bg-cream-200 px-5 py-[18px] text-[15px]">
                  Questions about this policy? Write to <a href={`mailto:${CONTACT.careEmail}`}>{CONTACT.careEmail}</a> or WhatsApp{" "}
                  <a href={`https://wa.me/${CONTACT.whatsapp}`} target="_blank" rel="noopener noreferrer">
                    {CONTACT.whatsappDisplay}
                  </a>
                  .
                </div>
              </>
            )}
          </article>
        </div>
      </div>
    </div>
  );
}
