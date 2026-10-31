import { useId, useState } from "react";
import { Button } from "../ui/button";
import { api } from "../../lib/api";
import { cn } from "../../lib/cn";

// Double opt-in signup: the API emails a confirmation link; nothing is sent until it's clicked.
// `stacked` puts the button under the input (narrow sidebars); default joins them (getdesign §6).
export function NewsletterForm({ source = "other", stacked = false, className }) {
  const id = useId();
  const [email, setEmail] = useState("");
  const [website, setWebsite] = useState(""); // honeypot
  const [status, setStatus] = useState({ state: "idle", message: "" });

  async function onSubmit(e) {
    e.preventDefault();
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) return setStatus({ state: "error", message: "Please enter a valid email address." });
    setStatus({ state: "busy", message: "" });
    try {
      const res = await api("/api/newsletter/subscribe", { method: "POST", auth: false, body: { email: email.trim(), source, ...(website ? { website } : {}) } });
      setStatus({ state: "done", message: res.message });
      setEmail("");
    } catch (err) {
      setStatus({ state: "error", message: err.code === "RATE_LIMITED" ? "Too many attempts — please try again later." : err.message });
    }
    return undefined;
  }

  return (
    <form onSubmit={onSubmit} noValidate className={cn("flex flex-col gap-2", className)}>
      <label htmlFor={`${id}-email`} className="sr-only">
        Email address
      </label>
      {/* Hidden from people and assistive tech; bots fill it in. */}
      <input type="text" name="website" tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} className="hidden" aria-hidden="true" />
      <div className={cn(stacked ? "flex flex-col gap-2.5" : "flex h-12")}>
        <input
          id={`${id}-email`}
          type="email"
          autoComplete="email"
          placeholder="Enter your email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          aria-invalid={status.state === "error" ? "true" : undefined}
          aria-describedby={`${id}-status`}
          className={cn(
            "min-w-0 border border-sand-400 bg-white px-3.5 text-sm text-cocoa-900 focus:border-gold-600 focus:outline-none focus:ring-[3px] focus:ring-gold-500/20",
            stacked ? "h-11 rounded-md" : "flex-1 rounded-l-md border-r-0"
          )}
        />
        <Button type="submit" variant="brown" disabled={status.state === "busy"} className={cn(stacked ? "min-h-11 w-full" : "min-h-0 rounded-l-none px-5")}>
          {status.state === "busy" ? "Subscribing…" : "Subscribe"}
        </Button>
      </div>
      <p id={`${id}-status`} role="status" className="min-h-[1rem] text-xs">
        {status.state === "done" && <span className="text-leaf-800">{status.message}</span>}
        {status.state === "error" && <span className="text-danger-600">{status.message}</span>}
      </p>
    </form>
  );
}
