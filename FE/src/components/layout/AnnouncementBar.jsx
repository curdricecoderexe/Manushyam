import { useEffect, useState } from "react";
import { Truck, Banknote, Lock, Package } from "lucide-react";
import { ANNOUNCEMENTS } from "../../data/site";

const ICONS = { truck: Truck, cash: Banknote, lock: Lock, box: Package };
const ROTATE_MS = 4000;

function Item({ icon, text }) {
  const Icon = ICONS[icon];
  return (
    <>
      <Icon className="h-4 w-4 shrink-0 text-gold-400" strokeWidth={1.7} aria-hidden="true" />
      <span className="truncate">{text}</span>
    </>
  );
}

// Phones get one message at a time (rotating, unless reduced motion is preferred) instead of four
// wrapped lines pushing the page down; tablets and up show the full row.
export function AnnouncementBar() {
  const [index, setIndex] = useState(0);
  useEffect(() => {
    const narrow = window.matchMedia?.("(max-width: 767px)");
    const still = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    if (!narrow?.matches || still?.matches || ANNOUNCEMENTS.length < 2) return undefined;
    const t = setInterval(() => setIndex((i) => (i + 1) % ANNOUNCEMENTS.length), ROTATE_MS);
    return () => clearInterval(t);
  }, []);
  const current = ANNOUNCEMENTS[index];

  return (
    <div className="bg-cocoa-800 px-4 py-2 text-[13px] font-medium text-cream-200 md:py-2.5">
      <p className="flex min-h-5 items-center justify-center gap-2 md:hidden" aria-hidden="true" key={current.text}>
        <Item {...current} />
      </p>
      <ul className="hidden flex-wrap items-center justify-center gap-x-7 gap-y-1.5 md:flex max-md:sr-only" aria-label="Store highlights">
        {ANNOUNCEMENTS.map(({ icon, text }, i) => (
          <li key={text} className="flex items-center gap-2">
            {i > 0 && <span className="mr-5 opacity-35" aria-hidden="true">|</span>}
            <Item icon={icon} text={text} />
          </li>
        ))}
      </ul>
    </div>
  );
}
