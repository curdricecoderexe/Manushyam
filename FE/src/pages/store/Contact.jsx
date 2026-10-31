import { useState } from "react";
import { Link } from "react-router";
import { ChevronRight, Send } from "lucide-react";
import { Seo } from "../../components/Seo";
import { Card, Field } from "../../components/ui/primitives";
import { Button } from "../../components/ui/button";
import { WheatArrow } from "../../components/ui/ornaments";
import { PathIcon } from "../../components/ui/icons";
import { ICONS } from "../../components/ui/icon-paths";
import { Turnstile } from "../../components/engagement/Turnstile";
import { api } from "../../lib/api";
import { CONTACT } from "../../data/site";
import { cn } from "../../lib/cn";
import { useAppearance } from "../../lib/appearance";

const SUBJECTS = [
  ["orders", "Orders & shipping"],
  ["payments", "Payments & refunds"],
  ["products", "Products & usage"],
  ["returns", "Returns & cancellation"],
  ["account", "Account"],
  ["collaboration", "Collaboration"],
  ["other", "Something else"],
];

const WA_PATH = "M12 3a9 9 0 0 0-7.8 13.5L3 21l4.6-1.2A9 9 0 1 0 12 3zm4.4 12.4c-.2.5-1.1 1-1.6 1-.4.1-.9.1-1.5-.1-.3-.1-.8-.3-1.4-.5-2.4-1-4-3.5-4.1-3.6-.1-.2-1-1.3-1-2.5s.6-1.8.9-2c.2-.3.5-.3.6-.3h.5c.2 0 .4 0 .5.4l.7 1.7c.1.1.1.3 0 .4l-.3.4-.3.3c-.1.1-.2.3-.1.5.1.2.6 1 1.3 1.6.9.8 1.6 1 1.8 1.1.2.1.4.1.5-.1l.7-.8c.2-.2.3-.2.5-.1l1.6.8c.2.1.4.2.4.3.1.1.1.6-.1 1.1z";

const CARDS = [
  { title: "WhatsApp Support", sub: "Quickest way to get help", value: CONTACT.whatsappDisplay, href: `https://wa.me/${CONTACT.whatsapp}`, icon: WA_PATH, whatsapp: true },
  { title: "Email Support", sub: "Drop us an email", value: CONTACT.careEmail, href: `mailto:${CONTACT.careEmail}`, icon: "M3 6h18v12H3zM3 6l9 7 9-7" },
  { title: "Business Address", sub: "Bengaluru, Karnataka, India", value: "ManushyaM Wellness Pvt. Ltd.\n4th Floor, 12th Main, Indiranagar, Bengaluru, Karnataka – 560038", href: "https://maps.google.com/?q=Indiranagar+Bengaluru+560038", icon: "M12 21s7-6.2 7-12a7 7 0 0 0-14 0c0 5.8 7 12 7 12zM12 6.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5z" },
  { title: "Order Support", sub: "Help with orders & tracking", value: CONTACT.whatsappDisplay, href: "/track-order", icon: "M3 7l9-4 9 4v10l-9 4-9-4zM3 7l9 4 9-4M12 11v10" },
  { title: "Collaboration Queries", sub: "Partnerships & collaborations", value: CONTACT.helloEmail, href: `mailto:${CONTACT.helloEmail}`, icon: "M2 12l4-4 4 2 4-4 4 4 4-2M6 8l6 8 6-8" },
];

const QUICK = [
  ["orders", "Orders & Shipping", "M3 7l9-4 9 4v10l-9 4-9-4zM3 7l9 4 9-4M12 11v10"],
  ["payments", "Payments & Refunds", "M2 6h20v12H2zM2 10h20"],
  ["product", "Products & Usage", "M10 3h4v4l2 3v11H8V10l2-3z"],
  ["returns", "Returns & Cancellation", "M4 12a8 8 0 0 1 14-5l2 2M20 12a8 8 0 0 1-14 5l-2-2M20 4v5h-5M4 20v-5h5"],
  ["account", "Account & Others", "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0"],
];

