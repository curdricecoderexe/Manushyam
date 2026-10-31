import { cn } from "../../lib/cn";

// Thin line icons from the design canvas, drawn from a single SVG path (getdesign.md §9).
export function PathIcon({ d, size = 24, viewBox = "0 0 24 24", strokeWidth = 1.4, className, fill = "none", title }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox={viewBox}
      fill={fill}
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden={title ? undefined : "true"}
      role={title ? "img" : undefined}
      aria-label={title}
      className={cn("shrink-0", className)}
    >
      <path d={d} />
    </svg>
  );
}
