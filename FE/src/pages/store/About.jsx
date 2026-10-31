import { Link } from "react-router";
import { Seo } from "../../components/Seo";
import { LotusDivider, SproutMark } from "../../components/ui/ornaments";
import { PathIcon } from "../../components/ui/icons";
import { ICONS } from "../../components/ui/icon-paths";
import { buttonVariants } from "../../components/ui/button-variants";
import { ArrowIcon } from "../../components/ui/button";
import { cn } from "../../lib/cn";
import { PROMISES, WHY_MANUSHYAM } from "../../data/content";
import { useAppearance } from "../../lib/appearance";

export default function About() {
  const hero = useAppearance("aboutHero");
  const pouch = useAppearance("aboutPouch");
  const lineup = useAppearance("aboutLineup");
  return (
    <>
      <Seo title="About ManushyaM" description="ManushyaM is curatively prepared using a 5000-year-old KASHAYAM Ayurvedic process — rooted in Ayurveda, inspired by nature." path="/about" />

      <section className="mx-auto max-w-[1320px] px-4 pt-8 md:px-6">
        <div className="grid items-center gap-8 rounded-xl border border-sand-400 bg-grad-cream p-7 md:grid-cols-2 lg:p-14">
          <div className="flex flex-col items-center gap-[18px] text-center lg:px-10">
            <SproutMark className="h-[26px] w-10" />
            <span className="text-eyebrow uppercase text-cocoa-900">Our Philosophy</span>
            <h1 className="font-display text-[clamp(42px,4.8vw,66px)] leading-[1.05]">About ManushyaM</h1>
            <LotusDivider />
            <p className="max-w-[480px] text-left text-[17px] leading-[1.75]">
              ManushyaM is curatively prepared using a 5000-year-old KASHAYAM Ayurvedic process. We offer the purest, natural solution that aims to enhance yourself, encouraging you to embrace a radiant and healthier you.
            </p>
            <div className="mt-1.5 flex flex-wrap justify-center gap-3.5">
              <Link to="/solutions?for=men" className={buttonVariants({ variant: "goldSm" })}>
                Shop Men
                <ArrowIcon />
              </Link>
              <Link to="/solutions?for=women" className={buttonVariants({ variant: "goldSm" })}>
                Shop Women
                <ArrowIcon />
              </Link>
            </div>
          </div>
          <div className="overflow-hidden rounded-[160px_160px_20px_20px] border border-[#C9A063] shadow-lg">
            <img src={hero.src} alt={hero.alt} fetchPriority="high" className="aspect-[1/0.92] w-full object-cover" />
          </div>
        </div>
      </section>

      <section className="container-page grid items-center gap-14 pt-[88px] md:grid-cols-2">
        <img src={pouch.src} alt={pouch.alt} loading="lazy" className="aspect-[1.06/1] w-full rounded-[16px] border border-sand-400 object-cover" />
        <div className="flex flex-col gap-4">
          <span className="eyebrow">Our Story</span>
          <h2 className="text-[clamp(30px,3vw,42px)] leading-[1.15]">
            Rooted in Ayurveda.
            <br />
            Inspired by Nature.
          </h2>
          <LotusDivider />
          <p className="leading-[1.75]">ManushyaM is born from the timeless wisdom of Ayurveda and a deep respect for nature’s intelligence. Our journey began with a simple belief — that true care nurtures from the root.</p>
          <p className="leading-[1.75]">
            We blend ancient knowledge with modern understanding to craft therapies that honour your hair, your wellbeing, and our planet. Every formula is a tribute to mindful living, sustainable choices, and generations of holistic healing.
          </p>
        </div>
      </section>

      <section aria-labelledby="why-title" className="container-page pt-[88px]">
        <h2 id="why-title" className="mb-8 text-center font-sans text-sm font-semibold uppercase tracking-[0.18em] text-gold-700">
          Why ManushyaM
        </h2>
        <ul className="grid grid-cols-2 gap-y-6 md:grid-cols-3 lg:grid-cols-5">
          {WHY_MANUSHYAM.map((w, i) => (
            <li key={w.title} className={cn("flex flex-col items-center gap-2.5 px-[18px] text-center", i < WHY_MANUSHYAM.length - 1 && "lg:border-r lg:border-sand-400")}>
              <span className="flex h-[68px] w-[68px] items-center justify-center rounded-full border border-sand-500 bg-cream-50 text-gold-600">
                <PathIcon d={w.icon} size={30} />
              </span>
              <h3 className="mt-1 text-lg">{w.title}</h3>
              <p className="text-sm leading-normal text-ink-500">{w.sub}</p>
            </li>
          ))}
        </ul>
      </section>

      <section className="container-page pb-24 pt-[88px]">
        <div className="grid items-center gap-6 rounded-xl border border-sand-400 bg-grad-cream p-7 md:grid-cols-2 lg:p-14">
          <div className="flex flex-col gap-4">
            <span className="eyebrow">Our Promise</span>
            <h2 className="text-[clamp(30px,3vw,40px)]">Conscious. Creative. Caring.</h2>
            <p className="max-w-[440px] leading-[1.7]">We source ethically, blend mindfully and create therapies that honour your hair, your wellbeing and our planet.</p>
            <ul className="mt-1.5 flex flex-col gap-3 text-[15px] text-cocoa-900">
              {PROMISES.map((p) => (
                <li key={p} className="flex items-center gap-3">
                  <PathIcon d={ICONS.checkCircle} size={20} strokeWidth={1.6} className="text-gold-600" />
                  {p}
                </li>
              ))}
            </ul>
          </div>
          <img src={lineup.src} alt={lineup.alt} loading="lazy" className="w-full rounded-[14px]" />
        </div>
      </section>

      <section className="relative overflow-hidden bg-[#1E1206] px-6 py-[72px] text-center text-ivory">
        <SproutMark className="absolute -left-8 top-2.5 h-[200px] w-[200px] text-gold-500/20" strokeWidth={0.5} />
        <SproutMark className="absolute -bottom-10 -right-8 h-[200px] w-[200px] text-gold-500/20" strokeWidth={0.5} />
        <p className="relative mx-auto max-w-[900px] font-serif text-[clamp(22px,2.2vw,28px)] leading-normal">
          At ManushyaM, we don’t just create therapies.
          <br />
          <span className="text-[1.2em]">We preserve a legacy of healing, and share it with you.</span>
        </p>
        <SproutMark className="relative mx-auto mt-[22px] h-[26px] w-10 text-gold-500" />
      </section>
    </>
  );
}
