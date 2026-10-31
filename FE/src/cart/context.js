import { createContext, useContext } from "react";

export const CartContext = createContext(null);

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used inside <CartProvider>");
  return ctx;
}

export const CART_KEY = "mm_cart";
export const CART_COUPON_KEY = "mm_cart_coupon";
export const MAX_QTY = 10;
export const MAX_LINES = 20;

export const EMPTY_CART = Object.freeze({ items: [], lines: [], count: 0, subtotal: 0, discount: 0, shipping: 0, total: 0, coupon: null, issues: [], canCheckout: false });
