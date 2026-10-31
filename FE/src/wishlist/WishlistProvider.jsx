import { useCallback, useEffect, useMemo, useState } from "react";
import { WishlistContext } from "./context";
import { useAuth } from "../auth/context";
import { api } from "../lib/api";

// The wishlist is saved to the account ("synced to your account" in the design), so it needs sign-in.
export function WishlistProvider({ children }) {
  const { status, user } = useAuth();
  const [state, setState] = useState({ userId: null, products: null, error: null });

  useEffect(() => {
    if (status !== "authenticated") return;
    let cancelled = false;
    api("/api/wishlist")
      .then((data) => !cancelled && setState({ userId: user.id, products: data.products, error: null }))
      .catch((error) => !cancelled && setState({ userId: user.id, products: null, error }));
    return () => {
      cancelled = true;
    };
  }, [status, user?.id]);

  // Ignore a list that belongs to someone who has since signed out.
  const products = status === "authenticated" && state.userId === user?.id ? state.products : null;

  const add = useCallback(async (slug) => {
    const data = await api("/api/wishlist", { method: "POST", body: { slug } });
    setState((s) => ({ ...s, products: data.products }));
  }, []);
  const remove = useCallback(async (slug) => {
    const data = await api(`/api/wishlist/${encodeURIComponent(slug)}`, { method: "DELETE" });
    setState((s) => ({ ...s, products: data.products }));
  }, []);

  const value = useMemo(() => {
    const slugs = new Set((products ?? []).map((p) => p.slug));
    return {
      products: products ?? [],
      isLoading: status === "loading" || (status === "authenticated" && products === null && !state.error),
      error: state.error,
      has: (slug) => slugs.has(slug),
      add,
      remove,
      toggle: (slug) => (slugs.has(slug) ? remove(slug) : add(slug)),
    };
  }, [products, status, state.error, add, remove]);

  return <WishlistContext.Provider value={value}>{children}</WishlistContext.Provider>;
}
