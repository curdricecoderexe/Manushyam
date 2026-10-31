import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { Seo } from "../../components/Seo";
import { Card } from "../../components/ui/primitives";
import { SproutMark } from "../../components/ui/ornaments";
import { buttonVariants } from "../../components/ui/button-variants";
import { api } from "../../lib/api";

const COPY = {
  confirm: { title: "Confirm subscription", busy: "Confirming your subscription…", done: "You’re subscribed", doneBody: "Thank you for joining us. Look out for Ayurvedic hair-care guides and the occasional offer." },
  unsubscribe: { title: "Unsubscribe", busy: "Unsubscribing…", done: "You’ve been unsubscribed", doneBody: "You won’t receive any more newsletters from us. You can subscribe again anytime from our website." },
};

// Landing page for the links in newsletter emails: /newsletter/confirm?token=… and /newsletter/unsubscribe?e=…&t=…
export default function Newsletter({ mode }) {
  const [params] = useSearchParams();
  const [state, setState] = useState({ status: "busy", message: "" });
  const copy = COPY[mode];
  const token = params.get("token");
  const e = params.get("e");
  const t = params.get("t");

  useEffect(() => {
    let cancelled = false;
    const request = mode === "confirm" ? api("/api/newsletter/confirm", { method: "POST", auth: false, body: { token: token ?? "" } }) : api("/api/newsletter/unsubscribe", { method: "POST", auth: false, body: { e: e ?? "", t: t ?? "" } });
    request
      .then(() => !cancelled && setState({ status: "done", message: "" }))
      .catch((err) => !cancelled && setState({ status: "error", message: err.code === "VALIDATION_ERROR" ? "This link is invalid or incomplete." : err.message }));
    return () => {
      cancelled = true;
    };
  }, [mode, token, e, t]);

  return (
    <div className="container-page flex justify-center py-16">
      <Seo title={copy.title} noindex />
      <Card className="flex w-full max-w-[520px] flex-col items-center gap-4 bg-grad-cream p-10 text-center">
        <SproutMark className="h-8 w-12" />
        <div role="status" className="flex flex-col gap-3">
          {state.status === "busy" && <p>{copy.busy}</p>}
          {state.status === "done" && (
            <>
              <h1 className="text-[32px]">{copy.done}</h1>
              <p>{copy.doneBody}</p>
            </>
          )}
          {state.status === "error" && (
            <>
              <h1 className="text-[32px]">Something’s not right</h1>
              <p>{state.message}</p>
            </>
          )}
        </div>
        <Link to="/blog" className={buttonVariants({ variant: "brown", size: "sm" })}>
          Read the blog
        </Link>
      </Card>
    </div>
  );
}
