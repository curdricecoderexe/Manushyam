import { useEffect, useMemo, useRef, useState } from "react";
import { Link, NavLink, Outlet, matchPath, useLocation, useNavigate } from "react-router";
import { AnimatePresence, LayoutGroup, MotionConfig, motion } from "motion/react";
import { ChevronRight, ChevronsLeft, ChevronsRight, CornerDownLeft, LogOut, Menu, Monitor, Moon, PenLine, Plus, Search, Store, Sun, X, Zap } from "lucide-react";
import logoIvory from "../../assets/brand/logo-ivory.png";
import { cn } from "../../lib/cn";
import { navForRole } from "../../data/adminNav";
import { useAuth } from "../../auth/context";
import { useAdminTheme } from "../../lib/adminTheme";
import { NotificationBell } from "../notifications/NotificationBell";
import { Toaster } from "../../toast/ToastProvider";
import { useToast } from "../../toast/context";
import { useMediaQuery } from "../../hooks/useMediaQuery";
import { EASE, canAnimate, gsap, useGSAP } from "../admin/motion";

const COLLAPSED_KEY = "mm_admin_sidebar_collapsed";
const readCollapsed = () => {
  try {
    return localStorage.getItem(COLLAPSED_KEY) === "1";
  } catch {
    return false;
  }
};

const THEME_OPTIONS = [
  { id: "light", label: "Light", icon: Sun },
  { id: "dark", label: "Dark", icon: Moon },
  { id: "system", label: "System", icon: Monitor },
];

const initials = (name = "") =>
  name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join("") || "M";

// Nav entry for the current URL (longest match wins, so /admin/products/new → Inventory).
function useCurrentNav(groups) {
  const { pathname } = useLocation();
  return useMemo(() => {
    let best = null;
    for (const g of groups)
      for (const item of g.items) {
        const hit = matchPath({ path: item.to, end: Boolean(item.end) }, pathname);
        if (hit && (!best || item.to.length > best.item.to.length)) best = { group: g.group, item };
      }
    return best;
  }, [groups, pathname]);
}

// The sidebar is an espresso colour block in both themes, so its colours are fixed white alphas.
const railLink = "group relative flex h-10 items-center gap-3 rounded-full px-3.5 text-[14px] font-medium outline-none transition-colors duration-200 focus-visible:ring-2 focus-visible:ring-white/60";
const railIdle = "text-white/70 hover:bg-white/[0.07] hover:text-[#FBF3E9]";

function NavItem({ item, collapsed }) {
  const { to, label, icon: Icon, end } = item;
  return (
    <NavLink
      to={to}
      end={end}
      title={collapsed ? label : undefined}
      data-nav-item
      className={({ isActive }) => cn(railLink, isActive ? "font-semibold text-[#24170E] hover:text-[#24170E]" : railIdle, collapsed && "justify-center px-0")}
    >
      {({ isActive }) => (
        <>
          {isActive && (
            <motion.span layoutId="admin-nav-active" className="absolute inset-0 rounded-full bg-[#FBF3E9] shadow-[0_1px_2px_rgba(0,0,0,0.25),0_6px_16px_-6px_rgba(0,0,0,0.5),inset_0_1px_0_rgba(255,255,255,0.8)]" transition={{ type: "spring", stiffness: 480, damping: 38 }} aria-hidden="true" />
          )}
          <Icon className={cn("relative h-[18px] w-[18px] shrink-0 transition-colors", isActive ? "text-[#A0602E]" : "text-white/55 group-hover:text-[#E8C39A]")} strokeWidth={1.75} aria-hidden="true" />
          <span className={cn("relative truncate", collapsed && "sr-only")}>{label}</span>
        </>
      )}
    </NavLink>
  );
}

