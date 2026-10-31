import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { motion } from "motion/react";
import { ChevronLeft, ChevronRight, CircleAlert, Search, Upload } from "lucide-react";
import { Button } from "../ui/button";
import { api } from "../../lib/api";
import { cn } from "../../lib/cn";

// Search box that writes ?q= 300 ms after typing stops.
export function SearchInput({ id, label, value, onCommit, placeholder, className }) {
  const [text, setText] = useState(value);
  useEffect(() => {
    if (text === value) return undefined;
    const t = setTimeout(() => onCommit(text.trim()), 300);
    return () => clearTimeout(t);
  }, [text, value, onCommit]);
  return (
    <div className={cn("relative w-full min-w-0 flex-none sm:w-auto sm:min-w-[240px] sm:flex-1", className)}>
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-500" aria-hidden="true" />
      <input id={id} type="search" value={text} onChange={(e) => setText(e.target.value)} placeholder={placeholder} className="h-11 w-full rounded-md border border-sand-400 bg-white pl-10 pr-3 text-sm focus:outline-none" />
    </div>
  );
}

export function FilterSelect({ label, value, onChange, options, className }) {
  return (
    <label className={cn("flex min-w-[140px] flex-1 flex-col gap-1.5 text-xs font-medium text-ink-700 sm:flex-none", className)}>
      {label}
      <select value={value} onChange={(e) => onChange(e.target.value)} className="h-11 w-full rounded-md border border-sand-400 bg-white px-3 text-sm text-cocoa-900 sm:min-w-[160px]">
        {options.map(([v, text]) => (
          <option key={v} value={v}>
            {text}
          </option>
        ))}
      </select>
    </label>
  );
}

export function Pager({ page, pages, onPage }) {
  if (!pages || pages <= 1) return null;
  return (
    <div className="flex items-center justify-center gap-2 sm:gap-3">
      <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => onPage(page - 1)} className="gap-1.5 bg-white pl-3">
        <ChevronLeft className="h-4 w-4" aria-hidden="true" /> Previous
      </Button>
      <span className="rounded-full bg-white px-3 py-1.5 text-xs font-medium tabular-nums text-ink-700 ring-1 ring-inset ring-sand-400/70">
        Page {page} of {pages}
      </span>
      <Button size="sm" variant="outline" disabled={page >= pages} onClick={() => onPage(page + 1)} className="gap-1.5 bg-white pr-3">
        Next <ChevronRight className="h-4 w-4" aria-hidden="true" />
      </Button>
    </div>
  );
}

// Accessible on/off switch.
export function Toggle({ checked, onChange, label, disabled, hideLabel = false }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={hideLabel ? label : undefined}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className="inline-flex min-h-[40px] items-center gap-2.5 text-sm text-cocoa-900 disabled:opacity-50"
    >
      <span className={cn("relative flex h-6 w-11 shrink-0 items-center rounded-full p-0.5 transition-colors duration-200", checked ? "justify-end bg-leaf-800" : "justify-start bg-sand-500")}>
        <motion.span layout transition={{ type: "spring", stiffness: 700, damping: 34 }} className="h-5 w-5 rounded-full bg-ivory shadow-[0_1px_3px_rgba(0,0,0,0.25)]" />
      </span>
      {!hideLabel && label}
    </button>
  );
}

export function ErrorNote({ children }) {
  if (!children) return null;
  return (
    <motion.p role="alert" initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} className="flex items-start gap-2 rounded-md border border-danger-600/20 bg-danger-50 px-3.5 py-2.5 text-sm text-danger-600">
      <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <span>{children}</span>
    </motion.p>
  );
}

export function Checkbox({ label, checked, onChange, className }) {
  return (
    <label className={cn("inline-flex min-h-[40px] items-center gap-2 text-sm text-cocoa-900", className)}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="h-4 w-4 accent-brown-700" />
      {label}
    </label>
  );
}

