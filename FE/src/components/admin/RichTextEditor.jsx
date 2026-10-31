import { useEffect, useState } from "react";
import { EditorContent, useEditor, useEditorState } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Image from "@tiptap/extension-image";
import { Bold, Heading2, Heading3, ImagePlus, Italic, Link2, List, ListOrdered, Minus, Quote, Redo2, Strikethrough, Underline, Undo2, Unlink } from "lucide-react";
import { cn } from "../../lib/cn";

// Article editor (TipTap). It only offers what the server's sanitizer keeps (BE/Services/blog.js):
// h2–h4, paragraphs, bold/italic/underline/strike, lists, quotes, links, images, rules, code.
// This file is loaded on demand, so the editor never weighs down the storefront.

const safeUrl = (u) => /^(https:\/\/|\/(?!\/)|mailto:)/i.test(u.trim());

function ToolButton({ label, active, disabled, onClick, children }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={active ?? undefined}
      disabled={disabled}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className={cn("flex h-9 w-9 items-center justify-center rounded-md text-cocoa-900 hover:bg-cream-200 disabled:opacity-40", active && "bg-cream-300")}
    >
      {children}
    </button>
  );
}

function UrlBar({ label, initial = "", withAlt, onSubmit, onCancel }) {
  const [url, setUrl] = useState(initial);
  const [alt, setAlt] = useState("");
  const ok = safeUrl(url);
  return (
    <div role="group" aria-label={label} className="flex flex-wrap items-center gap-2 border-b border-sand-400 bg-cream-50 px-2 py-2">
      <input
        autoFocus
        aria-label={`${label} URL`}
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            if (ok) onSubmit(url.trim(), alt.trim());
          }
          if (e.key === "Escape") onCancel();
        }}
        placeholder="https://… or /solutions/…"
        className="h-9 min-w-[200px] flex-1 rounded-md border border-sand-400 bg-white px-2 text-sm"
      />
      {withAlt && <input aria-label="Image description" value={alt} onChange={(e) => setAlt(e.target.value)} placeholder="Describe the image" className="h-9 min-w-[160px] flex-1 rounded-md border border-sand-400 bg-white px-2 text-sm" />}
      <button type="button" disabled={!ok} onClick={() => onSubmit(url.trim(), alt.trim())} className="h-9 rounded-md bg-brown-700 px-3 text-sm text-white disabled:opacity-40">
        Apply
      </button>
      <button type="button" onClick={onCancel} className="h-9 rounded-md px-3 text-sm text-cocoa-900">
        Cancel
      </button>
      {url && !ok && <span className="w-full text-xs text-danger-600">Use an https link or a site path starting with /</span>}
    </div>
  );
}

