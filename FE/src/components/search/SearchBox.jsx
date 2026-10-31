import { useEffect, useId, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { Search } from "lucide-react";
import { useQuery, withQuery } from "../../lib/query";
import { cn, formatPaise } from "../../lib/cn";

function useDebounced(value, ms) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return debounced;
}

// Product search with autocomplete (WAI-ARIA combobox). Enter on a suggestion opens the product;
// Enter otherwise goes to the full results page.
export function SearchBox({ initialQuery = "", autoFocus = false, onNavigate, className, size = "md" }) {
  const navigate = useNavigate();
  const listId = useId();
  const inputRef = useRef(null);
  const [value, setValue] = useState(initialQuery);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const term = useDebounced(value.trim(), 200);
  const { data, isLoading } = useQuery(open && term.length >= 2 ? withQuery("/api/products/suggest", { q: term }) : null);
  const suggestions = term.length >= 2 ? (data?.suggestions ?? []) : [];
  const showList = open && term.length >= 2 && (suggestions.length > 0 || !isLoading);

  useEffect(() => {
    if (autoFocus) inputRef.current?.focus();
  }, [autoFocus]);

  const go = (path) => {
    setOpen(false);
    onNavigate?.();
    navigate(path);
  };

  const onKeyDown = (e) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      setActive((i) => Math.min(suggestions.length - 1, i + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(-1, i - 1));
    } else if (e.key === "Escape") {
      if (open) {
        e.stopPropagation();
        setOpen(false);
        setActive(-1);
      }
    }
  };

  const onSubmit = (e) => {
    e.preventDefault();
    const pick = active >= 0 ? suggestions[active] : null;
    if (pick) return go(`/solutions/${pick.slug}`);
    const q = value.trim();
    if (q) go(withQuery("/search", { q }));
    return undefined;
  };

  return (
    <form role="search" onSubmit={onSubmit} className={cn("relative", className)}>
      <div className={cn("flex items-center gap-2.5 rounded-lg border border-sand-500 bg-white px-4 shadow-sm focus-within:border-gold-600 focus-within:ring-[3px] focus-within:ring-gold-500/20", size === "lg" ? "h-[54px]" : "h-12")}>
        <Search className="h-5 w-5 shrink-0 text-ink-500" aria-hidden="true" />
        <input
          ref={inputRef}
          type="search"
          role="combobox"
          aria-label="Search products"
          aria-expanded={showList}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={showList && active >= 0 ? `${listId}-${active}` : undefined}
          autoComplete="off"
          enterKeyHint="search"
          maxLength={60}
          value={value}
          placeholder="Search therapies, ingredients…"
          onChange={(e) => {
            setValue(e.target.value);
            setOpen(true);
            setActive(-1);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 120)}
          onKeyDown={onKeyDown}
          className="min-w-0 flex-1 bg-transparent text-base text-cocoa-900 outline-none placeholder:text-ink-500"
        />
      </div>
      {showList && (
        <ul id={listId} role="listbox" aria-label="Suggestions" className="absolute inset-x-0 top-full z-40 mt-2 overflow-hidden rounded-lg border border-sand-400 bg-cream-50 p-1.5 text-left shadow-lg">
          {suggestions.length ? (
            suggestions.map((s, i) => (
              <li
                key={s.slug}
                id={`${listId}-${i}`}
                role="option"
                aria-selected={i === active}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => go(`/solutions/${s.slug}`)}
                onMouseEnter={() => setActive(i)}
                className={cn("flex cursor-pointer items-center gap-3 rounded-md p-1.5", i === active && "bg-cream-300")}
              >
                {s.image && <img src={s.image.url} alt="" className="h-11 w-11 rounded-md object-cover" />}
                <span className="flex flex-1 flex-col leading-tight">
                  <span className="font-serif text-[15px] text-cocoa-900">{s.name}</span>
                  <span className="text-xs text-ink-500">{s.tagline}</span>
                </span>
                <span className="text-sm font-semibold text-cocoa-900">{formatPaise(s.price)}</span>
              </li>
            ))
          ) : (
            <li role="option" aria-selected="false" aria-disabled="true" className="p-3 text-sm text-ink-500">
              No products match “{term}”. Press Enter to search everything.
            </li>
          )}
        </ul>
      )}
    </form>
  );
}
