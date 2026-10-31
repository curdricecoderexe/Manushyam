import { NavLink, Outlet, useLocation, useNavigate } from "react-router";
import { ShoppingBag, MapPin, ShieldCheck, Bell, Lock, LogOut } from "lucide-react";
import { useAuth } from "../../auth/context";
import { cn } from "../../lib/cn";
import { Seo } from "../../components/Seo";

const TABS = [
  // /account itself shows the orders list too.
  { to: "/account/orders", label: "My orders", icon: ShoppingBag, alsoActiveAt: "/account" },
  { to: "/account/addresses", label: "Addresses", icon: MapPin },
  { to: "/account/profile", label: "Profile & security", icon: ShieldCheck },
  { to: "/account/notifications", label: "Notifications", icon: Bell },
  { to: "/account/privacy", label: "Privacy & data", icon: Lock },
];

export function AccountLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const initials = user.name.split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase();

  async function signOut() {
    await logout();
    navigate("/", { replace: true });
  }

  return (
    <div className="container-page py-9">
      <Seo title="My account" noindex />
      <div className="mb-7 flex flex-wrap items-center gap-4">
        <span className="flex h-[60px] w-[60px] items-center justify-center rounded-full bg-[#EAD3C0] font-serif text-[22px] text-cocoa-900" aria-hidden="true">
          {initials}
        </span>
        <div>
          <h1 className="text-[clamp(1.75rem,3vw,2.375rem)] leading-tight">Namaste, {user.name.split(" ")[0]}</h1>
          <p className="text-sm text-ink-500">{user.email}</p>
        </div>
      </div>
      <div className="flex flex-col gap-7 md:flex-row md:items-start">
        <nav aria-label="Account" className="flex shrink-0 flex-row gap-0.5 overflow-x-auto rounded-lg border border-sand-400 bg-cream-50 p-2.5 md:w-[250px] md:flex-col">
          {TABS.map(({ to, label, icon: Icon, end, alsoActiveAt }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              aria-current={alsoActiveAt === pathname ? "page" : undefined}
              className={({ isActive }) =>
                cn("flex min-h-12 shrink-0 items-center gap-3 rounded-lg px-3.5 font-serif", isActive || alsoActiveAt === pathname ? "bg-cream-300 text-cocoa-900" : "text-ink-700 hover:bg-cream-200 hover:text-cocoa-900")
              }
            >
              <Icon className="h-[18px] w-[18px] text-brown-700" strokeWidth={1.6} aria-hidden="true" />
              {label}
            </NavLink>
          ))}
          <button type="button" onClick={signOut} className="flex min-h-12 shrink-0 items-center gap-3 rounded-lg px-3.5 font-serif text-danger-600 hover:bg-danger-50 md:mt-1.5 md:border-t md:border-sand-400">
            <LogOut className="h-[18px] w-[18px]" strokeWidth={1.6} aria-hidden="true" />
            Log out
          </button>
        </nav>
        <section className="min-w-0 flex-1">
          <Outlet />
        </section>
      </div>
    </div>
  );
}
