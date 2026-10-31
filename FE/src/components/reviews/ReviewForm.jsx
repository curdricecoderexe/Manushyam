import { useState } from "react";
import { Field } from "../ui/primitives";
import { Button } from "../ui/button";
import { StarInput } from "./Stars";
import { api } from "../../lib/api";

// Write or edit a verified-purchase review. `existing` switches it to edit mode.
export function ReviewForm({ orderNumber, product, existing, onSaved, onCancel }) {
  const [rating, setRating] = useState(existing?.rating ?? 0);
  const [title, setTitle] = useState(existing?.title ?? "");
  const [body, setBody] = useState(existing?.body ?? "");
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    const found = {};
    if (!rating) found.rating = "Choose a rating";
    if (body.trim().length < 10) found.body = "Tell us a little more (at least 10 characters)";
    setErrors(found);
    if (Object.keys(found).length) return;
    setBusy(true);
    try {
      const fields = { rating, body: body.trim(), ...(title.trim() ? { title: title.trim() } : {}) };
      const data = existing
        ? await api(`/api/reviews/${existing.id}`, { method: "PATCH", body: fields })
        : await api("/api/reviews", { method: "POST", body: { orderNumber, productSlug: product.slug, ...fields } });
      onSaved(data.review);
    } catch (err) {
      setErrors({ form: err.message, ...err.fieldErrors });
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-4" aria-label={`Review ${product.name}`}>
      <StarInput value={rating} onChange={setRating} error={errors.rating} />
      <Field label="Headline (optional)" maxLength={80} value={title} onChange={(e) => setTitle(e.target.value)} error={errors.title} />
      <Field
        as="textarea"
        label="Your review"
        required
        maxLength={1000}
        hint={`${body.length}/1000 · What changed for you? How do you use it?`}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        error={errors.body}
      />
      {errors.form && (
        <p role="alert" className="text-sm text-danger-600">
          {errors.form}
        </p>
      )}
      <div className="flex gap-3">
        <Button type="submit" variant="brown" size="sm" disabled={busy}>
          {busy ? "Saving…" : existing ? "Save changes" : "Submit review"}
        </Button>
        {onCancel && (
          <Button variant="outline" size="sm" onClick={onCancel}>
            Cancel
          </Button>
        )}
      </div>
    </form>
  );
}