// Image picker: paste an https URL or upload a file (Cloudinary via the API).
export function ImageInput({ label, value, onChange, folder = "content", hint }) {
  const id = useId();
  const fileRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function upload(file) {
    if (!file) return;
    setBusy(true);
    setError("");
    try {
      const fd = new FormData();
      fd.append("folder", folder);
      fd.append("file", file);
      const { image } = await api("/api/admin/uploads", { method: "POST", body: fd });
      onChange({ ...value, url: image.url });
    } catch (err) {
      setError(err.code === "UPLOADS_UNAVAILABLE" ? "Image uploads aren’t configured yet — paste an image URL instead." : err.message);
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }
  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={id} className="text-sm font-medium text-cocoa-900">
        {label}
      </label>
      <div className="flex flex-wrap items-start gap-3">
        {value?.url ? <img src={value.url} alt="" className="h-16 w-24 rounded-md border border-sand-400 object-cover" /> : <span className="h-16 w-24 rounded-md border border-dashed border-sand-500 bg-cream-100" aria-hidden="true" />}
        <div className="flex min-w-0 flex-1 flex-col gap-2 sm:min-w-[220px]">
          <input id={id} type="text" inputMode="url" value={value?.url ?? ""} onChange={(e) => onChange({ ...value, url: e.target.value })} placeholder="https://… or /images/…" className="h-11 rounded-md border border-sand-400 bg-white px-3 text-sm" />
          <input aria-label={`${label} alt text`} type="text" value={value?.alt ?? ""} onChange={(e) => onChange({ ...value, alt: e.target.value })} placeholder="Describe the image (alt text)" maxLength={160} className="h-11 rounded-md border border-sand-400 bg-white px-3 text-sm" />
        </div>
        <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp,image/avif" className="sr-only" tabIndex={-1} aria-hidden="true" onChange={(e) => upload(e.target.files?.[0])} />
        <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => fileRef.current?.click()}>
          <Upload className="h-4 w-4" aria-hidden="true" /> {busy ? "Uploading…" : "Upload"}
        </Button>
      </div>
      {hint && <span className="text-xs text-ink-500">{hint}</span>}
      {error && (
        <span role="alert" className="text-xs text-danger-600">
          {error}
        </span>
      )}
    </div>
  );
}

const headLabel = (h) => (typeof h === "object" ? h?.label : h);

// Copies each column's heading onto its cells (data-label) so phones can show rows as labelled cards.
// Handles rowSpan (a spanned row is marked data-continued) and full-width colSpan rows (data-full).
function labelCells(table, labels) {
  let carry = [];
  for (const tr of table.tBodies[0]?.rows ?? []) {
    const busy = carry.map((n) => n > 0);
    let col = 0;
    for (const td of tr.cells) {
      while (busy[col]) col += 1;
      const span = td.colSpan || 1;
      const label = labels[col];
      td.toggleAttribute("data-full", span >= labels.length);
      td.toggleAttribute("data-primary", col === 0 && span < labels.length);
      if (typeof label === "string" && label && span < labels.length) td.setAttribute("data-label", label);
      else td.removeAttribute("data-label");
      if (td.rowSpan > 1) for (let k = 0; k < span; k += 1) carry[col + k] = Math.max(carry[col + k] ?? 0, td.rowSpan);
      col += span;
    }
    tr.toggleAttribute("data-continued", busy.some(Boolean));
    carry = carry.map((n) => Math.max(0, n - 1));
  }
}

// Table shell with the admin styling. Scrolls sideways on tablets, turns into cards on phones.
export function DataTable({ caption, head, children, minWidth = 720 }) {
  const ref = useRef(null);
  const labels = head.map(headLabel);
  const key = labels.join("|");
  useLayoutEffect(() => {
    const table = ref.current;
    if (!table) return undefined;
    const run = () => labelCells(table, key.split("|"));
    run();
    const observer = new MutationObserver(run);
    observer.observe(table.tBodies[0], { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [key]);
  return (
    <div className="overflow-x-auto">
      <table ref={ref} className="admin-table w-full text-sm" style={{ minWidth }}>
        {caption && <caption className="sr-only">{caption}</caption>}
        <thead>
          <tr className="border-b border-sand-400/70 bg-panel-muted text-left">
            {head.map((h, i) => (
              <th key={typeof h === "string" ? h || i : i} className={cn("px-3 py-3 first:pl-5 last:pr-5", typeof h === "object" && h?.className)}>
                {headLabel(h)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="[&>tr]:border-b [&>tr]:border-sand-400/50 [&>tr:last-child]:border-0 md:[&>tr>td]:px-3 md:[&>tr>td]:py-3 md:[&>tr>td:first-child]:pl-5 md:[&>tr>td:last-child]:pr-5">{children}</tbody>
      </table>
    </div>
  );
}