function AdminNav({ groups, collapsed, onSignOut, onToggle }) {
  return (
    <nav aria-label="Admin" className="admin-scroll-dark flex min-h-0 flex-1 flex-col overflow-y-auto overflow-x-hidden px-3.5 pb-4">
      {groups.map((g) => (
        <div key={g.group} className="pt-5 first:pt-2">
          {collapsed ? <div className="mx-auto mb-2 h-px w-6 bg-white/15" aria-hidden="true" /> : <p className="px-3.5 pb-2 text-[11px] font-semibold uppercase tracking-[0.15em] text-white/45">{g.group}</p>}
          <ul className="flex flex-col gap-0.5">
            {g.items.map((item) => (
              <li key={item.to}>
                <NavItem item={item} collapsed={collapsed} />
              </li>
            ))}
          </ul>
        </div>
      ))}
      <div className="mt-auto flex flex-col gap-0.5 border-t border-white/10 pt-4">
        <Link to="/" title={collapsed ? "View store" : undefined} className={cn(railLink, railIdle, collapsed && "justify-center px-0")}>
          <Store className="h-[18px] w-[18px] shrink-0" strokeWidth={1.75} aria-hidden="true" />
          <span className={cn(collapsed && "sr-only")}>View store</span>
        </Link>
        <button type="button" onClick={onSignOut} title={collapsed ? "Sign out" : undefined} className={cn(railLink, "text-left", railIdle, collapsed && "justify-center px-0")}>
          <LogOut className="h-[18px] w-[18px] shrink-0" strokeWidth={1.75} aria-hidden="true" />
          <span className={cn(collapsed && "sr-only")}>Sign out</span>
        </button>
        {onToggle && (
          <button type="button" onClick={onToggle} aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"} title={collapsed ? "Expand sidebar" : undefined} className={cn(railLink, "hidden text-left lg:flex", railIdle, collapsed && "justify-center px-0")}>
            {collapsed ? <ChevronsRight className="h-[18px] w-[18px] shrink-0" strokeWidth={1.75} aria-hidden="true" /> : <ChevronsLeft className="h-[18px] w-[18px] shrink-0" strokeWidth={1.75} aria-hidden="true" />}
            <span className={cn(collapsed && "sr-only")}>Collapse</span>
          </button>
        )}
      </div>
    </nav>
  );
}

function SidebarBrand({ role, collapsed }) {
  return (
    <div className={cn("flex h-16 shrink-0 items-center gap-2.5 px-5", collapsed && "justify-center px-0")}>
      {collapsed ? (
        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-[#E8C39A] to-[#A0602E] font-display text-lg text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.35),0_4px_12px_-4px_rgba(160,96,46,0.8)]" role="img" aria-label="ManushyaM">
          M
        </span>
      ) : (
        <>
          <img src={logoIvory} alt="ManushyaM" className="h-9 w-auto" />
          <span className="rounded-full border border-white/30 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-white/85">{role}</span>
        </>
      )}
    </div>
  );
}

function Avatar({ name, className, dotRing = "ring-panel" }) {
  return (
    <span className={cn("relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#E8C39A] to-[#A0602E] text-[13px] font-semibold text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.3)]", className)} aria-hidden="true">
      {initials(name)}
      <span className={cn("absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full bg-[#00A862] ring-2", dotRing)} />
    </span>
  );
}

function UserCard({ user, collapsed }) {
  return (
    <div className={cn("mx-3.5 mb-3.5 flex items-center gap-3 rounded-full bg-white/[0.07] p-1.5 pr-4", collapsed && "mx-auto justify-center bg-transparent p-0 pr-0")}>
      <Avatar name={user?.name} dotRing="ring-[rgb(var(--c-house))]" />
      {!collapsed && (
        <span className="flex min-w-0 flex-col leading-tight">
          <span className="truncate text-[13px] font-semibold text-white">{user?.name}</span>
          <span className="truncate text-[11.5px] text-white/60">{user?.email}</span>
        </span>
      )}
    </div>
  );
}

// Light / dark / system switch with a sliding thumb (used in the account menu).
function ThemeSwitch({ theme, onChange }) {
  return (
    <div role="radiogroup" aria-label="Theme" className="flex gap-0.5 rounded-full bg-panel-sunken p-1">
      {THEME_OPTIONS.map(({ id, label, icon: Icon }) => (
        <button key={id} type="button" role="radio" aria-checked={theme === id} onClick={() => onChange(id)} className={cn("relative flex h-8 flex-1 items-center justify-center gap-1.5 rounded-full text-xs font-medium transition-colors", theme === id ? "text-cocoa-900" : "text-ink-500 hover:text-cocoa-900")}>
          {theme === id && <motion.span layoutId="theme-thumb" className="absolute inset-0 rounded-full bg-panel shadow-[0_0_0.5px_rgba(0,0,0,0.14),0_1px_1px_rgba(0,0,0,0.24)]" transition={{ type: "spring", stiffness: 520, damping: 38 }} aria-hidden="true" />}
          <Icon className="relative h-3.5 w-3.5" aria-hidden="true" />
          <span className="relative">{label}</span>
        </button>
      ))}
    </div>
  );
}

// One-tap light ↔ dark toggle for the top bar; the icon rotates through.
function ThemeToggle({ resolved, onToggle }) {
  const dark = resolved === "dark";
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={dark ? "Switch to light theme" : "Switch to dark theme"}
      title={dark ? "Light theme" : "Dark theme"}
      className="relative flex h-10 w-10 items-center justify-center overflow-hidden rounded-full text-cocoa-900 transition-all hover:bg-cocoa-900/[0.06] active:scale-95"
    >
      <AnimatePresence mode="wait" initial={false}>
        <motion.span key={dark ? "moon" : "sun"} initial={{ y: 14, rotate: -90, opacity: 0 }} animate={{ y: 0, rotate: 0, opacity: 1 }} exit={{ y: -14, rotate: 90, opacity: 0 }} transition={{ duration: 0.25, ease: EASE }} className="flex">
          {dark ? <Moon className="h-[19px] w-[19px]" strokeWidth={1.75} aria-hidden="true" /> : <Sun className="h-[19px] w-[19px]" strokeWidth={1.75} aria-hidden="true" />}
        </motion.span>
      </AnimatePresence>
    </button>
  );
}

