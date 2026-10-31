import { useCallback, useEffect, useState } from "react";
import { ArrowDown, ArrowUp, Plus, RotateCcw, Trash2 } from "lucide-react";
import { AdminPage, Panel } from "../../components/admin/AdminPage";
import { ErrorNote, FilterSelect, ImageInput, Toggle } from "../../components/admin/controls";
import { Dialog } from "../../components/ui/Dialog";
import { Tabs } from "../../components/ui/Tabs";
import { Field, Skeleton, StatusPill } from "../../components/ui/primitives";
import { Button } from "../../components/ui/button";
import { useToast } from "../../toast/context";
import { useUrlParams } from "../../lib/admin";
import { api } from "../../lib/api";
import { clearQueryCache } from "../../lib/query";
import { APPEARANCE_SLOTS } from "../../data/appearanceSlots";

const FAQ_TOPICS = [
  ["product", "Product"],
  ["orders", "Orders & shipping"],
  ["payments", "Payments"],
  ["returns", "Returns & refunds"],
  ["account", "Account"],
];
const POSITIONS = ["center", "center top", "center bottom", "left", "right"];

function useCms(path) {
  const [items, setItems] = useState(null);
  const [error, setError] = useState("");
  const load = useCallback(() => {
    api(`/api/admin/${path}`)
      .then((d) => setItems(d.items))
      .catch((err) => setError(err.message));
  }, [path]);
  useEffect(load, [load]);
  return { items, error, load };
}

// Saves a CMS item (create or update) and reports field errors back to the form.
function useSave(path, item, onSaved) {
  const [errors, setErrors] = useState({});
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const save = async (body) => {
    setBusy(true);
    setError("");
    setErrors({});
    try {
      const res = await api(item ? `/api/admin/${path}/${item.id}` : `/api/admin/${path}`, { method: item ? "PATCH" : "POST", body });
      clearQueryCache();
      onSaved(res.item);
    } catch (err) {
      setErrors(err.fieldErrors);
      setError(err.details?.length ? `${err.message}: ${err.details.map((d) => `${d.path} ${d.message}`).join("; ")}` : err.message);
      setBusy(false);
    }
  };
  return { save, errors, error, busy };
}

const toLocalInput = (iso) => (iso ? new Date(new Date(iso).getTime() + 330 * 60000).toISOString().slice(0, 16) : "");
const fromLocalInput = (v) => (v ? new Date(`${v}:00+05:30`).toISOString() : undefined);

// --- Hero slides --------------------------------------------------------------------------------

function SlideForm({ slide, nextOrder, onSaved }) {
  const [v, setV] = useState(() => ({
    eyebrow: slide?.eyebrow ?? "",
    title: slide?.title ?? "",
    subtitle: slide?.subtitle ?? "",
    image: slide?.image ?? { url: "", alt: "" },
    imagePosition: slide?.imagePosition ?? "center",
    ctaLabel: slide?.cta?.label ?? "",
    ctaHref: slide?.cta?.href ?? "",
    secondaryLabel: slide?.secondaryCta?.label ?? "",
    secondaryHref: slide?.secondaryCta?.href ?? "",
    isActive: slide?.isActive ?? true,
    startsAt: toLocalInput(slide?.startsAt),
    endsAt: toLocalInput(slide?.endsAt),
  }));
  const { save, errors, error, busy } = useSave("hero-slides", slide, onSaved);
  const bind = (k) => ({ value: v[k], onChange: (e) => setV((s) => ({ ...s, [k]: e.target.value })), error: errors[k] });
  return (
    <form
      aria-label="Hero slide"
      className="flex flex-col gap-4 p-5"
      onSubmit={(e) => {
        e.preventDefault();
        save({
          title: v.title,
          ...(v.eyebrow.trim() ? { eyebrow: v.eyebrow } : {}),
          ...(v.subtitle.trim() ? { subtitle: v.subtitle } : {}),
          image: { url: v.image.url.trim(), alt: v.image.alt ?? "" },
          imagePosition: v.imagePosition,
          ...(v.ctaLabel.trim() && v.ctaHref.trim() ? { cta: { label: v.ctaLabel, href: v.ctaHref } } : {}),
          ...(v.secondaryLabel.trim() && v.secondaryHref.trim() ? { secondaryCta: { label: v.secondaryLabel, href: v.secondaryHref } } : {}),
          isActive: v.isActive,
          ...(v.startsAt ? { startsAt: fromLocalInput(v.startsAt) } : {}),
          ...(v.endsAt ? { endsAt: fromLocalInput(v.endsAt) } : {}),
          ...(slide ? {} : { sortOrder: nextOrder }),
        });
      }}
    >
      <Field label="Eyebrow" maxLength={80} {...bind("eyebrow")} hint="Small line above the title" />
      <Field label="Title" required maxLength={80} {...bind("title")} />
      <Field label="Subtitle" as="textarea" maxLength={200} {...bind("subtitle")} inputClassName="min-h-[80px]" />
      <ImageInput label="Image" value={v.image} onChange={(image) => setV((s) => ({ ...s, image }))} hint="At least 1600 px wide. JPEG, PNG, WebP or AVIF up to 5 MB." />
      {errors["image.url"] && <p className="text-xs text-danger-600">{errors["image.url"]}</p>}
      <FilterSelect label="Image focus" value={v.imagePosition} onChange={(imagePosition) => setV((s) => ({ ...s, imagePosition }))} options={POSITIONS.map((p) => [p, p])} />
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Button text" maxLength={40} {...bind("ctaLabel")} />
        <Field label="Button link" placeholder="/solutions?for=men" {...bind("ctaHref")} />
        <Field label="Second button text" maxLength={40} {...bind("secondaryLabel")} />
        <Field label="Second button link" {...bind("secondaryHref")} />
        <Field label="Show from (optional)" type="datetime-local" {...bind("startsAt")} />
        <Field label="Show until (optional)" type="datetime-local" {...bind("endsAt")} />
      </div>
      <Toggle checked={v.isActive} onChange={(isActive) => setV((s) => ({ ...s, isActive }))} label="Show on the homepage" />
      <ErrorNote>{error}</ErrorNote>
      <Button type="submit" variant="brown" size="sm" disabled={busy}>
        {slide ? "Save slide" : "Add slide"}
      </Button>
    </form>
  );
}

