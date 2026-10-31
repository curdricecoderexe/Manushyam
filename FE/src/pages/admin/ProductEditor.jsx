import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { ArrowLeft, Plus, Trash2, Upload, ArrowUp } from "lucide-react";
import { AdminPage, Panel } from "../../components/admin/AdminPage";
import { Field, Skeleton } from "../../components/ui/primitives";
import { Button } from "../../components/ui/button";
import { useAuth } from "../../auth/context";
import { useToast } from "../../toast/context";
import { api } from "../../lib/api";
import { AUDIENCE_LABELS, TYPE_LABELS, CONCERN_LABELS, FREE_FROM_LABELS } from "../../data/content";
import { cn } from "../../lib/cn";

const MAX_UPLOAD = 5 * 1024 * 1024;
const lines = (s) =>
  String(s ?? "")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
const list = (s) =>
  String(s ?? "")
    .split(",")
    .map((l) => l.trim())
    .filter(Boolean);
const paras = (s) =>
  String(s ?? "")
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);
const toRupees = (paise) => (paise === null || paise === undefined ? "" : String(paise / 100));
const toPaise = (rupees) => (rupees === "" || rupees === null || rupees === undefined ? undefined : Math.round(Number(rupees) * 100));
const slugify = (s) =>
  s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);

const EMPTY_VARIANT = { sku: "", label: "", price: "", mrp: "", stock: "0", weightGrams: "", isDefault: false };
const EMPTY = {
  name: "",
  slug: "",
  tagline: "",
  summary: "",
  description: "",
  audience: "men",
  type: "therapy",
  status: "draft",
  sortOrder: "0",
  concerns: [],
  freeFrom: [],
  badges: "",
  keywords: "",
  benefits: "",
  extracts: "",
  oils: "",
  support: "",
  howToUse: "",
  faqs: [],
  images: [],
  variants: [{ ...EMPTY_VARIANT, isDefault: true }],
  seoTitle: "",
  seoDescription: "",
  costPrice: "",
  supplier: "",
  notes: "",
};

function fromProduct(p) {
  return {
    name: p.name,
    slug: p.slug,
    tagline: p.tagline ?? "",
    summary: p.summary ?? "",
    description: (p.description ?? []).join("\n\n"),
    audience: p.audience,
    type: p.type,
    status: p.status,
    sortOrder: String(p.sortOrder ?? 0),
    concerns: p.concerns ?? [],
    freeFrom: p.freeFrom ?? [],
    badges: (p.badges ?? []).join(", "),
    keywords: (p.keywords ?? []).join(", "),
    benefits: (p.benefits ?? []).join("\n"),
    extracts: (p.ingredients?.extracts ?? []).join("\n"),
    oils: (p.ingredients?.oils ?? []).join("\n"),
    support: (p.ingredients?.support ?? []).join("\n"),
    howToUse: (p.howToUse ?? []).join("\n"),
    faqs: (p.faqs ?? []).map((f) => ({ q: f.q, a: f.a })),
    images: (p.images ?? []).map((i) => ({ url: i.url, alt: i.alt ?? "" })),
    variants: p.variants.map((v) => ({ sku: v.sku, label: v.label, price: toRupees(v.price), mrp: toRupees(v.mrp), stock: String(v.stock), weightGrams: v.weightGrams ? String(v.weightGrams) : "", isDefault: Boolean(v.isDefault) })),
    seoTitle: p.seo?.title ?? "",
    seoDescription: p.seo?.description ?? "",
    costPrice: toRupees(p.internal?.costPrice),
    supplier: p.internal?.supplier ?? "",
    notes: p.internal?.notes ?? "",
  };
}

