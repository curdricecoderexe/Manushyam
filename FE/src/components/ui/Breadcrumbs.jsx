import { Fragment } from "react";
import { Link } from "react-router";
import { cn } from "../../lib/cn";

// Home › Solutions › Product (getdesign.md §8.4). The last item is the current page.
export function Breadcrumbs({ items, className }) {
  return (
    <nav aria-label="Breadcrumb" className={cn("text-sm text-ink-500", className)}>
      <ol className="flex flex-wrap items-center gap-2.5">
        {items.map((item, i) => {
          const last = i === items.length - 1;
          return (
            <Fragment key={item.label}>
              <li>
                {last || !item.to ? (
                  <span aria-current={last ? "page" : undefined}>{item.label}</span>
                ) : (
                  <Link to={item.to} className="text-cocoa-900 hover:text-gold-700">
                    {item.label}
                  </Link>
                )}
              </li>
              {!last && (
                <li aria-hidden="true" className="text-ink-500">
                  ›
                </li>
              )}
            </Fragment>
          );
        })}
      </ol>
    </nav>
  );
}