// Swaps sortOrder with the neighbour (sortOrder values are rewritten as 0,10,20… to stay unique).
async function reorder(path, items, index, delta) {
  const list = [...items];
  const [moved] = list.splice(index, 1);
  list.splice(index + delta, 0, moved);
  await Promise.all(list.map((item, i) => (item.sortOrder === i * 10 ? null : api(`/api/admin/${path}/${item.id}`, { method: "PATCH", body: { sortOrder: i * 10 } }))));
}

function HeroSlides() {
  const { toast } = useToast();
  const { items, error, load } = useCms("hero-slides");
  const [editing, setEditing] = useState(null);
  async function move(i, d) {
    await reorder("hero-slides", items, i, d).catch((err) => toast({ message: err.message, tone: "error" }));
    clearQueryCache();
    load();
  }
  async function remove(slide) {
    await api(`/api/admin/hero-slides/${slide.id}`, { method: "DELETE" });
    clearQueryCache();
    toast({ message: "Slide deleted." });
    load();
  }
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-ink-700">Up to 6 active slides rotate on the homepage, in this order.</p>
        <Button size="sm" variant="brown" onClick={() => setEditing("new")}>
          <Plus className="h-4 w-4" aria-hidden="true" /> Add slide
        </Button>
      </div>
      <ErrorNote>{error}</ErrorNote>
      {!items ? (
        <Skeleton className="h-40" />
      ) : items.length === 0 ? (
        <p className="rounded-md border border-dashed border-sand-500 p-8 text-center text-ink-500">No slides yet — the homepage shows its built-in hero.</p>
      ) : (
        <ol className="flex flex-col gap-3">
          {items.map((s, i) => (
            <li key={s.id} className="flex flex-wrap items-center gap-4 rounded-lg border border-sand-400 bg-white p-3">
              <img src={s.image.url} alt="" className="h-16 w-28 rounded-md object-cover" />
              <div className="min-w-[180px] flex-1">
                <p className="font-medium text-cocoa-900">{s.title}</p>
                <p className="text-xs text-ink-500">{s.subtitle}</p>
              </div>
              <StatusPill tone={s.isActive ? "green" : "grey"}>{s.isActive ? "Showing" : "Hidden"}</StatusPill>
              <div className="flex gap-1">
                <Button size="icon" variant="outline" aria-label={`Move ${s.title} up`} disabled={i === 0} onClick={() => move(i, -1)}>
                  <ArrowUp className="h-4 w-4" aria-hidden="true" />
                </Button>
                <Button size="icon" variant="outline" aria-label={`Move ${s.title} down`} disabled={i === items.length - 1} onClick={() => move(i, 1)}>
                  <ArrowDown className="h-4 w-4" aria-hidden="true" />
                </Button>
                <Button size="sm" variant="outline" onClick={() => setEditing(s)}>
                  Edit
                </Button>
                <Button size="icon" variant="danger" aria-label={`Delete ${s.title}`} onClick={() => remove(s)}>
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                </Button>
              </div>
            </li>
          ))}
        </ol>
      )}
      <Dialog open={Boolean(editing)} onClose={() => setEditing(null)} title={editing === "new" ? "Add slide" : "Edit slide"} side="right" className="admin-scope">
        {editing && (
          <SlideForm
            slide={editing === "new" ? null : editing}
            nextOrder={(items?.length ?? 0) * 10}
            onSaved={() => {
              setEditing(null);
              toast({ message: "Slide saved." });
              load();
            }}
          />
        )}
      </Dialog>
    </div>
  );
}

