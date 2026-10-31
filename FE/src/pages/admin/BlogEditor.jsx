import { Suspense, lazy, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { ExternalLink } from "lucide-react";
import { AdminPage, Panel } from "../../components/admin/AdminPage";
import { ErrorNote, FilterSelect, ImageInput, Toggle } from "../../components/admin/controls";
import { Field, Skeleton, StatusPill } from "../../components/ui/primitives";
import { Button } from "../../components/ui/button";
import { useToast } from "../../toast/context";
import { postState, slugify } from "../../lib/admin";
import { api } from "../../lib/api";
import { clearQueryCache } from "../../lib/query";

// The TipTap bundle loads only on this screen.
const RichTextEditor = lazy(() => import("../../components/admin/RichTextEditor"));

const toLocalInput = (iso) => (iso ? new Date(new Date(iso).getTime() + 330 * 60000).toISOString().slice(0, 16) : "");
const fromLocalInput = (v) => (v ? new Date(`${v}:00+05:30`).toISOString() : null);

function formFrom(post) {
  return {
    title: post?.title ?? "",
    slug: post?.slug ?? "",
    excerpt: post?.excerpt ?? "",
    contentHtml: post?.contentHtml ?? "",
    coverImage: post?.coverImage?.url ? post.coverImage : { url: "", alt: "" },
    category: post?.category ?? "",
    tags: (post?.tags ?? []).join(", "),
    authorName: post?.author?.name ?? "ManushyaM Ayurveda Team",
    isFeatured: post?.isFeatured ?? false,
    publishAt: toLocalInput(post?.publishAt),
    seoTitle: post?.seo?.title ?? "",
    seoDescription: post?.seo?.description ?? "",
  };
}

async function uploadImage(file) {
  const fd = new FormData();
  fd.append("folder", "content");
  fd.append("file", file);
  const { image } = await api("/api/admin/uploads", { method: "POST", body: fd });
  return image.url;
}

export default function BlogEditor() {
  const { id } = useParams();
  const isNew = !id;
  const navigate = useNavigate();
  const { toast } = useToast();
  const [post, setPost] = useState(null);
  const [form, setForm] = useState(() => formFrom(null));
  const [slugTouched, setSlugTouched] = useState(!isNew);
  const [categories, setCategories] = useState([]);
  const [errors, setErrors] = useState({});
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(isNew);

  useEffect(() => {
    api("/api/admin/blog/categories")
      .then((d) => setCategories(d.categories))
      .catch(() => {});
  }, []);
  useEffect(() => {
    if (isNew) return undefined;
    let cancelled = false;
    api(`/api/admin/blog/posts/${id}`)
      .then(({ post: p }) => {
        if (cancelled) return;
        setPost(p);
        setForm(formFrom(p));
        setLoaded(true);
      })
      .catch((err) => !cancelled && setError(err.message));
    return () => {
      cancelled = true;
    };
  }, [id, isNew]);

  const set = (patch) => setForm((f) => ({ ...f, ...patch }));
  const bind = (k) => ({ value: form[k], onChange: (e) => set({ [k]: e.target.value }), error: errors[k] });

  async function save(status) {
    setBusy(true);
    setError("");
    setErrors({});
    const body = {
      title: form.title,
      slug: form.slug,
      excerpt: form.excerpt.trim() || undefined,
      contentHtml: form.contentHtml,
      coverImage: form.coverImage.url.trim() ? { url: form.coverImage.url.trim(), alt: form.coverImage.alt ?? "" } : undefined,
      category: form.category || null,
      tags: form.tags
        .split(",")
        .map((t) => t.trim().toLowerCase())
        .filter(Boolean),
      author: { name: form.authorName.trim() || "ManushyaM Ayurveda Team" },
      isFeatured: form.isFeatured,
      status,
      publishAt: fromLocalInput(form.publishAt),
      seo: { ...(form.seoTitle.trim() ? { title: form.seoTitle.trim() } : {}), ...(form.seoDescription.trim() ? { description: form.seoDescription.trim() } : {}) },
    };
    try {
      const { post: saved } = await api(isNew ? "/api/admin/blog/posts" : `/api/admin/blog/posts/${id}`, { method: isNew ? "POST" : "PATCH", body: JSON.parse(JSON.stringify(body)) });
      clearQueryCache();
      setPost(saved);
      setForm(formFrom(saved));
      toast({ message: status === "draft" ? "Draft saved." : postState(saved).label.startsWith("Scheduled") ? "Article scheduled." : "Article published." });
      if (isNew) navigate(`/admin/blog/${saved.id}`, { replace: true });
    } catch (err) {
      setErrors(err.fieldErrors);
      setError(err.details?.length ? `${err.message}: ${err.details.map((d) => `${d.path} ${d.message}`).join("; ")}` : err.message);
    } finally {
      setBusy(false);
    }
  }

  const st = post ? postState(post) : null;
  return (
    <AdminPage
      title={isNew ? "New article" : form.title || "Edit article"}
      subtitle={
        <Link to="/admin/blog" className="text-gold-700">
          ← All articles
        </Link>
      }
      actions={
        <>
          {st && <StatusPill tone={st.tone}>{st.label}</StatusPill>}
          {post?.status === "published" && (
            <a href={`/blog/${post.slug}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-sm font-semibold text-gold-700">
              View <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
            </a>
          )}
        </>
      }
    >
      {!loaded ? (
        error ? <ErrorNote>{error}</ErrorNote> : <Skeleton className="h-96" />
      ) : (
        <form
          aria-label="Article"
          onSubmit={(e) => {
            e.preventDefault();
            save("published");
          }}
          className="grid gap-6 lg:grid-cols-[1fr_320px]"
        >
          <div className="flex min-w-0 flex-col gap-4">
            <Field label="Title" required maxLength={140} value={form.title} error={errors.title} onChange={(e) => set({ title: e.target.value, ...(slugTouched ? {} : { slug: slugify(e.target.value) }) })} />
            <Field
              label="URL slug"
              required
              value={form.slug}
              error={errors.slug}
              hint={`/blog/${form.slug || "…"}`}
              onChange={(e) => {
                setSlugTouched(true);
                set({ slug: e.target.value });
              }}
            />
            <div className="flex flex-col gap-2">
              <span className="text-sm font-medium text-cocoa-900">Article text</span>
              <Suspense fallback={<Skeleton className="h-[420px]" />}>
                <RichTextEditor value={form.contentHtml} onChange={(contentHtml) => set({ contentHtml })} onUploadImage={(file) => uploadImage(file).catch((err) => (toast({ message: err.message, tone: "error" }), null))} />
              </Suspense>
              <span className="text-xs text-ink-500">Formatting is checked on the server: scripts, embeds and unsafe links are removed when you save.</span>
            </div>
            <Field label="Excerpt" as="textarea" maxLength={300} {...bind("excerpt")} hint="Shown on article cards. Left empty, the first lines of the article are used." inputClassName="min-h-[80px]" />
          </div>

          <div className="flex flex-col gap-4">
            <Panel title="Publishing">
              <div className="flex flex-col gap-3 p-4">
                <Field label="Publish at (India time)" type="datetime-local" {...bind("publishAt")} hint="Empty = now. A future time schedules it." />
                <Toggle checked={form.isFeatured} onChange={(isFeatured) => set({ isFeatured })} label="Featured article" />
                <ErrorNote>{error}</ErrorNote>
                <Button type="submit" variant="brown" size="sm" disabled={busy}>
                  {form.publishAt && new Date(fromLocalInput(form.publishAt)) > new Date() ? "Schedule" : post?.status === "published" ? "Update article" : "Publish"}
                </Button>
                <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => save("draft")}>
                  {post?.status === "published" ? "Unpublish (save as draft)" : "Save draft"}
                </Button>
              </div>
            </Panel>
            <Panel title="Details">
              <div className="flex flex-col gap-3 p-4">
                <FilterSelect label="Category" value={form.category} onChange={(category) => set({ category })} options={[["", "None"], ...categories.map((c) => [c.id, c.name])]} />
                <Field label="Tags" {...bind("tags")} hint="Comma separated" />
                <Field label="Author" {...bind("authorName")} />
                <ImageInput label="Cover image" value={form.coverImage} onChange={(coverImage) => set({ coverImage })} />
              </div>
            </Panel>
            <Panel title="Search engines">
              <div className="flex flex-col gap-3 p-4">
                <Field label="SEO title" maxLength={70} {...bind("seoTitle")} hint={`${form.seoTitle.length}/70 · empty = article title`} />
                <Field label="SEO description" as="textarea" maxLength={170} {...bind("seoDescription")} hint={`${form.seoDescription.length}/170`} inputClassName="min-h-[80px]" />
              </div>
            </Panel>
          </div>
        </form>
      )}
    </AdminPage>
  );
}
