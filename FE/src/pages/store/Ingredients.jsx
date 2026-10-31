import { Link } from "react-router";
import { Seo } from "../../components/Seo";
import { SectionTitle } from "../../components/ui/ornaments";
import { PathIcon } from "../../components/ui/icons";
import { buttonVariants } from "../../components/ui/button-variants";
import { ArrowIcon } from "../../components/ui/button";
import { cn } from "../../lib/cn";
import { DHT_FEATURES, EXTRACTS, HOW_IT_WORKS_BENEFITS, HOW_IT_WORKS_STEPS, OILS, SHOP_BY_CONCERN, SUPPORT_INGREDIENTS } from "../../data/content";

function Follicle({ ring, dot }) {
  return (
    <svg width="120" height="120" viewBox="0 0 120 120" aria-hidden="true">
      <circle cx="60" cy="60" r="56" fill="#2B1D10" stroke={ring} strokeWidth="2" />
      <path d="M60 98V40c0-10 6-18 12-22" stroke="#0C0805" strokeWidth="7" fill="none" strokeLinecap="round" />
      {[
        [40, 50, 3],
        [80, 44, 3],
        [46, 76, 3.5],
        [78, 72, 3],
        [36, 64, 2.5],
        [86, 60, 2.5],
      ].map(([cx, cy, r]) => (
        <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r={r} fill={dot} />
      ))}
    </svg>
  );
}

function DhtIllustration({ blocked }) {
  return (
    <svg viewBox="0 0 160 170" className="w-full rounded-[10px] bg-[#F5E3CF]" role="img" aria-label={blocked ? "Ginseng shield protecting a healthy follicle" : "DHT molecules shrinking a hair follicle"}>
      <rect x="0" y="80" width="160" height="90" fill="#E9A07A" />
      <rect x="0" y="80" width="160" height="10" fill="#D98761" />
      <path d={blocked ? "M80 160c-12-12-10-34 0-46" : "M80 160c-8-10-6-30 0-46"} stroke="#5A2E14" strokeWidth={blocked ? 14 : 10} fill="none" strokeLinecap="round" />
      <path d="M80 114c4-30 14-60 34-100" stroke="#1E1206" strokeWidth={blocked ? 7 : 5} fill="none" strokeLinecap="round" />
      {blocked ? (
        <>
          <path d="M98 96l18-6 18 6v12c0 12-8 20-18 24-10-4-18-12-18-24z" fill="#1E5C36" />
          <path d="M116 98c-6 6-6 14 0 22M116 110c5-3 8-6 10-10" stroke="#FFFFFF" strokeWidth="2" fill="none" />
          <circle cx="40" cy="40" r="5" fill="#5E8B4A" />
          <circle cx="30" cy="62" r="4" fill="#5E8B4A" />
        </>
      ) : (
        [
          [40, 40, 6],
          [58, 22, 5],
          [34, 70, 5],
          [110, 70, 5],
        ].map(([cx, cy, r]) => <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r={r} fill="#B07A2E" />)
      )}
    </svg>
  );
}

const imageWell = "flex items-center justify-center rounded-full border border-sand-400 bg-[radial-gradient(circle_at_35%_30%,#FFFFFF_0%,#F1E4D0_80%)]";