// --- Appearance (storefront images) -------------------------------------------------------------

function SlotCard({ slot, override, onChange }) {
  const { toast } = useToast();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(override ?? { url: "", alt: slot.fallback.alt });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const shown = override?.url ? override.url : slot.fallback.src;
  async function save() {
    setBusy(true);
    setError("");
    try {
      const { slots } = await api(`/api/admin/appearance/${slot.key}`, { method: "PUT", body: { url: value.url.trim(), alt: value.alt ?? "" } });
      onChange(slots);
      setEditing(false);
      toast({ message: `${slot.label} updated.` });
    } catch (err) {
      setError(err.fieldErrors.url ?? err.message);
    } finally {
      setBusy(false);
    }
  }
  async function reset() {
    const { slots } = await api(`/api/admin/appearance/${slot.key}`, { method: "DELETE" });
    onChange(slots);
    setValue({ url: "", alt: slot.fallback.alt });
    toast({ message: `${slot.label} reset to the original image.` });
  }
  return (
    <li className="flex flex-col overflow-hidden rounded-lg border border-sand-400 bg-white">
      <img src={shown} alt="" className="w-full bg-cream-200 object-cover" style={{ aspectRatio: slot.aspect }} />
      <div className="flex flex-1 flex-col gap-2 p-3">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-500">{slot.group}</p>
            <h3 className="font-serif text-base text-cocoa-900">{slot.label}</h3>
          </div>
          <StatusPill tone={override ? "blue" : "grey"}>{override ? "Custom" : "Original"}</StatusPill>
        </div>
        <p className="text-xs text-ink-500">{slot.hint}</p>
        {editing ? (
          <div className="flex flex-col gap-2">
            <ImageInput label={`New image for ${slot.label}`} value={value} onChange={setValue} />
            {error && (
              <p role="alert" className="text-xs text-danger-600">
                {error}
              </p>
            )}
            <div className="flex gap-2">
              <Button size="sm" variant="brown" disabled={busy || !value.url} onClick={save}>
                Save image
              </Button>
              <Button size="sm" variant="outline" onClick={() => setEditing(false)}>
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <div className="mt-auto flex gap-2">
            <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
              Replace
            </Button>
            {override && (
              <Button size="sm" variant="outline" onClick={reset} aria-label={`Reset ${slot.label}`}>
                <RotateCcw className="h-4 w-4" aria-hidden="true" /> Reset
              </Button>
            )}
          </div>
        )}
      </div>
    </li>
  );
}

function Appearance() {
  const [slots, setSlots] = useState(null);
  const [error, setError] = useState("");
  useEffect(() => {
    api("/api/admin/appearance")
      .then((d) => setSlots(d.slots))
      .catch((err) => setError(err.message));
  }, []);
  const onChange = (next) => {
    setSlots(next);
    clearQueryCache();
  };
  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-ink-700">Replace photos around the store. Reset brings back the original image.</p>
      <ErrorNote>{error}</ErrorNote>
      {!slots ? (
        <Skeleton className="h-64" />
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {APPEARANCE_SLOTS.map((slot) => (
            <SlotCard key={slot.key} slot={slot} override={slots[slot.key]} onChange={onChange} />
          ))}
        </ul>
      )}
    </div>
  );
}

// --- FAQs ---------------------------------------------------------------------------------------

