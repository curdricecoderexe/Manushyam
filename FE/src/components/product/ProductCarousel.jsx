import { useRef } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { ProductCard } from "./ProductCard";

// "You May Also Like": 3-up desktop, 2-up tablet, ~1.2-up mobile with a peek, brown circle arrows (§7.4).
export function ProductCarousel({ products, label }) {
  const track = useRef(null);
  const scroll = (dir) => {
    const el = track.current;
    if (el) el.scrollBy({ left: dir * el.clientWidth * 0.9, behavior: "smooth" });
  };
  const arrow = "hidden h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brown-700 text-white transition-transform hover:scale-105 md:flex";

  return (
    <div className="flex items-center gap-4" role="region" aria-roledescription="carousel" aria-label={label}>
      {products.length > 3 && (
        <button type="button" aria-label="Previous products" onClick={() => scroll(-1)} className={arrow}>
          <ChevronLeft className="h-5 w-5" />
        </button>
      )}
      <ul ref={track} className="-mx-4 flex flex-1 snap-x snap-mandatory gap-6 overflow-x-auto scroll-smooth px-4 pb-2 [scrollbar-width:none] md:mx-0 md:px-0">
        {products.map((p) => (
          <li key={p.id ?? p.slug} className="w-[80%] shrink-0 snap-start min-[480px]:w-[calc(50%-12px)] lg:w-[calc(33.333%-16px)]">
            <ProductCard product={p} variant="compact" />
          </li>
        ))}
      </ul>
      {products.length > 3 && (
        <button type="button" aria-label="Next products" onClick={() => scroll(1)} className={arrow}>
          <ChevronRight className="h-5 w-5" />
        </button>
      )}
    </div>
  );
}