export default function Ingredients() {
  return (
    <>
      <Seo title="How it Works & Ingredients" description="How ManushyaM works: a natural DHT blocker from Ginseng, 3 powerful extracts and 4 nourishing oils for reduced hair fall." path="/ingredients" />

      <div className="container-page flex flex-col gap-[72px] pb-24 pt-10">
        <section aria-labelledby="how-title" className="flex flex-wrap items-center gap-9 rounded-[22px] xl:flex-nowrap border border-[#C9A063]/45 bg-[#161210] p-7 text-ivory shadow-lg lg:p-12">
          <div className="flex flex-[1_1_200px] flex-col gap-4">
            <h1 id="how-title" className="text-[clamp(30px,3vw,40px)] leading-[1.15] text-ivory">
              How
              <br />
              ManushyaM™ Works
            </h1>
            <p className="text-[15px] text-[#E9DEC9]">For reduced hair fall in just 1 oil shot.</p>
            <a href="#dht" className={cn(buttonVariants({ variant: "gold", size: "md" }), "self-start text-[13px] tracking-[0.14em]")}>
              Explore the science
              <ArrowIcon />
            </a>
          </div>
          <ol className="grid flex-[3_1_400px] gap-5 sm:grid-cols-3">
            {HOW_IT_WORKS_STEPS.map((s) => (
              <li key={s.n} className="flex flex-col items-center gap-2.5 text-center">
                <div className="relative h-[120px] w-[120px]">
                  <span className="absolute -top-1.5 left-1.5 z-[1] flex h-[30px] w-[30px] items-center justify-center rounded-full bg-gold-500 text-sm font-semibold text-[#1E1206]">{s.n}</span>
                  <Follicle ring={s.ring} dot={s.dot} />
                </div>
                <span className="font-serif text-[17px] text-gold-400">{s.title}</span>
                <span className="text-[13px] leading-normal text-[#E9DEC9]">{s.sub}</span>
              </li>
            ))}
          </ol>
          <ul className="flex flex-[1_1_250px] flex-col gap-[18px]">
            {HOW_IT_WORKS_BENEFITS.map((b) => (
              <li key={b.title} className="flex items-start gap-3.5">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-gold-500/70 text-gold-500">
                  <PathIcon d={b.icon} size={20} strokeWidth={1.5} />
                </span>
                <span className="flex flex-col gap-[3px]">
                  <strong className="font-serif text-base font-normal text-gold-400">{b.title}</strong>
                  <span className="text-[13px] leading-normal text-[#E9DEC9]">{b.sub}</span>
                </span>
              </li>
            ))}
          </ul>
        </section>

        <section id="dht" aria-labelledby="dht-title" className="flex scroll-mt-28 flex-wrap gap-8 rounded-[16px] border border-sand-400 bg-cream-50 p-6 lg:p-11">
          <div className="flex flex-[1_1_440px] flex-col gap-3.5">
            <h2 id="dht-title" className="font-poster text-[clamp(40px,4vw,56px)] font-semibold leading-none tracking-[0.01em] text-[#0F0B08]">
              DHT BLOCKER
            </h2>
            <p className="font-serif text-[22px] text-gold-700">Adaptogenic support from Ginseng Root Extract</p>
            <p className="max-w-[480px] leading-[1.7]">Ginseng adaptogens help support the scalp’s natural defence against DHT — promoting stronger-looking hair from the roots.</p>
            <ul className="mt-[18px] grid grid-cols-2 gap-[18px] sm:grid-cols-4">
              {DHT_FEATURES.map((d) => (
                <li key={d.title} className="flex flex-col items-center gap-2 text-center">
                  <span className="flex h-[60px] w-[60px] items-center justify-center rounded-full border border-sand-500 text-gold-600">
                    <PathIcon d={d.icon} size={28} />
                  </span>
                  <span className="font-serif text-sm leading-snug text-cocoa-900">{d.title}</span>
                  <span className="text-xs leading-snug text-ink-500">{d.sub}</span>
                </li>
              ))}
            </ul>
          </div>
          <figure className="flex flex-[1_1_380px] flex-col gap-3.5 rounded-[14px] border border-sand-400 bg-cream-100 p-5">
            <figcaption className="text-center font-serif text-base uppercase tracking-[0.08em] text-cocoa-900">How DHT affects hair follicles</figcaption>
            <div className="grid grid-cols-2 gap-3.5">
              {[
                [false, "Before: DHT attacks", "DHT binds to follicles and can shrink the root, leading to weaker, thinner hair."],
                [true, "After: DHT blocked", "Ginseng adaptogens help support natural protection against DHT, helping maintain healthier follicles."],
              ].map(([blocked, label, caption]) => (
                <div key={label} className="flex flex-col gap-2">
                  <span className="text-xs font-semibold uppercase tracking-[0.1em] text-gold-700">{label}</span>
                  <DhtIllustration blocked={blocked} />
                  <span className="text-xs leading-snug text-ink-700">{caption}</span>
                </div>
              ))}
            </div>
          </figure>
        </section>

        <section aria-labelledby="concern-title">
          <SectionTitle className="mb-8">
            <span id="concern-title">Shop by Concern</span>
          </SectionTitle>
          <ul className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6">
            {SHOP_BY_CONCERN.map((c) => (
              <li key={c.title} className="flex flex-col items-center gap-2.5 rounded-lg border border-sand-400 bg-cream-50 px-4 py-[22px] text-center">
                <PathIcon d={c.icon} size={56} strokeWidth={1} className="text-cocoa-900" />
                <h3 className="whitespace-pre-line text-lg leading-tight">{c.title}</h3>
                <p className="flex-1 text-[13px] leading-normal text-ink-500">{c.sub}</p>
                <Link
                  to={c.to}
                  aria-label={`Shop now — ${c.title.replace("\n", " ")}`}
                  className={cn(buttonVariants({ variant: "brown", size: "sm" }), "min-h-[40px] gap-2 px-4 font-sans text-xs font-medium uppercase tracking-[0.12em]")}
                >
                  Shop now
                  <ArrowIcon className="w-3.5" />
                </Link>
              </li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="ing-title" className="rounded-[16px] border border-sand-400 bg-cream-50 p-6 lg:p-11">
          <h2 id="ing-title" className="mb-7 text-center text-[32px]">
            Ingredients for Reduced Hair Fall
          </h2>
          <div className="flex flex-wrap gap-8">
            <div className="flex-[3_1_380px]">
              <h3 className="mb-5 text-center text-xl">3 Powerful Extracts</h3>
              <ul className="grid gap-5 sm:grid-cols-3">
                {EXTRACTS.map((e) => (
                  <li key={e.name} className="flex flex-col items-center gap-2 text-center">
                    <span className={cn(imageWell, "h-[104px] w-[104px]")} style={{ color: e.stroke }}>
                      <PathIcon d={e.icon} size={60} fill={e.fill} strokeWidth={0.8} />
                    </span>
                    <span className="font-serif text-base text-cocoa-900">{e.name}</span>
                    <span className="text-[13px] leading-normal text-ink-700">{e.sub}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="flex-[4_1_440px] border-sand-400 lg:border-l lg:pl-6">
              <h3 className="mb-5 text-center text-xl">4 Nourishing Oils</h3>
              <ul className="grid grid-cols-2 gap-5 sm:grid-cols-4">
                {OILS.map((o) => (
                  <li key={o.name} className="flex flex-col items-center gap-2 text-center">
                    <span className={cn(imageWell, "h-24 w-24 text-[#2F5A2A]")}>
                      <PathIcon d={o.icon} size={52} fill={o.fill} strokeWidth={0.8} />
                    </span>
                    <span className="font-serif text-base text-cocoa-900">{o.name}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
          <h3 className="mb-4 mt-9 text-center text-[17px]">Key Support Ingredients</h3>
          <ul className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
            {SUPPORT_INGREDIENTS.map((s) => (
              <li key={s.name} className="flex items-start gap-3 rounded-[10px] border border-[#EFE3D1] bg-cream-100 p-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full font-serif text-base text-cocoa-900" style={{ background: s.tint }} aria-hidden="true">
                  {s.k}
                </span>
                <span className="flex flex-col gap-[3px]">
                  <strong className="font-serif text-[15px] font-normal text-cocoa-900">{s.name}</strong>
                  <span className="text-xs leading-snug text-ink-700">{s.sub}</span>
                </span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </>
  );
}