function FaqForm({ faq, onSaved }) {
  const [v, setV] = useState(() => ({ question: faq?.question ?? "", answer: faq?.answer ?? "", topic: faq?.topic ?? "product", isPublished: faq?.isPublished ?? true, sortOrder: String(faq?.sortOrder ?? 0) }));
  const { save, errors, error, busy } = useSave("faqs", faq, onSaved);
  const bind = (k) => ({ value: v[k], onChange: (e) => setV((s) => ({ ...s, [k]: e.target.value })), error: errors[k] });
  return (
    <form
      aria-label="FAQ"
      className="flex flex-col gap-4 p-5"
      onSubmit={(e) => {
        e.preventDefault();
        save({ question: v.question, answer: v.answer, topic: v.topic, isPublished: v.isPublished, sortOrder: Number(v.sortOrder) || 0 });
      }}
    >
      <Field label="Question" required maxLength={200} {...bind("question")} />
      <Field label="Answer" as="textarea" required maxLength={2000} {...bind("answer")} hint="Plain text. Blank lines start a new paragraph." />
      <div className="grid gap-3 sm:grid-cols-2">
        <FilterSelect label="Topic" value={v.topic} onChange={(topic) => setV((s) => ({ ...s, topic }))} options={FAQ_TOPICS} />
        <Field label="Order" type="number" {...bind("sortOrder")} hint="Lower shows first" />
      </div>
      <Toggle checked={v.isPublished} onChange={(isPublished) => setV((s) => ({ ...s, isPublished }))} label="Published" />
      <ErrorNote>{error}</ErrorNote>
      <Button type="submit" variant="brown" size="sm" disabled={busy}>
        {faq ? "Save FAQ" : "Add FAQ"}
      </Button>
    </form>
  );
}

