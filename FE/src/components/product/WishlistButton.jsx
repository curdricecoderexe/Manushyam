import { useState } from "react";
import { useLocation, useNavigate } from "react-router";
import { useAuth } from "../../auth/context";
import { useWishlist } from "../../wishlist/context";
import { useToast } from "../../toast/context";
import { cn } from "../../lib/cn";
import { ICONS } from "../ui/icon-paths";

// Heart toggle. Guests are sent to sign in first (the wishlist is saved to the account).
export function WishlistButton({ slug, name, variant = "icon", className }) {
  const { isAuthenticated } = useAuth();
  const wishlist = useWishlist();
  const { toast } = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const [busy, setBusy] = useState(false);
  const saved = wishlist.has(slug);

  const onClick = async () => {
    if (!isAuthenticated) {
      navigate(`/login?next=${encodeURIComponent(location.pathname + location.search)}`);
      return;
    }
    setBusy(true);
    try {
      await wishlist.toggle(slug);
      toast(saved ? { message: `Removed ${name} from your wishlist.`, tone: "info" } : { message: "Saved to your wishlist.", action: { label: "View", to: "/wishlist" } });
    } catch (err) {
      toast({ message: err.message, tone: "error" });
    } finally {
      setBusy(false);
    }
  };

  const heart = (
    <svg width="18" height="18" viewBox="0 0 24 24" fill={saved ? "#7A3A12" : "none"} stroke="#7A3A12" strokeWidth="1.7" strokeLinejoin="round" aria-hidden="true">
      <path d={ICONS.heart} />
    </svg>
  );

  if (variant === "text") {
    return (
      <button type="button" onClick={onClick} disabled={busy} aria-pressed={saved} className={cn("flex items-center gap-2 py-1.5 text-[15px] text-cocoa-900 hover:text-gold-700", className)}>
        {heart}
        {saved ? "Saved to wishlist" : "Add to wishlist"}
      </button>
    );
  }
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      aria-pressed={saved}
      aria-label={saved ? `Remove ${name} from wishlist` : `Add ${name} to wishlist`}
      className={cn("flex h-10 w-10 items-center justify-center rounded-full border border-sand-400 bg-cream-50 shadow-sm transition-transform hover:scale-105", className)}
    >
      {heart}
    </button>
  );
}
