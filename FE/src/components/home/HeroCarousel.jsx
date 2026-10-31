import { useEffect, useState } from "react";
import { Link } from "react-router";
import { Pause, Play } from "lucide-react";
import { cn } from "../../lib/cn";
import { usePrefersReducedMotion } from "../../hooks/useMediaQuery";
import { buttonVariants } from "../ui/button-variants";
import { ArrowIcon } from "../ui/button";
import { responsiveImage } from "../../lib/images";

const INTERVAL_MS = 6000;

// Shown when no slide is live (none created, all paused or scheduled) so the page never loses its hero.
const DEFAULT_SLIDES = [
  {
    id: "default",
    title: "Rooted in\nRitual.",
    subtitle: "Ayurvedic anti-hair-fall therapy for healthier, fuller-looking hair.",
    image: { url: "/images/content/hero-man.jpg", alt: "Smiling man with full, thick hair" },
    cta: { label: "Shop Therapy", href: "/solutions" },
    secondaryCta: { label: "Our Philosophy", href: "/about" },
  },
];

// Dark full-bleed hero inside a gold hairline frame (getdesign.md §8.1, §7.16, §10).
export function HeroCarousel({ slides: liveSlides, subline }) {
  const slides = liveSlides?.length ? liveSlides : DEFAULT_SLIDES;
  const reducedMotion = usePrefersReducedMotion();
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false); // user pressed pause
  const [hovering, setHovering] = useState(false); // hover or keyboard focus inside
  const count = slides.length;
  const autoplay = count > 1 && !reducedMotion && !paused && !hovering;

  useEffect(() => {
    if (!autoplay) return undefined;
    const t = setInterval(() => setIndex((i) => (i + 1) % count), INTERVAL_MS);
    return () => clearInterval(t);
  }, [autoplay, count]);

  const slide = slides[Math.min(index, count - 1)];

  return (
    <section
      aria-roledescription="carousel"
      aria-label="Featured"
      className="bg-cocoa-950 px-4 pb-[140px] pt-6 md:px-6"
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
      onFocus={() => setHovering(true)}
      onBlur={(e) => !e.currentTarget.contains(e.relatedTarget) && setHovering(false)}
    >
      <div className="relative mx-auto grid min-h-[600px] max-w-[1320px] overflow-hidden rounded-xl border border-[#C9A063]/55 bg-grad-hero md:grid-cols-2">
        <div className="relative z-[1] flex flex-col justify-center gap-6 px-6 py-10 sm:px-10 lg:px-[72px] lg:py-[88px]" aria-live={autoplay ? "off" : "polite"}>
          {(slide.eyebrow || subline) && (
            <span className="self-start rounded-sm border border-gold-400/50 px-3 py-[7px] text-xs font-semibold uppercase tracking-[0.18em] text-gold-400">{slide.eyebrow || subline}</span>
          )}
          <h1 key={`h-${index}`} className="animate-fade-up whitespace-pre-line font-display text-display-xl text-ivory">
            {slide.title}
          </h1>
          {slide.subtitle && <p className="max-w-[460px] text-[clamp(17px,1.6vw,22px)] leading-normal text-[#E9DEC9]">{slide.subtitle}</p>}
          <div className="mt-2 flex flex-col items-start gap-[26px]">
            {slide.cta && (
              <Link to={slide.cta.href} className={buttonVariants({ variant: "gold", size: "lg" })}>
                {slide.cta.label}
                <ArrowIcon />
              </Link>
            )}
            {slide.secondaryCta && (
              <Link to={slide.secondaryCta.href} className={cn(buttonVariants({ variant: "linkLight" }), "ml-1 text-[15px]")}>
                {slide.secondaryCta.label}
              </Link>
            )}
          </div>
        </div>

        <div className="relative min-h-[420px]">
          {slides.map((s, i) => (
            <div
              key={s.id ?? i}
              aria-hidden={i !== index}
              className={cn("absolute inset-0 transition-opacity duration-[900ms] ease-brand", i === index ? "opacity-100" : "opacity-0")}
            >
              <img
                {...responsiveImage(s.image.url, "hero", "(min-width: 768px) 50vw, 100vw")}
                alt={i === index ? s.image.alt : ""}
                fetchPriority={i === 0 ? "high" : undefined}
                loading={i === 0 ? "eager" : "lazy"}
                style={{ objectPosition: s.imagePosition || "center" }}
                className={cn("h-full w-full object-cover", !reducedMotion && i === index && "animate-kenburns")}
              />
            </div>
          ))}
          <div className="absolute inset-0 bg-gradient-to-r from-cocoa-950 to-transparent to-35% max-md:bg-gradient-to-t max-md:to-50%" aria-hidden="true" />
          {count > 1 && (
            <div className="absolute bottom-[26px] right-7 flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setPaused((p) => !p)}
                aria-label={paused ? "Play slideshow" : "Pause slideshow"}
                className="mr-1 flex h-7 w-7 items-center justify-center rounded-full text-white/85 hover:text-white"
              >
                {paused ? <Play className="h-3.5 w-3.5" /> : <Pause className="h-3.5 w-3.5" />}
              </button>
              <div role="group" aria-label="Choose slide" className="flex gap-1.5">
                {slides.map((s, i) => (
                  <button key={s.id ?? i} type="button" aria-label={`Show slide ${i + 1} of ${count}`} aria-current={i === index ? "true" : undefined} onClick={() => setIndex(i)} className="flex h-7 w-7 items-center justify-center">
                    <span className={cn("block h-2.5 w-2.5 rounded-full", i === index ? "bg-gold-500" : "bg-white/85")} />
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