function Faqs() {
  const { toast } = useToast();
  const { items, error, load } = useCms("faqs");
  const [editing, setEditing] = useState(null);
  const [topic, setTopic] = useState("");
  const shown = (items ?? []).filter((f) => !topic || f.topic === topic);
  async function remove(f) {
    await api(`/api/admin/faqs/${f.id}`, { method: "DELETE" });
    clearQueryCache();
    toast({ message: "FAQ deleted." });
    load();
  }
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <FilterSelect label="Topic" value={topic} onChange={setTopic} options={[["", "All topics"], ...FAQ_TOPICS]} className="w-56" />
        <Button size="sm" variant="brown" onClick={() => setEditing("new")}>
          <Plus className="h-4 w-4" aria-hidden="true" /> Add FAQ
        </Button>
      </div>
      <ErrorNote>{error}</ErrorNote>
      <Panel>
        {!items ? (
          <Skeleton className="m-5 h-40" />
        ) : shown.length === 0 ? (
          <p className="p-8 text-center text-ink-500">No FAQs here yet.</p>
        ) : (
          <ul className="divide-y divide-sand-400">
            {shown.map((f) => (
              <li key={f.id} className="flex flex-wrap items-start gap-3 px-5 py-3">
                <div className="min-w-[200px] flex-1">
                  <p className="font-medium text-cocoa-900">{f.question}</p>
                  <p className="line-clamp-2 text-sm text-ink-500">{f.answer}</p>
                </div>
                <StatusPill tone="grey">{FAQ_TOPICS.find(([k]) => k === f.topic)?.[1]}</StatusPill>
                {!f.isPublished && <StatusPill tone="amber">Hidden</StatusPill>}
                <Button size="sm" variant="outline" onClick={() => setEditing(f)}>
                  Edit
                </Button>
                <Button size="icon" variant="danger" aria-label={`Delete “${f.question}”`} onClick={() => remove(f)}>
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Panel>
      <Dialog open={Boolean(editing)} onClose={() => setEditing(null)} title={editing === "new" ? "Add FAQ" : "Edit FAQ"} side="right" className="admin-scope">
        {editing && (
          <FaqForm
            faq={editing === "new" ? null : editing}
            onSaved={() => {
              setEditing(null);
              toast({ message: "FAQ saved." });
              load();
            }}
          />
        )}
      </Dialog>
    </div>
  );
}

// --- Policy & content pages ---------------------------------------------------------------------

function PageForm({ page, onSaved }) {
  const [v, setV] = useState(() => ({ slug: page?.slug ?? "", title: page?.title ?? "", summary: page?.summary ?? "", isPublished: page?.isPublished ?? true, kind: page?.kind ?? "policy" }));
  const [sections, setSections] = useState(() => page?.sections ?? [{ heading: "", body: "" }]);
  const { save, errors, error, busy } = useSave("pages", page, onSaved);
  const bind = (k) => ({ value: v[k], onChange: (e) => setV((s) => ({ ...s, [k]: e.target.value })), error: errors[k] });
  const setSection = (i, patch) => setSections((list) => list.map((s, j) => (j === i ? { ...s, ...patch } : s)));
  return (
    <form
      aria-label="Page"
      className="flex flex-col gap-4 p-5"
      onSubmit={(e) => {
        e.preventDefault();
        save({ slug: v.slug, title: v.title, summary: v.summary || undefined, isPublished: v.isPublished, kind: v.kind, sections: sections.filter((s) => s.heading.trim() || s.body.trim()) });
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Title" required {...bind("title")} />
        <Field label="URL slug" required {...bind("slug")} hint={v.kind === "policy" ? `/policies/${v.slug || "…"}` : undefined} />
      </div>
      <Field label="Summary" as="textarea" maxLength={300} {...bind("summary")} inputClassName="min-h-[72px]" />
      {sections.map((s, i) => (
        <fieldset key={i} className="flex flex-col gap-3 rounded-md border border-sand-400 p-3">
          <legend className="px-1 text-sm font-medium text-cocoa-900">Section {i + 1}</legend>
          <Field label="Heading" value={s.heading} onChange={(e) => setSection(i, { heading: e.target.value })} maxLength={120} />
          <Field label="Text" as="textarea" value={s.body} onChange={(e) => setSection(i, { body: e.target.value })} maxLength={5000} />
          {sections.length > 1 && (
            <Button type="button" size="sm" variant="danger" className="self-start" onClick={() => setSections((list) => list.filter((_, j) => j !== i))}>
              Remove section
            </Button>
          )}
        </fieldset>
      ))}
      <Button type="button" size="sm" variant="outline" className="self-start" onClick={() => setSections((list) => [...list, { heading: "", body: "" }])}>
        <Plus className="h-4 w-4" aria-hidden="true" /> Add section
      </Button>
      <Toggle checked={v.isPublished} onChange={(isPublished) => setV((s) => ({ ...s, isPublished }))} label="Published" />
      <ErrorNote>{error}</ErrorNote>
      <Button type="submit" variant="brown" size="sm" disabled={busy}>
        {page ? "Save page" : "Create page"}
      </Button>
    </form>
  );
}

function Pages() {
  const { toast } = useToast();
  const { items, error, load } = useCms("pages");
  const [editing, setEditing] = useState(null);
  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end">
        <Button size="sm" variant="brown" onClick={() => setEditing("new")}>
          <Plus className="h-4 w-4" aria-hidden="true" /> New page
        </Button>
      </div>
      <ErrorNote>{error}</ErrorNote>
      <Panel>
        {!items ? (
          <Skeleton className="m-5 h-40" />
        ) : (
          <ul className="divide-y divide-sand-400">
            {items.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                <div className="min-w-[200px] flex-1">
                  <p className="font-medium text-cocoa-900">{p.title}</p>
                  <p className="font-mono text-xs text-ink-500">/policies/{p.slug}</p>
                </div>
                {!p.isPublished && <StatusPill tone="amber">Hidden</StatusPill>}
                <span className="text-xs text-ink-500">Updated {new Date(p.updatedAt).toLocaleDateString("en-IN")}</span>
                <Button size="sm" variant="outline" onClick={() => setEditing(p)}>
                  Edit
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Panel>
      <Dialog open={Boolean(editing)} onClose={() => setEditing(null)} title={editing === "new" ? "New page" : `Edit ${editing?.title ?? ""}`} className="admin-scope">
        {editing && (
          <PageForm
            page={editing === "new" ? null : editing}
            onSaved={() => {
              setEditing(null);
              toast({ message: "Page saved." });
              load();
            }}
          />
        )}
      </Dialog>
    </div>
  );
}

const TABS = ["slides", "images", "faqs", "pages"];

export default function Content() {
  const { get, setParam } = useUrlParams();
  const tab = TABS.includes(get("tab")) ? get("tab") : "slides";
  return (
    <AdminPage title="Homepage & content" subtitle="Hero slides, store images, FAQs and policy pages">
      <Tabs
        label="Content sections"
        value={tab}
        onChange={(t) => setParam("tab", t === "slides" ? "" : t)}
        tabs={[
          { id: "slides", label: "Hero slides", content: <HeroSlides /> },
          { id: "images", label: "Store images", content: <Appearance /> },
          { id: "faqs", label: "FAQs", content: <Faqs /> },
          { id: "pages", label: "Policy pages", content: <Pages /> },
        ]}
      />
    </AdminPage>
  );
}
