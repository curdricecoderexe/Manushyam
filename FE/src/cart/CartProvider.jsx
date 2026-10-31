import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CartContext, CART_COUPON_KEY, CART_KEY, EMPTY_CART, MAX_LINES, MAX_QTY } from "./context";
import { useAuth } from "../auth/context";
import { api } from "../lib/api";

// Guest cart: only SKUs and quantities live in localStorage — never prices. Everything shown is
// priced by the server (/api/cart/validate for guests, /api/cart for signed-in customers).
function readLocal() {
  try {
    const items = JSON.parse(localStorage.getItem(CART_KEY) || "[]");
    if (!Array.isArray(items)) return [];
    return items
      .filter((i) => typeof i?.sku === "string" && /^[A-Za-z0-9-]{3,40}$/.test(i.sku) && Number.isInteger(i?.qty) && i.qty > 0)
      .slice(0, MAX_LINES)
      .map((i) => ({ sku: i.sku.toUpperCase(), qty: Math.min(i.qty, MAX_QTY) }));
  } catch {
    return [];
  }
}

function readLocalCoupon() {
  try {
    return localStorage.getItem(CART_COUPON_KEY) || "";
  } catch {
    return "";
  }
}

function writeLocal(items, coupon) {
  try {
    localStorage.setItem(CART_KEY, JSON.stringify(items));
    if (coupon) localStorage.setItem(CART_COUPON_KEY, coupon);
    else localStorage.removeItem(CART_COUPON_KEY);
  } catch {
    // Storage blocked (private mode): the cart still works for this visit.
  }
}

const sameItems = (a, b) => a.length === b.length && a.every((x, i) => x.sku === b[i].sku && x.qty === b[i].qty);

