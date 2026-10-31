import { useEffect, useRef, useState } from "react";
import logo from "../../assets/brand/logo.png";
import { isCrawler } from "../../lib/crawler";

export const INTRO_KEY = "mm_intro_seen";
const SHOW_MS = 3000;
const GLIDE_MS = 700;

function alreadySeen() {
  try {
    return sessionStorage.getItem(INTRO_KEY) === "1";
  } catch {
    return false;
  }
}

function prefersReducedMotion() {
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
}

// Full-screen logo intro shown once per browser session (design slide 1):
// the mark pulses with the "H" highlighted, then the logo glides into the header position.
export function IntroLoader() {
  const [phase, setPhase] = useState(() => (alreadySeen() || isCrawler() ? "done" : "show"));
  const [glide, setGlide] = useState(null);
  const logoRef = useRef(null);

  useEffect(() => {
    if (phase !== "show") return undefined;
    document.body.style.overflow = "hidden";
    const reduced = prefersReducedMotion();
    const t = setTimeout(() => {
      try {
        sessionStorage.setItem(INTRO_KEY, "1");
      } catch {
        /* storage unavailable — the intro simply shows again next load */
      }
      const target = document.querySelector("[data-brand-logo] img");
      const from = logoRef.current?.getBoundingClientRect();
      if (!reduced && target && from) {
        const to = target.getBoundingClientRect();
        const scale = to.height / from.height;
        setGlide({
          transform: `translate(${to.left - from.left + (to.width - from.width) / 2}px, ${to.top - from.top + (to.height - from.height) / 2}px) scale(${scale})`,
        });
      }
      setPhase("glide");
    }, reduced ? 600 : SHOW_MS);
    return () => clearTimeout(t);
  }, [phase]);

  useEffect(() => {
    if (phase !== "glide") return undefined;
    const t = setTimeout(() => {
      document.body.style.overflow = "";
      setPhase("done");
    }, GLIDE_MS);
    return () => clearTimeout(t);
  }, [phase]);

  if (phase === "done") return null;

  return (
    <div
      role="status"
      aria-label="Loading ManushyaM"
      className="fixed inset-0 z-[100] flex flex-col items-center justify-center transition-[background-color,opacity] duration-700 ease-brand"
      style={{
        background: phase === "glide" ? "transparent" : "radial-gradient(70% 60% at 50% 42%, #FFFDF8 0%, #FBF6EE 55%, #F4E8D6 100%)",
        pointerEvents: phase === "glide" ? "none" : "auto",
      }}
    >
      <div className="relative">
        <span
          aria-hidden="true"
          className="absolute left-[54%] top-[8%] h-[70%] w-[38%] -translate-x-1/2 animate-gold-pulse rounded-full"
          style={{ background: "radial-gradient(circle, rgba(201,148,74,.4) 0%, rgba(201,148,74,0) 68%)", opacity: phase === "glide" ? 0 : undefined }}
        />
        <img
          ref={logoRef}
          src={logo}
          alt="ManushyaM"
          className="relative w-[min(78vw,560px)] origin-center transition-transform ease-brand"
          style={{ transitionDuration: `${GLIDE_MS}ms`, ...(glide ?? {}), opacity: phase === "glide" && !glide ? 0 : 1 }}
        />
      </div>
      <div className="mt-7 h-0.5 w-56 overflow-hidden rounded bg-[#EFE3D1]" aria-hidden="true" style={{ opacity: phase === "glide" ? 0 : 1 }}>
        <span className="block h-full animate-progress bg-gradient-to-r from-gold-500 to-gold-700" />
      </div>
      <p className="mt-5 font-serif text-xl italic text-gold-700 transition-opacity" style={{ opacity: phase === "glide" ? 0 : 1 }}>
        Rooted in Ritual.
      </p>
    </div>
  );
}