// Only fields the strict server schema accepts; empty optional text is left out.
function toPayload(f, { isAdmin }) {
  const opt = (v) => (v && String(v).trim() ? String(v).trim() : undefined);
  const body = {
    name: f.name.trim(),
    slug: f.slug.trim(),
    tagline: opt(f.tagline),
    summary: opt(f.summary),
    description: paras(f.description),
    audience: f.audience,
    type: f.type,
    status: f.status,
    sortOrder: Number(f.sortOrder) || 0,
    concerns: f.concerns,
    freeFrom: f.freeFrom,
    badges: list(f.badges),
    keywords: list(f.keywords),
    benefits: lines(f.benefits),
    ingredients: { extracts: lines(f.extracts), oils: lines(f.oils), support: lines(f.support) },
    howToUse: lines(f.howToUse),
    faqs: f.faqs.filter((x) => x.q.trim() && x.a.trim()).map((x) => ({ q: x.q.trim(), a: x.a.trim() })),
    images: f.images.filter((i) => i.url.trim()).map((i) => ({ url: i.url.trim(), alt: i.alt.trim() })),
    variants: f.variants.map((v) => ({
      sku: v.sku.trim().toUpperCase(),
      label: v.label.trim(),
      price: toPaise(v.price) ?? 0,
      ...(v.mrp !== "" ? { mrp: toPaise(v.mrp) } : {}),
      stock: Number(v.stock) || 0,
      isDefault: v.isDefault,
      ...(v.weightGrams !== "" ? { weightGrams: Number(v.weightGrams) } : {}),
    })),
    seo: { title: opt(f.seoTitle), description: opt(f.seoDescription) },
  };
  if (isAdmin) body.internal = { costPrice: toPaise(f.costPrice), supplier: opt(f.supplier), notes: opt(f.notes) };
  return JSON.parse(JSON.stringify(body)); // drops undefined keys
}

