import { render } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { HelmetProvider } from "react-helmet-async";
import { routes } from "../app/routes";
import { AuthProvider } from "../auth/AuthProvider";
import { RealtimeProvider } from "../realtime/RealtimeProvider";
import { CartProvider } from "../cart/CartProvider";
import { WishlistProvider } from "../wishlist/WishlistProvider";
import { ToastProvider } from "../toast/ToastProvider";

// Renders the real route table at a URL, as the app would.
export function renderRoute(path, { introSeen = true } = {}) {
  if (introSeen) sessionStorage.setItem("mm_intro_seen", "1");
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  const utils = render(
    <HelmetProvider>
      <AuthProvider>
        <RealtimeProvider>
          <CartProvider>
            <WishlistProvider>
              <ToastProvider>
                <RouterProvider router={router} />
              </ToastProvider>
            </WishlistProvider>
          </CartProvider>
        </RealtimeProvider>
      </AuthProvider>
    </HelmetProvider>,
  );
  return { router, ...utils };
}
