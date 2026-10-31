import { cn } from "../../lib/cn";
import { buttonVariants } from "./button-variants";

// Pass `as={Link}` (or "a") to render a link that looks like a button.
export function Button({ as: Comp = "button", variant, size, className, type, ...props }) {
  const isButton = Comp === "button";
  return (
    <Comp
      className={cn(buttonVariants({ variant, size }), className)}
      {...(isButton ? { type: type ?? "button" } : {})}
      {...props}
    />
  );
}

export function ArrowIcon({ className }) {
  return (
    <svg
      width="24"
      height="12"
      viewBox="0 0 26 12"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      aria-hidden="true"
      className={cn("transition-transform duration-200 group-hover:translate-x-1", className)}
    >
      <path d="M0 6h24M19 1l5 5-5 5" />
    </svg>
  );
}
