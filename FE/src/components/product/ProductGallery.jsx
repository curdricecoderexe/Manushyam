import { useRef, useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "../../lib/cn";
import { Dialog } from "../ui/Dialog";
import { PathIcon } from "../ui/icons";
import { ICONS } from "../ui/icon-paths";
import { responsiveImage } from "../../lib/images";

const RAIL_VISIBLE = 5;

// Desktop: vertical thumbnail rail + main image with a Zoom chip. Mobile: swipeable main image with dots.
export function ProductGallery({ images, name, badge }) {
  const [index, setIndex] = useState(0);
  const [railStart, setRailStart] = useState(0);
  const [zoomed, setZoomed] = useState(false);
  const touchX = useRef(null);
  const count = images.length;
  const current = images[index] ?? images[0];

  const go = (i) => {
    const next = (i + count) % count;
    setIndex(next);
    if (next < railStart) setRailStart(next);
    if (next >= railStart + RAIL_VISIBLE) setRailStart(next - RAIL_VISIBLE + 1);
  };

  if (!current) return <div className="aspect-[1/1.1] rounded-lg border border-sand-400 bg-[#F4EADB]" />;

  return (
    <section aria-label="Product images" className="flex gap-4">
      {count > 1 && (
        <div className="hidden w-[84px] shrink-0 flex-col items-center gap-3 md:flex">
          {count > RAIL_VISIBLE && (
            <button type="button" aria-label="Previous images" disabled={railStart === 0} onClick={() => setRailStart((s) => Math.max(0, s - 1))} className="flex h-8 w-11 items-center justify-center text-cocoa-900 disabled:opacity-30">
              <ChevronUp className="h-5 w-5" />
            </button>
          )}
          <div role="group" aria-label="Choose image" className="flex flex-col gap-3">
            {images.slice(railStart, railStart + RAIL_VISIBLE).map((img, i) => {
              const n = railStart + i;
              return (
                <button
                  key={img.url + n}
                  type="button"
                  aria-label={`Show image ${n + 1} of ${count}`}
                  aria-pressed={n === index}
                  onClick={() => go(n)}
                  className={cn("h-[92px] w-[84px] overflow-hidden rounded-md bg-[#F4EADB]", n === index ? "border-2 border-gold-600" : "border border-sand-400 hover:border-gold-500")}
                >
                  <img {...responsiveImage(img.url, "thumb", "96px")} alt="" loading="lazy" className="h-full w-full object-cover" />
                </button>
              );
            })}
          </div>
          {count > RAIL_VISIBLE && (
            <button type="button" aria-label="More images" disabled={railStart + RAIL_VISIBLE >= count} onClick={() => setRailStart((s) => Math.min(count - RAIL_VISIBLE, s + 1))} className="flex h-8 w-11 items-center justify-center text-cocoa-900 disabled:opacity-30">
              <ChevronDown className="h-5 w-5" />
            </button>
          )}
        </div>
      )}

      <div
        className="relative aspect-[1/1.1] min-w-0 flex-1 overflow-hidden rounded-lg border border-sand-400 bg-[#F4EADB] max-md:-mx-4 max-md:rounded-none max-md:border-x-0"
        onTouchStart={(e) => (touchX.current = e.touches[0].clientX)}
        onTouchEnd={(e) => {
          if (touchX.current === null) return;
          const dx = e.changedTouches[0].clientX - touchX.current;
          if (Math.abs(dx) > 40) go(index + (dx < 0 ? 1 : -1));
          touchX.current = null;
        }}
      >
        <img {...responsiveImage(current.url, "full", "(min-width: 1024px) 50vw, 100vw")} alt={current.alt || name} fetchPriority={index === 0 ? "high" : undefined} className="h-full w-full object-cover" />
        {badge && <span className="absolute left-4 top-4 rounded-sm border border-sand-500 bg-cream-50 px-2 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-cocoa-900">{badge}</span>}
        <button
          type="button"
          onClick={() => setZoomed(true)}
          className="absolute bottom-4 right-4 hidden min-h-[44px] items-center gap-2 rounded-full bg-white px-4 text-sm font-medium text-cocoa-900 shadow-sm md:flex"
        >
          <PathIcon d={ICONS.zoom} size={16} strokeWidth={1.8} />
          Zoom
        </button>
        {count > 1 && (
          <div role="group" aria-label="Choose image" className="absolute inset-x-0 bottom-3 flex justify-center gap-1 md:hidden">
            {images.map((img, i) => (
              <button key={img.url + i} type="button" aria-label={`Show image ${i + 1} of ${count}`} aria-pressed={i === index} onClick={() => go(i)} className="flex h-6 w-6 items-center justify-center">
                <span className={cn("block h-2 rounded-full transition-all", i === index ? "w-5 bg-brown-700" : "w-2 bg-cocoa-900/30")} />
              </button>
            ))}
          </div>
        )}
      </div>

      <Dialog open={zoomed} onClose={() => setZoomed(false)} title={`${name} — image ${index + 1} of ${count}`} hideTitle className="max-w-5xl bg-[#F4EADB]">
        <img {...responsiveImage(current.url, "full")} alt={current.alt || name} className="max-h-[85vh] w-full object-contain" />
        {count > 1 && (
          <div className="absolute inset-y-0 left-0 right-0 flex items-center justify-between px-3">
            <button type="button" aria-label="Previous image" onClick={() => go(index - 1)} className="flex h-11 w-11 items-center justify-center rounded-full bg-brown-700 text-white">
              ‹
            </button>
            <button type="button" aria-label="Next image" onClick={() => go(index + 1)} className="flex h-11 w-11 items-center justify-center rounded-full bg-brown-700 text-white">
              ›
            </button>
          </div>
        )}
      </Dialog>
    </section>
  );
}
