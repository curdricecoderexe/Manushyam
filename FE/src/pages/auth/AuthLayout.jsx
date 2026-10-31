import { Link, Outlet } from "react-router";
import { ShieldCheck, Truck, Lock } from "lucide-react";
import { useAppearance } from "../../lib/appearance";
import logoIvory from "../../assets/brand/logo-ivory.png";

export function AuthLayout() {
  const panel = useAppearance("authPanel");
  return (
    <div className="flex min-h-screen flex-col bg-cream-100 lg:flex-row">
      <aside className="relative flex min-h-[300px] flex-col justify-between overflow-hidden bg-cocoa-950 px-6 py-8 lg:w-[46%] lg:px-14 lg:py-10">
        <img src={panel.src} alt="" className="absolute inset-0 h-full w-full object-cover opacity-55" />
        <div className="absolute inset-0 bg-gradient-to-b from-cocoa-950/20 to-cocoa-950/90" aria-hidden="true" />
        <Link to="/" aria-label="ManushyaM home" className="relative self-start">
          <img src={logoIvory} alt="ManushyaM" className="h-14 w-auto" />
        </Link>
        <div className="relative flex max-w-md flex-col gap-3 text-ivory">
          <p className="font-display text-[clamp(2.25rem,3.6vw,3.25rem)] leading-[1.05]">Rooted in Ritual.</p>
          <p className="text-[#E9DEC9]">Track orders, save addresses, and get first access to new Ayurvedic launches.</p>
          <ul className="mt-1 flex flex-wrap gap-4 text-[13px] text-gold-400">
            <li className="flex items-center gap-1.5"><ShieldCheck className="h-4 w-4" aria-hidden="true" />OTP-secured login</li>
            <li className="flex items-center gap-1.5"><Truck className="h-4 w-4" aria-hidden="true" />Free shipping</li>
          </ul>
        </div>
      </aside>
      <main id="main" className="flex flex-1 items-center justify-center px-5 py-12">
        <div className="flex w-full max-w-[440px] flex-col gap-6">
          <Outlet />
          <p className="flex items-center justify-center gap-1.5 text-center text-[13px] text-ink-500">
            <Lock className="h-3.5 w-3.5" aria-hidden="true" />
            Protected by OTP verification &amp; encrypted sessions
          </p>
        </div>
      </main>
    </div>
  );
}
