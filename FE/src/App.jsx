import { createBrowserRouter, RouterProvider } from "react-router";
import { HelmetProvider } from "react-helmet-async";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { routes } from "./app/routes";
import { AuthProvider } from "./auth/AuthProvider";
import { RealtimeProvider } from "./realtime/RealtimeProvider";
import { CartProvider } from "./cart/CartProvider";
import { WishlistProvider } from "./wishlist/WishlistProvider";
import { ToastProvider } from "./toast/ToastProvider";

const router = createBrowserRouter(routes);

export default function App() {
  return (
    <ErrorBoundary>
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
      </HelmetProvider>
    </ErrorBoundary>
  );
}