function Checks({ legend, options, value, onChange }) {
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-1 text-sm font-medium text-cocoa-900">{legend}</legend>
      <div className="flex flex-wrap gap-x-4 gap-y-2">
        {Object.entries(options).map(([id, label]) => (
          <label key={id} className="flex items-center gap-2 text-sm">
            <input type="checkbox" className="h-4 w-4 accent-brown-700" checked={value.includes(id)} onChange={(e) => onChange(e.target.checked ? [...value, id] : value.filter((x) => x !== id))} />
            {label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export default function ProductEditor() {
  const { id } = useParams();
  const isNew = !id;
  const { user } = useAuth();
  const isAdmin = user.role === "admin";
  const { toast } = useToast();
  const navigate = useNavigate();
  const [form, setForm] = useState(isNew ? EMPTY : null);
  const [slugTouched, setSlugTouched] = useState(!isNew);
  const [errors, setErrors] = useState([]);
  const [loadError, setLoadError] = useState("");
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (isNew) return undefined;
    let cancelled = false;
    api(`/api/admin/products/${id}`)
      .then(({ product }) => !cancelled && setForm(fromProduct(product)))
      .catch((err) => !cancelled && setLoadError(err.message));
    return () => {
      cancelled = true;
    };
  }, [id, isNew]);

  if (loadError) {
    return (
      <AdminPage title="Product">
        <p role="alert" className="text-danger-600">
          {loadError}
        </p>
      </AdminPage>
    );
  }
  if (!form) {
    return (
      <AdminPage title="Product">
        <Skeleton className="h-96" />
      </AdminPage>
    );
  }

  const set = (patch) => setForm((f) => ({ ...f, ...patch }));
  const bind = (k) => ({ value: form[k], onChange: (e) => set({ [k]: e.target.value }) });
  const setVariant = (i, patch) => set({ variants: form.variants.map((v, j) => (j === i ? { ...v, ...patch } : patch.isDefault ? { ...v, isDefault: false } : v)) });

  async function save(e) {
    e.preventDefault();
    setBusy(true);
    setErrors([]);
    try {
      const body = toPayload(form, { isAdmin });
      const { product } = isNew ? await api("/api/admin/products", { method: "POST", body }) : await api(`/api/admin/products/${id}`, { method: "PATCH", body });
      toast({ message: isNew ? "Product created." : "Changes saved." });
      if (isNew) navigate(`/admin/products/${product.id}`, { replace: true });
      else setForm(fromProduct(product));
    } catch (err) {
      setErrors(err.details?.length ? err.details.map((d) => `${d.path ? `${d.path}: ` : ""}${d.message}`) : [err.message]);
      window.scrollTo?.({ top: 0, behavior: "smooth" });
    } finally {
      setBusy(false);
    }
  }

  async function upload(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (file.size > MAX_UPLOAD) return setErrors(["Images must be 5 MB or smaller."]);
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("folder", "products");
      fd.append("file", file);
      const { image } = await api("/api/admin/uploads", { method: "POST", body: fd });
      set({ images: [...form.images, { url: image.url, alt: form.name }] });
    } catch (err) {
      setErrors([err.code === "UPLOADS_UNAVAILABLE" ? "Image uploads aren’t configured yet — paste an image URL instead." : err.message]);
    } finally {
      setUploading(false);
    }
    return undefined;
  }

  async function archive() {
    try {
      await api(`/api/admin/products/${id}`, { method: "DELETE" });
      toast({ message: "Product archived." });
      navigate("/admin/products");
    } catch (err) {
      setErrors([err.message]);
    }
  }

  return (
    <AdminPage
      title={isNew ? "New product" : form.name || "Product"}
      actions={
        <Link to="/admin/products" className="inline-flex items-center gap-1.5 text-sm font-semibold text-gold-700">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Inventory
        </Link>
      }
    >
      <form onSubmit={save} noValidate className="flex flex-col gap-6" aria-label="Product details">
        {errors.length > 0 && (
          <div role="alert" className="rounded-md border border-danger-600/30 bg-danger-50 px-4 py-3 text-sm text-danger-600">
            <p className="font-semibold">Please fix the following:</p>
            <ul className="list-disc pl-5">
              {errors.map((m) => (
                <li key={m}>{m}</li>
              ))}
            </ul>
          </div>
        )}

        <Panel title="Basics">
          <div className="grid gap-4 p-5 sm:grid-cols-2">
            <Field label="Name" required value={form.name} onChange={(e) => set({ name: e.target.value, ...(slugTouched ? {} : { slug: slugify(e.target.value) }) })} />
            <Field
              label="URL slug"
              required
              value={form.slug}
              hint={`/solutions/${form.slug || "…"}`}
              onChange={(e) => {
                setSlugTouched(true);
                set({ slug: e.target.value });
              }}
            />
            <Field label="Tagline" maxLength={120} {...bind("tagline")} />
            <Field label="Summary (cards)" maxLength={240} {...bind("summary")} />
            <Field as="select" label="For" {...bind("audience")}>
              {Object.entries(AUDIENCE_LABELS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </Field>
            <Field as="select" label="Type" {...bind("type")}>
              {Object.entries(TYPE_LABELS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </Field>
            <Field as="select" label="Status" {...bind("status")} hint="Only published products appear in the store">
              <option value="draft">Draft</option>
              <option value="published">Published</option>
              <option value="archived">Archived</option>
            </Field>
            <Field label="Sort order" type="number" {...bind("sortOrder")} hint="Lower numbers show first" />
            <Field as="textarea" label="Description" className="sm:col-span-2" hint="Separate paragraphs with a blank line" {...bind("description")} />
          </div>
        </Panel>

        <Panel title="Variants, prices & stock" actions={<span className="text-xs text-ink-500">Prices in ₹, GST inclusive</span>}>
          <div className="flex flex-col gap-4 p-5">
            {form.variants.map((v, i) => (
              <fieldset key={i} className="grid gap-3 rounded-md border border-sand-400 p-3 sm:grid-cols-[1fr_2fr_repeat(4,minmax(0,1fr))_auto]">
                <legend className="px-1 text-xs font-semibold text-ink-700">Variant {i + 1}</legend>
                <Field label="SKU" required value={v.sku} onChange={(e) => setVariant(i, { sku: e.target.value.toUpperCase() })} />
                <Field label="Label" required value={v.label} onChange={(e) => setVariant(i, { label: e.target.value })} />
                <Field label="Price ₹" required type="number" min="0" step="0.01" value={v.price} onChange={(e) => setVariant(i, { price: e.target.value })} />
                <Field label="MRP ₹" type="number" min="0" step="0.01" value={v.mrp} onChange={(e) => setVariant(i, { mrp: e.target.value })} />
                <Field label="Stock" required type="number" min="0" step="1" value={v.stock} onChange={(e) => setVariant(i, { stock: e.target.value })} />
                <Field label="Weight g" type="number" min="0" value={v.weightGrams} onChange={(e) => setVariant(i, { weightGrams: e.target.value })} />
                <div className="flex items-end gap-3 pb-3">
                  <label className="flex items-center gap-1.5 text-xs">
                    <input type="radio" name="default-variant" className="accent-brown-700" checked={v.isDefault} onChange={() => setVariant(i, { isDefault: true })} />
                    Default
                  </label>
                  {form.variants.length > 1 && (
                    <button type="button" aria-label={`Remove variant ${i + 1}`} onClick={() => set({ variants: form.variants.filter((_, j) => j !== i) })} className="text-danger-600">
                      <Trash2 className="h-4 w-4" aria-hidden="true" />
                    </button>
                  )}
                </div>
              </fieldset>
            ))}
            <Button variant="outline" size="sm" className="self-start" onClick={() => set({ variants: [...form.variants, { ...EMPTY_VARIANT }] })}>
              <Plus className="h-4 w-4" aria-hidden="true" /> Add variant
            </Button>
          </div>
        </Panel>

        <Panel title="Images" actions={<span className="text-xs text-ink-500">JPEG, PNG, WebP or AVIF · up to 5 MB · first image is the main one</span>}>
          <div className="flex flex-col gap-3 p-5">
            {form.images.map((img, i) => (
              <div key={i} className="grid items-end gap-3 sm:grid-cols-[64px_2fr_2fr_auto]">
                {img.url ? <img src={img.url} alt="" className="h-16 w-16 rounded-md border border-sand-400 object-cover" /> : <span className="h-16 w-16 rounded-md bg-cream-300" />}
                <Field label="Image URL" value={img.url} onChange={(e) => set({ images: form.images.map((x, j) => (j === i ? { ...x, url: e.target.value } : x)) })} />
                <Field label="Alt text" value={img.alt} onChange={(e) => set({ images: form.images.map((x, j) => (j === i ? { ...x, alt: e.target.value } : x)) })} />
                <div className="flex gap-2 pb-3">
                  {i > 0 && (
                    <button type="button" aria-label={`Make image ${i + 1} the main image`} onClick={() => set({ images: [img, ...form.images.filter((_, j) => j !== i)] })} className="text-gold-700">
                      <ArrowUp className="h-4 w-4" aria-hidden="true" />
                    </button>
                  )}
                  <button type="button" aria-label={`Remove image ${i + 1}`} onClick={() => set({ images: form.images.filter((_, j) => j !== i) })} className="text-danger-600">
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                  </button>
                </div>
              </div>
            ))}
            <div className="flex flex-wrap gap-2">
              <label className={cn("inline-flex min-h-[40px] cursor-pointer items-center gap-2 rounded-md bg-brown-700 px-4 text-sm text-white", uploading && "opacity-60")}>
                <Upload className="h-4 w-4" aria-hidden="true" />
                {uploading ? "Uploading…" : "Upload image"}
                <input type="file" accept="image/jpeg,image/png,image/webp,image/avif" className="sr-only" onChange={upload} disabled={uploading} />
              </label>
              <Button variant="outline" size="sm" onClick={() => set({ images: [...form.images, { url: "", alt: "" }] })}>
                Add by URL
              </Button>
            </div>
          </div>
        </Panel>

        <Panel title="Product page content">
          <div className="grid gap-4 p-5 sm:grid-cols-2">
            <Field as="textarea" label="Benefits" hint="One per line" {...bind("benefits")} />
            <Field as="textarea" label="How to use" hint="One step per line" {...bind("howToUse")} />
            <Field as="textarea" label="Herbal extracts" hint="One per line" {...bind("extracts")} />
            <Field as="textarea" label="Oils" hint="One per line" {...bind("oils")} />
            <Field as="textarea" label="Supporting ingredients" hint="One per line" {...bind("support")} />
            <div className="flex flex-col gap-4">
              <Field label="Badges" hint="Comma-separated, up to 4 (e.g. Bestseller)" {...bind("badges")} />
              <Field label="Search keywords" hint="Comma-separated" {...bind("keywords")} />
            </div>
            <Checks legend="Concerns" options={CONCERN_LABELS} value={form.concerns} onChange={(concerns) => set({ concerns })} />
            <Checks legend="Free from / promises" options={FREE_FROM_LABELS} value={form.freeFrom} onChange={(freeFrom) => set({ freeFrom })} />
          </div>
          <div className="flex flex-col gap-3 border-t border-sand-400 p-5">
            <h3 className="font-serif text-base text-cocoa-900">FAQs</h3>
            {form.faqs.map((f, i) => (
              <div key={i} className="grid items-end gap-3 sm:grid-cols-[1fr_2fr_auto]">
                <Field label={`Question ${i + 1}`} value={f.q} onChange={(e) => set({ faqs: form.faqs.map((x, j) => (j === i ? { ...x, q: e.target.value } : x)) })} />
                <Field label="Answer" value={f.a} onChange={(e) => set({ faqs: form.faqs.map((x, j) => (j === i ? { ...x, a: e.target.value } : x)) })} />
                <button type="button" aria-label={`Remove question ${i + 1}`} onClick={() => set({ faqs: form.faqs.filter((_, j) => j !== i) })} className="pb-4 text-danger-600">
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
            ))}
            <Button variant="outline" size="sm" className="self-start" onClick={() => set({ faqs: [...form.faqs, { q: "", a: "" }] })}>
              <Plus className="h-4 w-4" aria-hidden="true" /> Add question
            </Button>
          </div>
        </Panel>

        <Panel title="Search engines">
          <div className="grid gap-4 p-5 sm:grid-cols-2">
            <Field label="SEO title" maxLength={70} hint={`${form.seoTitle.length}/70 · defaults to the name`} {...bind("seoTitle")} />
            <Field label="SEO description" maxLength={160} hint={`${form.seoDescription.length}/160 · defaults to the summary`} {...bind("seoDescription")} />
          </div>
        </Panel>

        {isAdmin && (
          <Panel title="Internal (admins only)" actions={<span className="text-xs text-ink-500">Never shown to customers or staff</span>}>
            <div className="grid gap-4 p-5 sm:grid-cols-3">
              <Field label="Cost price ₹" type="number" min="0" step="0.01" {...bind("costPrice")} />
              <Field label="Supplier" {...bind("supplier")} />
              <Field label="Notes" {...bind("notes")} />
            </div>
          </Panel>
        )}

        <div className="sticky bottom-0 -mx-4 flex flex-wrap items-center gap-3 border-t border-sand-400 bg-panel-muted/95 px-4 py-3 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
          <Button type="submit" variant="brown" disabled={busy}>
            {busy ? "Saving…" : isNew ? "Create product" : "Save changes"}
          </Button>
          {!isNew && form.status === "published" && (
            <a href={`/solutions/${form.slug}`} target="_blank" rel="noopener noreferrer" className="text-sm font-semibold text-gold-700">
              View in store ↗
            </a>
          )}
          {!isNew && isAdmin && form.status !== "archived" && (
            <Button variant="danger" size="sm" className="ml-auto" onClick={archive}>
              Archive
            </Button>
          )}
        </div>
      </form>
    </AdminPage>
  );
}
