import { Link } from "react-router";
import { cn } from "../../lib/cn";

export function AuthTabs({ active }) {
  const tab = (key, to, label) => (
    <Link
      to={to}
      aria-current={active === key ? "page" : undefined}
      className={cn(
        "-mb-px border-b-[3px] py-3.5 text-center font-serif text-lg text-cocoa-900 hover:text-cocoa-900",
        active === key ? "border-brown-700" : "border-transparent text-ink-500"
      )}
    >
      {label}
    </Link>
  );
  return (
    <nav aria-label="Account" className="grid grid-cols-2 border-b border-sand-400">
      {tab("login", "/login", "Sign in")}
      {tab("register", "/register", "Create account")}
    </nav>
  );
}
