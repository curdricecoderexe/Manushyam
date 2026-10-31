import { useState } from "react";
import { ShoppingBag, Zap, ChevronRight, Droplet, Search } from "lucide-react";
import { Button, ArrowIcon } from "../components/ui/button";
import { Badge, Card, Field, QuantityStepper, RatingBadge, Skeleton, IconCircle, StatusPill, Eyebrow } from "../components/ui/primitives";
import { SectionTitle, LotusDivider, LineLabel } from "../components/ui/ornaments";
import { Seo } from "../components/Seo";

const SWATCHES = [
  ["Cocoa 950", "bg-cocoa-950", "#140D07"], ["Cocoa 900", "bg-cocoa-900", "#2A1608"], ["Cocoa 800", "bg-cocoa-800", "#4E2C0C"],
  ["Brown 700", "bg-brown-700", "#7A3A12"], ["Gold 700", "bg-gold-700", "#8E5A1C"], ["Gold 600", "bg-gold-600", "#A8722A"],
  ["Gold 500", "bg-gold-500", "#C9944A"], ["Gold 300", "bg-gold-300", "#E3C9A0"], ["Leaf 800", "bg-leaf-800", "#1E5C36"],
  ["Cream 50", "bg-cream-50", "#FDF9F3"], ["Cream 100", "bg-cream-100", "#FBF6EE"], ["Cream 200", "bg-cream-200", "#F7EFE3"],
  ["Sand 400", "bg-sand-400", "#E6D5BD"], ["Ink 700", "bg-ink-700", "#4A3F36"], ["Ink 500", "bg-ink-500", "#7A6C60"], ["Danger", "bg-danger-600", "#A3341F"],
];

// Dev-only visual QA page (plan M1 exit gate): every token and component in one place.
export default function Styleguide() {
  const [qty, setQty] = useState(1);
  return (
    <div className="container-page flex flex-col gap-16 py-12">
      <Seo title="Styleguide" noindex />
      <header className="flex flex-col gap-3">
        <Eyebrow>getdesign.md · v1</Eyebrow>
        <h1 className="font-display text-display-lg">ManushyaM Design System</h1>
      </header>

      <section aria-labelledby="sg-colour" className="flex flex-col gap-5">
        <h2 id="sg-colour" className="text-3xl">Colour</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-8">
          {SWATCHES.map(([name, cls, hex]) => (
            <div key={name} className="overflow-hidden rounded-lg border border-sand-400 bg-white">
              <div className={`h-16 ${cls}`} />
              <div className="p-2 text-xs"><strong className="block text-cocoa-900">{name}</strong><code>{hex}</code></div>
            </div>
          ))}
        </div>
      </section>

      <section aria-labelledby="sg-type" className="flex flex-col gap-4">
        <h2 id="sg-type" className="text-3xl">Typography</h2>
        <p className="font-display text-display-xl text-cocoa-900">Rooted in Ritual.</p>
        <p className="text-[44px] font-serif leading-tight text-cocoa-900">Men Anti-Hairfall Therapy</p>
        <p className="font-serif text-[38px] font-bold text-brown-700">₹499</p>
        <p className="font-poster text-[56px] leading-none text-[#0F0B08]">DHT BLOCKER</p>
        <p className="max-w-2xl text-lg">Ayurvedic anti-hair-fall therapy for stronger, healthier hair — crafted with the 5000-year-old KASHAYAM process.</p>
        <Eyebrow>Our Philosophy</Eyebrow>
      </section>

      <section aria-labelledby="sg-buttons" className="flex flex-col gap-5">
        <h2 id="sg-buttons" className="text-3xl">Buttons</h2>
        <div className="flex flex-wrap items-center gap-6 rounded-lg bg-cocoa-950 p-6">
          <Button variant="gold" size="lg">Shop Therapy <ArrowIcon /></Button>
          <Button variant="linkLight">Our Philosophy</Button>
        </div>
        <div className="flex flex-wrap items-center gap-4">
          <Button variant="goldSm">Shop Men <ArrowIcon className="w-4" /></Button>
          <Button variant="brown" size="lg"><ShoppingBag className="h-5 w-5" strokeWidth={1.6} />Add to Cart</Button>
          <Button variant="green" size="lg"><Zap className="h-5 w-5 fill-gold-500 text-gold-500" />Buy Now</Button>
          <Button variant="outline">Read More <ArrowIcon className="w-4" /></Button>
          <Button variant="arrow">Shop Now <ArrowIcon /></Button>
          <Button variant="link">Learn More</Button>
          <Button variant="icon" size="icon" aria-label="Next"><ChevronRight className="h-5 w-5" /></Button>
          <Button variant="chip">Orders &amp; Shipping <ChevronRight className="h-4 w-4" /></Button>
          <Button variant="ghost" size="icon" aria-label="Search"><Search strokeWidth={1.6} /></Button>
          <Button variant="danger">Delete</Button>
          <Button variant="brown" disabled>Disabled</Button>
        </div>
      </section>

      <section aria-labelledby="sg-forms" className="flex flex-col gap-5">
        <h2 id="sg-forms" className="text-3xl">Forms</h2>
        <Card className="grid gap-5 p-6 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Full name" placeholder="Your name" required />
          <Field label="PIN code" defaultValue="56003" error="Enter a 6-digit PIN code" />
          <Field label="Email" type="email" hint="We’ll send your order updates here." />
          <Field as="textarea" label="Message" placeholder="Type your message here…" className="sm:col-span-2" />
          <div className="flex flex-col gap-2"><span className="text-sm font-medium text-cocoa-900">Quantity</span><QuantityStepper value={qty} onChange={setQty} /></div>
        </Card>
      </section>

      <section aria-labelledby="sg-misc" className="flex flex-col gap-6">
        <h2 id="sg-misc" className="text-3xl">Ornaments, badges &amp; states</h2>
        <SectionTitle subtitle="Real stories. Real results.">You May Also Like</SectionTitle>
        <LotusDivider />
        <LineLabel>The ManushyaM Ritual</LineLabel>
        <div className="flex flex-wrap items-center gap-4">
          <Badge>Bestseller</Badge>
          <RatingBadge />
          <IconCircle><Droplet className="h-7 w-7" strokeWidth={1.4} /></IconCircle>
          <StatusPill tone="amber">Payment pending</StatusPill>
          <StatusPill tone="blue">Shipped</StatusPill>
          <StatusPill tone="purple">Packed</StatusPill>
          <StatusPill tone="green">Delivered</StatusPill>
          <StatusPill tone="red">RTO</StatusPill>
          <StatusPill tone="grey">Refunded</StatusPill>
        </div>
        <div className="grid gap-3 sm:grid-cols-3"><Skeleton className="h-40" /><Skeleton className="h-40" /><Skeleton className="h-40" /></div>
      </section>
    </div>
  );
}
