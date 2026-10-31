import { useLayoutEffect, useRef, useState } from "react";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";

gsap.registerPlugin(useGSAP);

export { gsap, useGSAP };

// Brand ease (tailwind `ease-brand`) for Motion transitions.
export const EASE = [0.2, 0.7, 0.2, 1];

// Animate only when the browser positively reports no motion preference — reduced-motion users and jsdom (tests) get the final state at once.
export function canAnimate() {
  return typeof window !== "undefined" && Boolean(window.matchMedia?.("(prefers-reduced-motion: no-preference)").matches);
}

// Position of an element among its siblings (or its closest <li>'s), for staggering items that each animate themselves.
export function siblingIndex(el) {
  const item = el?.closest("li") ?? el;
  return item?.parentElement ? [...item.parentElement.children].indexOf(item) : 0;
}

const NUMBER = /\d[\d,]*(?:\.\d+)?/;

// Counts the first number inside a display string ("₹1,24,500", "3", "12.5%") up from its previous value with GSAP.
// React always renders the final text; the tween only paints in-between frames.
export function useCountUp(value, duration = 1.1) {
  const text = String(value ?? "");
  const [frame, setFrame] = useState(null);
  const last = useRef(0);

  useLayoutEffect(() => {
    const match = text.match(NUMBER);
    if (!match) return undefined;
    const raw = match[0];
    const target = Number(raw.replace(/,/g, ""));
    const from = last.current;
    last.current = target;
    if (!canAnimate() || from === target) return undefined;
    const decimals = raw.split(".")[1]?.length ?? 0;
    const format = (n) => (raw.includes(",") || n >= 1000 ? n.toLocaleString("en-IN", { minimumFractionDigits: decimals, maximumFractionDigits: decimals }) : n.toFixed(decimals));
    const state = { n: from };
    const paint = () => setFrame(text.replace(raw, format(state.n)));
    const tween = gsap.to(state, { n: target, duration, ease: "power3.out", onUpdate: paint, onComplete: () => setFrame(null) });
    paint();
    return () => {
      tween.kill();
      setFrame(null);
    };
  }, [text, duration]);

  return frame ?? text;
}