const EMPTY = { fullName: "", email: "", phone: "", subject: "", message: "", website: "" };

function validate(v) {
  const e = {};
  if (v.fullName.trim().length < 2) e.fullName = "Enter your name";
  if (!/^\S+@\S+\.\S+$/.test(v.email.trim())) e.email = "Enter a valid email address";
  if (v.phone && !/^(\+?91|0)?[6-9]\d{9}$/.test(v.phone.replace(/[\s-]/g, ""))) e.phone = "Enter a valid 10-digit mobile number";
  if (!v.subject) e.subject = "Choose a topic";
  if (v.message.trim().length < 10) e.message = "Tell us a little more (at least 10 characters)";
  return e;
}

function ContactForm() {
  const [values, setValues] = useState(EMPTY);
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState("");
  const [token, setToken] = useState("");
  const [attempt, setAttempt] = useState(0); // remounts Turnstile for a fresh token after each submit
  const bind = (name) => ({ value: values[name], error: errors[name], onChange: (e) => setValues((v) => ({ ...v, [name]: e.target.value })) });

  async function submit(e) {
    e.preventDefault();
    const found = validate(values);
    setErrors(found);
    if (Object.keys(found).length) return;
    setBusy(true);
    try {
      const body = { ...values, fullName: values.fullName.trim(), message: values.message.trim(), ...(token ? { turnstileToken: token } : {}) };
      if (!body.phone) delete body.phone;
      if (!body.website) delete body.website;
      const res = await api("/api/contact", { method: "POST", auth: false, body });
      setSent(res.message);
      setValues(EMPTY);
    } catch (err) {
      setErrors({ form: err.code === "RATE_LIMITED" ? "You’ve sent several messages already — please try again in a little while, or WhatsApp us." : err.message, ...err.fieldErrors });
    } finally {
      setBusy(false);
      setToken("");
      setAttempt((n) => n + 1);
    }
  }

  if (sent) {
    return (
      <div role="status" className="flex flex-col items-center gap-3 py-10 text-center">
        <span className="flex h-14 w-14 items-center justify-center rounded-full bg-leaf-50 text-leaf-800">
          <PathIcon d={ICONS.checkCircle} size={28} strokeWidth={1.6} />
        </span>
        <p className="font-serif text-xl text-cocoa-900">Message sent</p>
        <p className="max-w-sm text-sm">{sent}</p>
        <Button variant="outline" size="sm" onClick={() => setSent("")}>
          Send another message
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={submit} noValidate aria-label="Send us a message" className="grid gap-4 sm:grid-cols-2">
      <Field label="Full Name" required autoComplete="name" {...bind("fullName")} />
      <Field label="Email Address" required type="email" autoComplete="email" {...bind("email")} />
      <div className="flex flex-col gap-2">
        <label htmlFor="contact-phone" className="text-sm font-medium text-cocoa-900">
          Phone Number <span className="font-normal text-ink-500">(optional)</span>
        </label>
        <div className={cn("flex h-[52px] overflow-hidden rounded-md border bg-white/70 focus-within:border-gold-600", errors.phone ? "border-danger-600" : "border-sand-400")}>
          <span className="flex items-center border-r border-sand-400 px-3 text-[15px] text-cocoa-900">+91</span>
          <input
            id="contact-phone"
            type="tel"
            inputMode="numeric"
            autoComplete="tel-national"
            placeholder="Enter your phone number"
            value={values.phone}
            onChange={(e) => setValues((v) => ({ ...v, phone: e.target.value }))}
            aria-invalid={errors.phone ? "true" : undefined}
            aria-describedby={errors.phone ? "contact-phone-error" : undefined}
            className="min-w-0 flex-1 bg-transparent px-3 text-[15px] focus:outline-none"
          />
        </div>
        {errors.phone && (
          <span id="contact-phone-error" role="alert" className="text-xs text-danger-600">
            {errors.phone}
          </span>
        )}
      </div>
      <Field as="select" label="Subject" required {...bind("subject")}>
        <option value="">Select a topic</option>
        {SUBJECTS.map(([id, label]) => (
          <option key={id} value={id}>
            {label}
          </option>
        ))}
      </Field>
      <Field as="textarea" label="Message" required maxLength={2000} placeholder="Type your message here…" className="sm:col-span-2" {...bind("message")} />
      {/* Honeypot — hidden from people, filled by bots. */}
      <input type="text" name="website" tabIndex={-1} autoComplete="off" value={values.website} onChange={(e) => setValues((v) => ({ ...v, website: e.target.value }))} className="hidden" aria-hidden="true" />
      <div className="sm:col-span-2">
        <Turnstile onToken={setToken} resetKey={attempt} />
      </div>
      {errors.form && (
        <p role="alert" className="text-sm text-danger-600 sm:col-span-2">
          {errors.form}
        </p>
      )}
      <div className="flex flex-col items-center gap-3 sm:col-span-2">
        <Button type="submit" variant="brown" disabled={busy}>
          {busy ? "Sending…" : "Send Message"}
          <Send className="h-4 w-4" aria-hidden="true" />
        </Button>
        <p className="flex items-center gap-1.5 text-xs text-ink-500">
          <PathIcon d={ICONS.lock} size={14} strokeWidth={1.6} />
          We respect your privacy. Your information is safe with us.
        </p>
      </div>
    </form>
  );
}

function CardTitle({ children, id }) {
  return (
    <div className="mb-5 flex items-center justify-center gap-3">
      <WheatArrow className="hidden w-8 sm:block" />
      <h2 id={id} className="text-[clamp(22px,2.2vw,28px)]">
        {children}
      </h2>
      <WheatArrow flip className="hidden w-8 sm:block" />
    </div>
  );
}

function ContactCard({ card }) {
  const external = !card.href.startsWith("/");
  const content = (
    <>
      <PathIcon d={card.icon} size={28} strokeWidth={card.whatsapp ? 0 : 1.4} fill={card.whatsapp ? "#25D366" : "none"} className={card.whatsapp ? "" : "text-gold-600"} />
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="font-serif text-[17px] text-cocoa-900">{card.title}</span>
        <span className="text-xs text-ink-500">{card.sub}</span>
        <span className="mt-1 whitespace-pre-line break-words text-[15px] text-cocoa-900">{card.value}</span>
      </span>
      <ChevronRight className="h-4 w-4 shrink-0 self-end text-gold-600" aria-hidden="true" />
    </>
  );
  const cls = "flex h-full gap-3 rounded-lg border border-sand-400 bg-white/70 p-4 transition hover:border-gold-600 hover:shadow-md";
  return external ? (
    <a href={card.href} target={card.href.startsWith("http") ? "_blank" : undefined} rel="noopener noreferrer" className={cls}>
      {content}
    </a>
  ) : (
    <Link to={card.href} className={cls}>
      {content}
    </Link>
  );
}

export default function Contact() {
  const lineup = useAppearance("contactHero");
  const pouch = useAppearance("contactPouch");
  return (
    <>
      <Seo title="Contact Us" description="We’re here to help on your journey to stronger, healthier hair. WhatsApp, email or send us a message." path="/contact" />

      <section className="bg-grad-cream">
        <div className="container-page grid items-center gap-8 py-10 md:grid-cols-[1fr_1.2fr]">
          <div className="flex flex-col gap-4">
            <h1 className="font-display text-[clamp(42px,5vw,64px)] leading-[1.05]">Contact Us</h1>
            <p className="max-w-[420px] text-[17px]">We’re here to help you on your journey to stronger, healthier, and more confident hair.</p>
          </div>
          <img src={lineup.src} alt={lineup.alt} fetchPriority="high" className="aspect-[1.6/1] w-full rounded-xl object-cover" />
        </div>
      </section>

      <div className="container-page flex flex-col gap-10 pb-24 pt-10">
        <div className="grid items-start gap-6 lg:grid-cols-2">
          <Card as="section" aria-labelledby="msg-title" className="p-6">
            <CardTitle id="msg-title">Send Us a Message</CardTitle>
            <ContactForm />
          </Card>
          <Card as="section" aria-labelledby="help-title" className="p-6">
            <CardTitle id="help-title">We’re Here to Help</CardTitle>
            <p className="mb-5 text-center text-sm">Reach out to us anytime through your preferred channel. Our team will get back to you as soon as possible.</p>
            <ul className="grid gap-3 sm:grid-cols-2">
              {CARDS.map((c) => (
                <li key={c.title}>
                  <ContactCard card={c} />
                </li>
              ))}
            </ul>
          </Card>
        </div>

        <ul aria-label="Why shop with us" className="grid grid-cols-2 gap-y-5 rounded-lg border border-sand-400 bg-cream-50 px-4 py-6 md:grid-cols-4">
          {[
            ["Shiprocket", "Reliable & Fast Shipping", ICONS.truck],
            ["Razorpay", "Secure Payments", ICONS.lock],
            ["COD Available", "Cash on Delivery", ICONS.cash],
            ["GST Invoice", "Invoice Available", ICONS.invoice],
          ].map(([title, sub, icon], i) => (
            <li key={title} className={cn("flex items-center justify-center gap-3 px-3", i < 3 && "md:border-r md:border-sand-400")}>
              <PathIcon d={icon} size={28} className="text-gold-600" />
              <span className="flex flex-col">
                <span className="font-serif text-[17px] text-cocoa-900">{title}</span>
                <span className="text-xs text-ink-500">{sub}</span>
              </span>
            </li>
          ))}
        </ul>

        <section aria-labelledby="quick-title" className="flex flex-col items-center gap-5">
          <div className="text-center">
            <div className="flex items-center justify-center gap-4">
              <WheatArrow className="hidden sm:block" />
              <h2 id="quick-title" className="text-[clamp(26px,2.6vw,34px)]">
                Quick Answers
              </h2>
              <WheatArrow flip className="hidden sm:block" />
            </div>
            <p className="text-sm text-ink-500">Find answers to common questions</p>
          </div>
          <ul className="grid w-full gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {QUICK.map(([topic, label, icon]) => (
              <li key={topic}>
                <Link to={`/faq?topic=${topic}`} className="flex min-h-14 items-center gap-3 rounded-lg border border-sand-400 bg-cream-50 px-4 text-sm text-cocoa-900 hover:border-gold-600 hover:text-cocoa-900">
                  <PathIcon d={icon} size={20} strokeWidth={1.5} className="text-gold-600" />
                  <span className="flex-1">{label}</span>
                  <ChevronRight className="h-4 w-4" aria-hidden="true" />
                </Link>
              </li>
            ))}
          </ul>
        </section>

        <section className="grid items-center gap-6 overflow-hidden rounded-xl border border-sand-400 bg-grad-cream md:grid-cols-2">
          <div className="flex flex-col items-center gap-3 p-8 text-center">
            <h2 className="text-[clamp(26px,2.6vw,34px)]">Still have questions?</h2>
            <p className="font-serif text-lg text-cocoa-900">We’d love to hear from you!</p>
            <p className="max-w-xs text-sm">Our team is here to support you on your hair care journey.</p>
            <a href={`https://wa.me/${CONTACT.whatsapp}`} target="_blank" rel="noopener noreferrer" className={cn("mt-2 inline-flex min-h-12 items-center gap-2.5 rounded-md bg-brown-700 px-6 font-serif text-white hover:bg-brown-800 hover:text-white")}>
              <PathIcon d={WA_PATH} size={20} fill="#fff" strokeWidth={0} />
              Chat on WhatsApp
            </a>
          </div>
          <img src={pouch.src} alt={pouch.alt} loading="lazy" className="h-full max-h-[320px] w-full object-cover" />
        </section>
      </div>
    </>
  );
}