export function CartProvider({ children }) {
  const { status: authStatus } = useAuth();
  const signedIn = authStatus === "authenticated";
  const [localItems, setLocalItems] = useState(readLocal);
  const [localCoupon, setLocalCoupon] = useState(readLocalCoupon);
  // Priced carts from the API, kept apart so a guest never sees a signed-out account's cart.
  const [guestCart, setGuestCart] = useState(null);
  const [accountCart, setAccountCart] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const seq = useRef(0); // ignore responses that arrive out of order
  // Items the server just returned are already priced; re-pricing them would also wipe the
  // "quantity adjusted" notice that came with that response.
  const serverItems = useRef(null);

  useEffect(() => writeLocal(localItems, localCoupon), [localItems, localCoupon]);

  // Keep tabs in sync for guests.
  useEffect(() => {
    const onStorage = (e) => {
      if (e.key === CART_KEY) setLocalItems(readLocal());
      if (e.key === CART_COUPON_KEY) setLocalCoupon(readLocalCoupon());
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const run = useCallback(async (request, setCart) => {
    const id = ++seq.current;
    const data = await request();
    if (id === seq.current && data?.cart) {
      setCart(data.cart);
      setLoadError(null);
    }
    return data?.cart;
  }, []);

  // Guests: re-price whenever the stored items or coupon change.
  useEffect(() => {
    if (authStatus !== "anonymous" || !localItems.length) return;
    if (serverItems.current === localItems) return;
    run(() => api("/api/cart/validate", { method: "POST", auth: false, body: { items: localItems, ...(localCoupon ? { couponCode: localCoupon } : {}) } }), setGuestCart)
      .then((cart) => {
        if (!cart) return;
        // The server removed unavailable products or clamped quantities to stock: store that.
        if (!sameItems(cart.items, localItems)) {
          serverItems.current = cart.items;
          setLocalItems(cart.items);
        }
        if (localCoupon && cart.coupon && !cart.coupon.applied && cart.coupon.reason !== "MIN_ORDER") setLocalCoupon("");
      })
      .catch((err) => setLoadError(err));
  }, [authStatus, localItems, localCoupon, run]);

  // Signing in: fold the guest cart into the account cart once, then forget the local copy.
  // Signing out: start from an empty guest cart.
  const merged = useRef(false);
  useEffect(() => {
    if (authStatus === "authenticated" && !merged.current) {
      merged.current = true;
      const items = readLocal();
      const couponCode = readLocalCoupon();
      const request = items.length ? () => api("/api/cart/merge", { method: "POST", body: { items, ...(couponCode ? { couponCode } : {}) } }) : () => api("/api/cart");
      run(request, setAccountCart)
        .then(() => {
          setLocalItems([]);
          setLocalCoupon("");
        })
        .catch((err) => setLoadError(err));
    }
    if (authStatus === "anonymous") merged.current = false;
  }, [authStatus, run]);

  // Guests see their stored count immediately, before the priced cart comes back.
  const localCount = localItems.reduce((n, i) => n + i.qty, 0);
  const cart = useMemo(
    () => (signedIn ? (accountCart ?? EMPTY_CART) : localItems.length ? { ...(guestCart ?? EMPTY_CART), count: localCount } : EMPTY_CART),
    [signedIn, accountCart, guestCart, localItems.length, localCount]
  );
  const priced = signedIn ? accountCart : guestCart;

  const qtyOf = useCallback((sku) => (signedIn ? cart.items : localItems).find((i) => i.sku === sku)?.qty ?? 0, [signedIn, cart.items, localItems]);

  const setQty = useCallback(
    async (sku, qty) => {
      const next = Math.max(0, Math.min(MAX_QTY, qty));
      if (signedIn) return run(() => api("/api/cart/items", { method: "PUT", body: { sku, qty: next } }), setAccountCart);
      setLocalItems((prev) => {
        if (next === 0) return prev.filter((i) => i.sku !== sku);
        if (prev.some((i) => i.sku === sku)) return prev.map((i) => (i.sku === sku ? { ...i, qty: next } : i));
        return prev.length >= MAX_LINES ? prev : [...prev, { sku, qty: next }];
      });
      return undefined;
    },
    [signedIn, run]
  );

  const addItem = useCallback(
    async ({ sku, qty = 1, openDrawer = true }) => {
      await setQty(sku, qtyOf(sku) + qty);
      if (openDrawer) setDrawerOpen(true);
    },
    [setQty, qtyOf]
  );

  const removeItem = useCallback((sku) => setQty(sku, 0), [setQty]);

  // Resolves with the coupon message, or throws an Error with the reason to show next to the field.
  const applyCoupon = useCallback(
    async (rawCode) => {
      const code = rawCode.trim().toUpperCase();
      if (signedIn) {
        const result = await run(() => api("/api/cart/coupon", { method: "POST", body: { code } }), setAccountCart);
        return result.coupon.message;
      }
      const result = await api("/api/cart/validate", { method: "POST", auth: false, body: { items: localItems, couponCode: code } });
      if (!result.cart.coupon?.applied) throw new Error(result.cart.coupon?.message || "This code isn’t valid.");
      seq.current += 1;
      setGuestCart(result.cart);
      setLocalCoupon(code);
      return result.cart.coupon.message;
    },
    [signedIn, run, localItems]
  );

  const removeCoupon = useCallback(async () => {
    if (signedIn) return run(() => api("/api/cart/coupon", { method: "DELETE" }), setAccountCart);
    setLocalCoupon("");
    return undefined;
  }, [signedIn, run]);

  // After checkout the server empties the cart; fetch it again.
  const reload = useCallback(() => (signedIn ? run(() => api("/api/cart"), setAccountCart).catch(() => undefined) : Promise.resolve()), [signedIn, run]);

  const value = useMemo(
    () => ({
      cart,
      count: cart.count,
      // True until the first priced cart arrives (an empty guest cart needs no request).
      isLoading: authStatus === "loading" || (cart.count > 0 && !priced) || (signedIn && !accountCart),
      error: loadError,
      addItem,
      setQty,
      removeItem,
      applyCoupon,
      removeCoupon,
      reload,
      qtyOf,
      drawerOpen,
      openDrawer: () => setDrawerOpen(true),
      closeDrawer: () => setDrawerOpen(false),
    }),
    [cart, authStatus, priced, signedIn, accountCart, loadError, addItem, setQty, removeItem, applyCoupon, removeCoupon, reload, qtyOf, drawerOpen]
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}