export default function RichTextEditor({ value, onChange, label = "Article text", onUploadImage }) {
  const [bar, setBar] = useState(null); // "link" | "image"
  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [2, 3, 4] }, link: { openOnClick: false, autolink: true, protocols: ["https", "mailto"], isAllowedUri: (url) => safeUrl(url) } }),
      Image.configure({ allowBase64: false }),
    ],
    content: value || "",
    editorProps: { attributes: { class: "article-body min-h-[360px] px-4 py-4 focus:outline-none", role: "textbox", "aria-multiline": "true", "aria-label": label } },
    onUpdate: ({ editor: e }) => onChange(e.isEmpty ? "" : e.getHTML()),
    immediatelyRender: true,
  });
  const state = useEditorState({
    editor,
    selector: ({ editor: e }) =>
      e
        ? {
            h2: e.isActive("heading", { level: 2 }),
            h3: e.isActive("heading", { level: 3 }),
            bold: e.isActive("bold"),
            italic: e.isActive("italic"),
            underline: e.isActive("underline"),
            strike: e.isActive("strike"),
            bullet: e.isActive("bulletList"),
            ordered: e.isActive("orderedList"),
            quote: e.isActive("blockquote"),
            link: e.isActive("link"),
            href: e.getAttributes("link").href ?? "",
            canUndo: e.can().undo(),
            canRedo: e.can().redo(),
          }
        : {},
  }) ?? {};

  // A different article loaded into the same editor (e.g. after "Save" returns the sanitised HTML).
  useEffect(() => {
    if (editor && value !== undefined && value !== editor.getHTML() && !(value === "" && editor.isEmpty)) editor.commands.setContent(value || "", { emitUpdate: false });
  }, [editor, value]);

  if (!editor) return null;
  const chain = () => editor.chain().focus();
  return (
    <div className="overflow-hidden rounded-md border border-sand-400 bg-white focus-within:border-gold-600">
      <div role="toolbar" aria-label="Formatting" className="flex flex-wrap gap-0.5 border-b border-sand-400 bg-cream-50 p-1">
        <ToolButton label="Heading" active={state.h2} onClick={() => chain().toggleHeading({ level: 2 }).run()}>
          <Heading2 className="h-4 w-4" />
        </ToolButton>
        <ToolButton label="Subheading" active={state.h3} onClick={() => chain().toggleHeading({ level: 3 }).run()}>
          <Heading3 className="h-4 w-4" />
        </ToolButton>
        <ToolButton label="Bold" active={state.bold} onClick={() => chain().toggleBold().run()}>
          <Bold className="h-4 w-4" />
        </ToolButton>
        <ToolButton label="Italic" active={state.italic} onClick={() => chain().toggleItalic().run()}>
          <Italic className="h-4 w-4" />
        </ToolButton>
        <ToolButton label="Underline" active={state.underline} onClick={() => chain().toggleUnderline().run()}>
          <Underline className="h-4 w-4" />
        </ToolButton>
        <ToolButton label="Strikethrough" active={state.strike} onClick={() => chain().toggleStrike().run()}>
          <Strikethrough className="h-4 w-4" />
        </ToolButton>
        <ToolButton label="Bulleted list" active={state.bullet} onClick={() => chain().toggleBulletList().run()}>
          <List className="h-4 w-4" />
        </ToolButton>
        <ToolButton label="Numbered list" active={state.ordered} onClick={() => chain().toggleOrderedList().run()}>
          <ListOrdered className="h-4 w-4" />
        </ToolButton>
        <ToolButton label="Quote" active={state.quote} onClick={() => chain().toggleBlockquote().run()}>
          <Quote className="h-4 w-4" />
        </ToolButton>
        <ToolButton label="Divider" onClick={() => chain().setHorizontalRule().run()}>
          <Minus className="h-4 w-4" />
        </ToolButton>
        <ToolButton label="Link" active={state.link} onClick={() => setBar(bar === "link" ? null : "link")}>
          <Link2 className="h-4 w-4" />
        </ToolButton>
        {state.link && (
          <ToolButton label="Remove link" onClick={() => chain().extendMarkRange("link").unsetLink().run()}>
            <Unlink className="h-4 w-4" />
          </ToolButton>
        )}
        <ToolButton label="Image" onClick={() => setBar(bar === "image" ? null : "image")}>
          <ImagePlus className="h-4 w-4" />
        </ToolButton>
        <span className="mx-1 w-px bg-sand-400" aria-hidden="true" />
        <ToolButton label="Undo" disabled={!state.canUndo} onClick={() => chain().undo().run()}>
          <Undo2 className="h-4 w-4" />
        </ToolButton>
        <ToolButton label="Redo" disabled={!state.canRedo} onClick={() => chain().redo().run()}>
          <Redo2 className="h-4 w-4" />
        </ToolButton>
      </div>
      {bar === "link" && (
        <UrlBar
          label="Link"
          initial={state.href}
          onCancel={() => setBar(null)}
          onSubmit={(href) => {
            chain().extendMarkRange("link").setLink({ href }).run();
            setBar(null);
          }}
        />
      )}
      {bar === "image" && (
        <>
          <UrlBar
            label="Image"
            withAlt
            onCancel={() => setBar(null)}
            onSubmit={(src, alt) => {
              chain().setImage({ src, alt }).run();
              setBar(null);
            }}
          />
          {onUploadImage && (
            <label className="flex cursor-pointer items-center gap-2 border-b border-sand-400 bg-cream-50 px-3 py-2 text-sm text-gold-700">
              Or upload an image
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp,image/avif"
                className="text-xs"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  const url = await onUploadImage(file);
                  if (url) {
                    chain().setImage({ src: url, alt: "" }).run();
                    setBar(null);
                  }
                }}
              />
            </label>
          )}
        </>
      )}
      <EditorContent editor={editor} />
    </div>
  );
}
