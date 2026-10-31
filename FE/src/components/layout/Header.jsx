import { useEffect, useRef, useState } from "react";
import { Link, NavLink, useLocation } from "react-router";
import { Search, User, Heart, ShoppingBag, ChevronDown, Menu, X } from "lucide-react";
import logo from "../../assets/brand/logo.png";
import { NAV_ITEMS } from "../../data/site";
import { SHOP_BY_CONCERN } from "../../data/content";
import { cn, formatPaise } from "../../lib/cn";
import { useQuery } from "../../lib/query";
import { AnnouncementBar } from "./AnnouncementBar";
import { useAuth } from "../../auth/context";
import { useCart } from "../../cart/context";
import { NotificationBell } from "../notifications/NotificationBell";
import { SearchBox } from "../search/SearchBox";
import { Skeleton } from "../ui/primitives";

const linkBase = "flex items-center gap-1.5 border-b-2 py-2 font-serif text-[15px] transition-colors";

function navClass({ isActive }) {
  return cn(linkBase, isActive ? "border-gold-600 text-gold-700" : "border-transparent text-cocoa-900 hover:text-gold-700");
}

function SolutionsMenu({ onNavigate }) {
  // Same path as the Home page grid, so the menu and the page share one cached request.
  const { data, isLoading } = useQuery("/api/products?limit=8");
  const products = data?.products ?? [];
  return (
    <div className="absolute left-1/2 top-full z-40 mt-2 grid w-[600px] -translate-x-1/2 grid-cols-[1fr_190px] gap-5 rounded-lg border border-sand-400 bg-cream-200 p-4 shadow-md">
      <div>
      <p className="eyebrow mb-3">Shop by product</p>
      <ul className="flex flex-col gap-1">
        {isLoading && Array.from({ length: 4 }, (_, i) => <li key={i}><Skeleton className="h-[60px]" /></li>)}
        {products.map((p) => (
          <li key={p.slug}>
            <Link to={`/solutions/${p.slug}`} onClick={onNavigate} className="flex items-center gap-3 rounded-md p-1.5 text-cocoa-900 hover:bg-cream-200 hover:text-cocoa-900">
              {p.image && <img src={p.image.url} alt="" className="h-12 w-12 rounded-md object-cover" />}
              <span className="flex flex-1 flex-col leading-tight">
                <span className="font-serif text-[15px]">{p.name}</span>
                <span className="text-xs text-ink-500">{p.tagline}</span>
              </span>
              <span className="text-sm font-semibold">{formatPaise(p.price)}</span>
            </Link>
          </li>
        ))}
      </ul>
      <Link to="/solutions" onClick={onNavigate} className="mt-3 inline-block border-t border-sand-400 pt-3 text-[13px] font-semibold uppercase tracking-[0.18em]">
        View all solutions →
      </Link>
      </div>
      <div className="border-l border-sand-400 pl-5">
        <p className="eyebrow mb-3">Shop by concern</p>
        <ul className="flex flex-col">
          {SHOP_BY_CONCERN.map((c) => (
            <li key={c.to}>
              <Link to={c.to} onClick={onNavigate} className="block rounded-md px-2 py-2 font-serif text-[15px] text-cocoa-900 hover:bg-cream-300 hover:text-cocoa-900">
                {c.title.replace("\n", " ")}
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export function Header() {
  const { count: cartCount } = useCart();
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const location = useLocation();
  const { isAuthenticated, user } = useAuth();
  const accountHref = isAuthenticated ? (user.role === "customer" ? "/account" : "/admin") : "/login";
  const menuRef = useRef(null);

  // Close menus on navigation (adjusting state during render, not in an effect).
  const [lastPath, setLastPath] = useState(location.pathname);
  if (lastPath !== location.pathname) {
    setLastPath(location.pathname);
    setMenuOpen(false);
    setDrawerOpen(false);
    setSearchOpen(false);
  }

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Escape and outside click close the Solutions dropdown.
  useEffect(() => {
    if (!menuOpen) return undefined;
    const onKey = (e) => e.key === "Escape" && setMenuOpen(false);
    const onClick = (e) => menuRef.current && !menuRef.current.contains(e.target) && setMenuOpen(false);
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onClick);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onClick);
    };
  }, [menuOpen]);

  useEffect(() => {
    document.body.style.overflow = drawerOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [drawerOpen]);

  return (
    <header>
      <a href="#main" className="sr-only-focusable absolute left-4 top-2 z-50 rounded-md bg-cocoa-900 px-4 py-2 text-ivory">
        Skip to content
      </a>
      <AnnouncementBar />
      <div className={cn("sticky top-0 z-30 border-b border-[#EFE3D1] bg-cream-50 transition-shadow", scrolled && "shadow-xs")}>
        <div className="mx-auto flex max-w-[1320px] items-center justify-between gap-6 px-4 py-3 lg:px-6">
          <button type="button" className="flex h-11 w-11 items-center justify-center text-cocoa-900 lg:hidden" aria-label="Open menu" aria-expanded={drawerOpen} onClick={() => setDrawerOpen(true)}>
            <Menu strokeWidth={1.7} />
          </button>

          <Link to="/" aria-label="ManushyaM home" data-brand-logo className="shrink-0">
            <img src={logo} alt="ManushyaM" className="h-11 w-auto lg:h-[54px]" />
          </Link>

          <nav aria-label="Main" className="hidden items-center gap-9 lg:flex">
            {NAV_ITEMS.map((item) =>
              item.hasMenu ? (
                <div key={item.key} ref={menuRef} className="relative">
                  <button
                    type="button"
                    aria-expanded={menuOpen}
                    aria-haspopup="true"
                    onClick={() => setMenuOpen((o) => !o)}
                    className={cn(linkBase, location.pathname.startsWith("/solutions") ? "border-gold-600 text-gold-700" : "border-transparent text-cocoa-900 hover:text-gold-700")}
                  >
                    {item.label}
                    <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", menuOpen && "rotate-180")} strokeWidth={2.4} aria-hidden="true" />
                  </button>
                  {menuOpen && <SolutionsMenu onNavigate={() => setMenuOpen(false)} />}
                </div>
              ) : (
                <NavLink key={item.key} to={item.to} end={item.to === "/"} className={navClass}>
                  {item.label}
                </NavLink>
              )
            )}
          </nav>

          <div className="flex items-center gap-0.5 text-cocoa-900">
            <button
              type="button"
              aria-label="Search"
              aria-expanded={searchOpen}
              aria-controls="header-search"
              onClick={() => setSearchOpen((o) => !o)}
              className="hidden h-11 w-11 items-center justify-center text-cocoa-900 hover:text-gold-700 sm:flex"
            >
              {searchOpen ? <X strokeWidth={1.6} /> : <Search strokeWidth={1.6} />}
            </button>
            {isAuthenticated && <NotificationBell seeAllHref={user.role === "customer" ? "/account/notifications" : undefined} />}
            <Link to={accountHref} aria-label={isAuthenticated ? "My account" : "Sign in"} className="hidden h-11 w-11 items-center justify-center text-cocoa-900 sm:flex">
              <User strokeWidth={1.6} />
            </Link>
            <Link to="/wishlist" aria-label="Wishlist" className="hidden h-11 w-11 items-center justify-center text-cocoa-900 md:flex">
              <Heart strokeWidth={1.6} />
            </Link>
            <Link to="/cart" aria-label={`Cart, ${cartCount} item${cartCount === 1 ? "" : "s"}`} className="relative flex h-11 w-11 items-center justify-center text-cocoa-900">
              <ShoppingBag strokeWidth={1.6} />
              {cartCount > 0 && (
                <span className="absolute right-0.5 top-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-brown-700 px-1 text-[11px] font-semibold text-white">
                  {cartCount}
                </span>
              )}
            </Link>
          </div>
        </div>
        {searchOpen && (
          <div id="header-search" className="border-t border-[#EFE3D1] bg-cream-50 px-4 py-4" onKeyDown={(e) => e.key === "Escape" && setSearchOpen(false)}>
            <SearchBox autoFocus className="mx-auto max-w-[640px]" onNavigate={() => setSearchOpen(false)} />
          </div>
        )}
      </div>

      {drawerOpen && (
        <div role="dialog" aria-modal="true" aria-label="Menu" className="fixed inset-0 z-50 flex flex-col overflow-y-auto bg-cream-100 lg:hidden">
          <div className="flex items-center justify-between border-b border-sand-400 px-4 py-2">
            <img src={logo} alt="ManushyaM" className="h-10 w-auto" />
            <button type="button" aria-label="Close menu" className="flex h-11 w-11 items-center justify-center text-cocoa-900" onClick={() => setDrawerOpen(false)}>
              <X strokeWidth={1.7} />
            </button>
          </div>
          <div className="px-4 pt-4">
            <SearchBox onNavigate={() => setDrawerOpen(false)} />
          </div>
          <nav aria-label="Main" className="flex flex-col px-4 py-2">
            {NAV_ITEMS.map((item) => (
              <NavLink key={item.key} to={item.to} end={item.to === "/"} className={({ isActive }) => cn("flex min-h-14 items-center border-b border-sand-400 font-serif text-[22px]", isActive ? "text-gold-700" : "text-cocoa-900")}>
                {item.label}
              </NavLink>
            ))}
          </nav>
          <div className="mt-auto grid grid-cols-2 gap-3 border-t border-sand-400 bg-cream-200 p-4">
            <Link to={accountHref} className="flex min-h-12 items-center justify-center rounded-md bg-brown-700 font-serif text-white hover:text-white">
              {isAuthenticated ? "My account" : "Sign in"}
            </Link>
            <Link to="/account/orders" className="flex min-h-12 items-center justify-center rounded-md border border-sand-500 font-serif text-cocoa-900">
              Track order
            </Link>
          </div>
        </div>
      )}
    </header>
  );
}