// ⌘K / Ctrl+K: jump to any admin screen or quick action.
function CommandPalette({ open, onClose, groups, isAdmin, onTheme, theme }) {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef(null);
  const commands = useMemo(
    () => [
      ...groups.flatMap((g) => g.items.map((i) => ({ id: i.to, label: i.label, hint: g.group, icon: i.icon, to: i.to }))),
      ...(isAdmin
        ? [
            { id: "new-product", label: "New product", hint: "Create", icon: Plus, to: "/admin/products/new" },
            { id: "new-post", label: "New blog article", hint: "Create", icon: PenLine, to: "/admin/blog/new" },
          ]
        : []),
      ...THEME_OPTIONS.map((t) => ({ id: `theme-${t.id}`, label: `${t.label} theme`, hint: theme === t.id ? "Current" : "Appearance", icon: t.icon, run: () => onTheme(t.id) })),
      { id: "store", label: "View store", hint: "Storefront", icon: Store, to: "/" },
    ],
    [groups, isAdmin, onTheme, theme]
  );
  const q = query.trim().toLowerCase();
  const results = q ? commands.filter((c) => `${c.label} ${c.hint}`.toLowerCase().includes(q)) : commands;
  const current = Math.min(active, Math.max(0, results.length - 1));

  useEffect(() => {
    if (!open) return undefined;
    const opener = document.activeElement;
    inputRef.current?.focus();
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
      opener?.focus?.();
    };
  }, [open]);

  function go(cmd) {
    if (!cmd) return;
    onClose();
    setQuery("");
    if (cmd.run) cmd.run();
    else navigate(cmd.to);
  }
  function onKeyDown(e) {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const step = e.key === "ArrowDown" ? 1 : -1;
      setActive((current + step + results.length) % Math.max(1, results.length));
    } else if (e.key === "Enter") {
      e.preventDefault();
      go(results[current]);
    } else if (e.key === "Escape" || e.key === "Tab") {
      e.preventDefault();
      onClose();
    }
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div className="fixed inset-0 z-[65] flex items-start justify-center bg-cocoa-950/50 px-4 pt-[12vh] backdrop-blur-sm" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }} onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label="Search the admin"
            className="w-full max-w-[580px] overflow-hidden rounded-2xl border border-sand-400 bg-panel/95 shadow-[0_24px_80px_-12px_rgba(20,13,7,0.5)] backdrop-blur-xl"
            initial={{ opacity: 0, y: -12, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.98 }}
            transition={{ duration: 0.22, ease: EASE }}
          >
            <div className="flex items-center gap-3 border-b border-sand-400 px-4">
              <Search className="h-[18px] w-[18px] shrink-0 text-ink-500" aria-hidden="true" />
              <input
                ref={inputRef}
                role="combobox"
                aria-expanded="true"
                aria-controls="admin-command-list"
                aria-activedescendant={results[current] ? `cmd-${results[current].id}` : undefined}
                aria-label="Search screens and actions"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setActive(0);
                }}
                onKeyDown={onKeyDown}
                placeholder="Search screens and actions…"
                className="h-14 flex-1 border-0 !bg-transparent text-[15px] text-cocoa-900 !shadow-none outline-none !ring-0 placeholder:text-ink-500"
              />
              <kbd className="rounded-md border border-sand-400 bg-panel-muted px-1.5 py-0.5 font-sans text-[11px] text-ink-500">Esc</kbd>
            </div>
            <ul id="admin-command-list" role="listbox" aria-label="Results" className="max-h-[min(60vh,440px)] overflow-y-auto p-2">
              {results.length === 0 && <li className="px-3 py-8 text-center text-sm text-ink-500">Nothing matches “{query}”.</li>}
              {results.map((c, i) => (
                <li
                  key={c.id}
                  id={`cmd-${c.id}`}
                  role="option"
                  aria-selected={i === current}
                  onMouseMove={() => setActive(i)}
                  onClick={() => go(c)}
                  className={cn("relative flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 text-sm", i === current ? "text-cocoa-900" : "text-ink-700")}
                >
                  {i === current && <motion.span layoutId="cmd-active" className="absolute inset-0 rounded-xl bg-gold-50" transition={{ type: "spring", stiffness: 600, damping: 42 }} aria-hidden="true" />}
                  <span className={cn("relative flex h-8 w-8 items-center justify-center rounded-full border", i === current ? "border-transparent bg-brown-700 text-white" : "border-sand-400 bg-panel-muted text-ink-500")}>
                    <c.icon className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
                  </span>
                  <span className="relative flex-1 font-medium">{c.label}</span>
                  <span className="relative text-xs text-ink-500">{c.hint}</span>
                  {i === current && <CornerDownLeft className="relative h-3.5 w-3.5 text-ink-500" aria-hidden="true" />}
                </li>
              ))}
            </ul>
            <div className="flex items-center gap-4 border-t border-sand-400 bg-panel-muted px-4 py-2.5 text-[11px] text-ink-500">
              <span className="flex items-center gap-1.5">
                <kbd className="rounded border border-sand-400 bg-panel px-1 font-sans">↑</kbd>
                <kbd className="rounded border border-sand-400 bg-panel px-1 font-sans">↓</kbd> to move
              </span>
              <span className="flex items-center gap-1.5">
                <kbd className="rounded border border-sand-400 bg-panel px-1 font-sans">↵</kbd> to open
              </span>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function UserMenu({ user, onSignOut, theme, onTheme }) {
  const [open, setOpen] = useState(false);
  const box = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => box.current && !box.current.contains(e.target) && setOpen(false);
    const onKey = (e) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);
  return (
    <div ref={box} className="relative">
      <button type="button" aria-label="Account menu" aria-expanded={open} onClick={() => setOpen((o) => !o)} className="flex h-10 items-center gap-2 rounded-full p-0.5 pr-0.5 transition-colors hover:bg-cocoa-900/[0.05] sm:pr-3">
        <Avatar name={user?.name} className="ring-2 ring-panel" />
        <span className="hidden flex-col text-left leading-tight lg:flex">
          <span className="text-[13px] font-semibold text-cocoa-900">{user?.name?.split(" ")[0]}</span>
          <span className="text-[11px] capitalize text-ink-500">{user?.role}</span>
        </span>
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            className="absolute right-0 z-50 mt-2 w-72 origin-top-right overflow-hidden rounded-2xl border border-sand-400 bg-panel p-1.5 shadow-[0_16px_48px_-8px_rgba(20,13,7,0.3)]"
            initial={{ opacity: 0, scale: 0.95, y: -4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: -4 }}
            transition={{ duration: 0.16, ease: EASE }}
          >
            <div className="flex items-center gap-3 border-b border-sand-400 px-3 pb-3 pt-2">
              <Avatar name={user?.name} />
              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold text-cocoa-900">{user?.name}</span>
                <span className="block truncate text-xs text-ink-500">{user?.email}</span>
              </span>
            </div>
            <div className="border-b border-sand-400 px-1.5 py-2.5">
              <p className="mb-2 px-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-500">Appearance</p>
              <ThemeSwitch theme={theme} onChange={onTheme} />
            </div>
            <Link to="/" onClick={() => setOpen(false)} className="mt-1 flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm text-ink-700 hover:bg-panel-muted hover:text-cocoa-900">
              <Store className="h-4 w-4" aria-hidden="true" /> View store
            </Link>
            <button type="button" onClick={onSignOut} className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-sm text-danger-600 hover:bg-danger-50">
              <LogOut className="h-4 w-4" aria-hidden="true" /> Sign out
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function AdminLayout() {
  const { user, logout } = useAuth();
  const { toasts, dismiss } = useToast();
  const navigate = useNavigate();
  const { theme, resolved, setTheme } = useAdminTheme();
  const dark = resolved === "dark";
  const role = user?.role ?? "staff";
  const groups = useMemo(() => navForRole(role), [role]);
  const current = useCurrentNav(groups);
  const [menuOpen, setMenuOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(readCollapsed);
  // Tablets always get the icon rail so content keeps its width; the toggle is for laptops and up.
  const wide = useMediaQuery("(min-width: 1024px)");
  const rail = collapsed || !wide;
  const sidebar = useRef(null);
  const { pathname } = useLocation();
  const [lastPath, setLastPath] = useState(pathname);
  // Close the phone menu after navigating.
  if (lastPath !== pathname) {
    setLastPath(pathname);
    setMenuOpen(false);
  }

  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((o) => !o);
      } else if (e.key === "Escape") {
        setMenuOpen(false);
        setPaletteOpen(false);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (!menuOpen) return undefined;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [menuOpen]);

  // First paint: the sidebar's links cascade in.
  useGSAP(
    () => {
      if (!canAnimate()) return;
      gsap.from("[data-nav-item]", { x: -14, opacity: 0, duration: 0.45, ease: "power3.out", stagger: 0.025, delay: 0.05, clearProps: "transform,opacity" });
    },
    { scope: sidebar }
  );

  function toggleCollapsed() {
    setCollapsed((c) => {
      try {
        localStorage.setItem(COLLAPSED_KEY, c ? "0" : "1");
      } catch {
        // Private mode: the choice just isn't remembered.
      }
      return !c;
    });
  }

  async function signOut() {
    await logout().catch(() => {});
    navigate("/login");
  }

  const sidebarSurface = "admin-espresso text-white";

  return (
    <MotionConfig reducedMotion="user">
      <div className="admin-shell flex min-h-dvh">
        <motion.aside ref={sidebar} aria-label="Admin navigation" className={cn("sticky top-0 hidden h-dvh shrink-0 flex-col overflow-hidden md:flex", sidebarSurface)} initial={false} animate={{ width: rail ? 80 : 264 }} transition={{ duration: 0.32, ease: EASE }}>
          <SidebarBrand role={role} collapsed={rail} />
          <LayoutGroup id="admin-sidebar">
            <AdminNav groups={groups} collapsed={rail} onSignOut={signOut} onToggle={toggleCollapsed} />
          </LayoutGroup>
          <UserCard user={user} collapsed={rail} />
        </motion.aside>

        <AnimatePresence>
          {menuOpen && (
            <div className="fixed inset-0 z-50 md:hidden">
              <motion.button type="button" aria-label="Close admin menu" tabIndex={-1} className="absolute inset-0 bg-cocoa-950/60 backdrop-blur-[2px]" onClick={() => setMenuOpen(false)} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} />
              <motion.div
                role="dialog"
                aria-modal="true"
                aria-label="Admin menu"
                className="admin-espresso relative flex h-full w-[min(86vw,300px)] flex-col text-white shadow-2xl"
                initial={{ x: "-100%" }}
                animate={{ x: 0 }}
                exit={{ x: "-100%" }}
                transition={{ type: "spring", stiffness: 380, damping: 38 }}
              >
                <div className="flex items-center pr-3">
                  <SidebarBrand role={role} />
                  <button type="button" aria-label="Close admin menu" onClick={() => setMenuOpen(false)} className="ml-auto flex h-10 w-10 items-center justify-center rounded-full text-white/70 hover:bg-white/10 hover:text-white">
                    <X className="h-5 w-5" aria-hidden="true" />
                  </button>
                </div>
                <LayoutGroup id="admin-drawer">
                  <AdminNav groups={groups} onSignOut={signOut} />
                </LayoutGroup>
                <UserCard user={user} />
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        <div className="relative isolate flex min-w-0 flex-1 flex-col">
          <div className="admin-ambient" aria-hidden="true" />
          <header className="sticky top-0 z-30 flex h-[var(--admin-topbar)] items-center gap-1.5 border-b border-sand-400/80 bg-panel/80 px-3 backdrop-blur-xl backdrop-saturate-150 sm:gap-2 sm:px-5 lg:px-8">
            <button type="button" aria-label="Open admin menu" aria-expanded={menuOpen} onClick={() => setMenuOpen(true)} className="flex h-10 w-10 items-center justify-center rounded-full text-cocoa-900 hover:bg-cocoa-900/[0.06] md:hidden">
              <Menu className="h-5 w-5" aria-hidden="true" />
            </button>
            <nav aria-label="Breadcrumb" className="min-w-0 flex-1">
              <ol className="flex min-w-0 items-center gap-1.5 text-[13px]">
                <li className="hidden text-ink-500 sm:block">{current?.group ?? "Admin"}</li>
                <li className="hidden sm:block" aria-hidden="true">
                  <ChevronRight className="h-3.5 w-3.5 text-sand-500" />
                </li>
                <li className="flex min-w-0 items-center gap-2 font-semibold text-cocoa-900" aria-current="page">
                  {current?.item.icon && <current.item.icon className="hidden h-4 w-4 shrink-0 text-brown-700 sm:block" strokeWidth={1.75} aria-hidden="true" />}
                  <span className="truncate">{current?.item.label ?? "Admin"}</span>
                </li>
              </ol>
            </nav>
            <button
              type="button"
              onClick={() => setPaletteOpen(true)}
              aria-label="Search the admin"
              className="group flex h-10 items-center gap-2.5 rounded-full border border-sand-500 bg-panel-muted px-2.5 text-sm text-ink-500 transition-all hover:border-brown-700 hover:text-cocoa-900 active:scale-[0.98] sm:w-56 sm:px-4 lg:w-80"
            >
              <Search className="h-4 w-4 shrink-0 transition-colors group-hover:text-brown-700" aria-hidden="true" />
              <span className="hidden flex-1 text-left sm:block">Search…</span>
              <kbd className="hidden rounded-full border border-sand-500 bg-panel px-2 py-0.5 font-sans text-[11px] text-ink-500 sm:block">⌘K</kbd>
            </button>
            <ThemeToggle resolved={resolved} onToggle={() => setTheme(dark ? "light" : "dark")} />
            <NotificationBell />
            <span className="mx-1 hidden h-6 w-px bg-sand-400 sm:block" aria-hidden="true" />
            <UserMenu user={user} onSignOut={signOut} theme={theme} onTheme={setTheme} />
          </header>
          <main id="main" className="min-w-0 flex-1">
            <motion.div key={pathname} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, ease: EASE }} className="h-full">
              <Outlet />
            </motion.div>
          </main>
          <Toaster toasts={toasts} onDismiss={dismiss} />
        </div>
        <button type="button" onClick={() => setPaletteOpen(true)} aria-label="Quick actions" title="Quick actions (⌘K)" className="admin-fab">
          <Zap className="h-6 w-6" strokeWidth={1.75} aria-hidden="true" />
        </button>
        <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} groups={groups} isAdmin={role === "admin"} onTheme={setTheme} theme={theme} />
      </div>
    </MotionConfig>
  );
}
