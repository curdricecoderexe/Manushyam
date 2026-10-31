import { Navigate } from "react-router";
import { StoreLayout } from "../components/layout/StoreLayout";
import { RouteError } from "../components/ErrorBoundary";
import { ProtectedRoute } from "../auth/ProtectedRoute";
import { AuthLayout } from "../pages/auth/AuthLayout";
import { AccountLayout } from "../pages/account/AccountLayout";

// Each page is its own chunk.
const page = (loader) => ({ lazy: async () => ({ Component: (await loader()).default }) });
const newsletter = (mode) => ({
  lazy: async () => {
    const { default: Newsletter } = await import("../pages/store/Newsletter");
    return { Component: () => <Newsletter mode={mode} /> };
  },
});

export const routes = [
  {
    path: "/",
    element: <StoreLayout />,
    errorElement: <RouteError />,
    children: [
      { index: true, ...page(() => import("../pages/store/Home")) },
      { path: "solutions", ...page(() => import("../pages/store/Solutions")) },
      { path: "solutions/:slug", ...page(() => import("../pages/store/ProductDetail")) },
      { path: "about", ...page(() => import("../pages/store/About")) },
      { path: "ingredients", ...page(() => import("../pages/store/Ingredients")) },
      { path: "blog", ...page(() => import("../pages/store/Blog")) },
      { path: "blog/:slug", ...page(() => import("../pages/store/BlogPost")) },
      { path: "faq", ...page(() => import("../pages/store/Faq")) },
      { path: "contact", ...page(() => import("../pages/store/Contact")) },
      { path: "newsletter/confirm", ...newsletter("confirm") },
      { path: "newsletter/unsubscribe", ...newsletter("unsubscribe") },
      { path: "policies", element: <Navigate to="/policies/shipping" replace /> },
      { path: "policies/:slug", ...page(() => import("../pages/store/Policy")) },
      { path: "search", ...page(() => import("../pages/store/Search")) },
      {
        path: "wishlist",
        element: <ProtectedRoute />,
        children: [{ index: true, ...page(() => import("../pages/store/Wishlist")) }],
      },
      { path: "cart", ...page(() => import("../pages/store/Cart")) },
      {
        path: "checkout",
        element: <ProtectedRoute />,
        children: [
          { index: true, ...page(() => import("../pages/checkout/Checkout")) },
          { path: "success/:orderNumber", lazy: async () => ({ Component: (await import("../pages/checkout/OrderResult")).OrderPlaced }) },
          { path: "failed/:orderNumber", lazy: async () => ({ Component: (await import("../pages/checkout/OrderResult")).PaymentFailed }) },
        ],
      },
      { path: "track-order", ...page(() => import("../pages/store/TrackOrder")) },
      {
        path: "account",
        element: (
          <ProtectedRoute>
            <AccountLayout />
          </ProtectedRoute>
        ),
        children: [
          { index: true, ...page(() => import("../pages/account/Orders")) },
          { path: "orders", ...page(() => import("../pages/account/Orders")) },
          { path: "orders/:orderNumber", ...page(() => import("../pages/account/OrderDetail")) },
          { path: "addresses", ...page(() => import("../pages/account/Addresses")) },
          { path: "profile", ...page(() => import("../pages/account/Profile")) },
          { path: "notifications", ...page(() => import("../pages/account/Notifications")) },
          { path: "privacy", ...page(() => import("../pages/account/Privacy")) },
        ],
      },
      ...(import.meta.env.DEV ? [{ path: "styleguide", ...page(() => import("../pages/Styleguide")) }] : []),
      { path: "*", ...page(() => import("../pages/NotFound")) },
    ],
  },
  {
    element: <AuthLayout />,
    errorElement: <RouteError />,
    children: [
      { path: "/login", ...page(() => import("../pages/auth/Login")) },
      { path: "/register", ...page(() => import("../pages/auth/Register")) },
      { path: "/forgot-password", ...page(() => import("../pages/auth/ForgotPassword")) },
    ],
  },
  {
    path: "/admin",
    element: <ProtectedRoute roles={["staff", "admin"]} />,
    errorElement: <RouteError />,
    children: [
      {
        // The admin shell is its own chunk, so shoppers never download it.
        lazy: async () => ({ Component: (await import("../components/layout/AdminLayout")).AdminLayout }),
        children: [
          { index: true, ...page(() => import("../pages/admin/Dashboard")) },
          { path: "orders", ...page(() => import("../pages/admin/Orders")) },
          { path: "products", ...page(() => import("../pages/admin/Inventory")) },
          { path: "products/new", ...page(() => import("../pages/admin/ProductEditor")) },
          { path: "products/:id", ...page(() => import("../pages/admin/ProductEditor")) },
          { path: "support", ...page(() => import("../pages/admin/SupportDesk")) },
          { path: "inbox", ...page(() => import("../pages/admin/Inbox")) },
          // Admin-only screens (the API refuses staff too).
          {
            element: <ProtectedRoute roles={["admin"]} />,
            children: [
              { path: "users", ...page(() => import("../pages/admin/Users")) },
              { path: "customers", element: <Navigate to="/admin/users" replace /> },
              { path: "coupons", ...page(() => import("../pages/admin/Coupons")) },
              { path: "delivery", ...page(() => import("../pages/admin/Delivery")) },
              { path: "content", ...page(() => import("../pages/admin/Content")) },
              { path: "blog", ...page(() => import("../pages/admin/BlogPosts")) },
              { path: "blog/new", ...page(() => import("../pages/admin/BlogEditor")) },
              { path: "blog/:id", ...page(() => import("../pages/admin/BlogEditor")) },
              { path: "reviews", ...page(() => import("../pages/admin/Reviews")) },
              { path: "analytics", ...page(() => import("../pages/admin/Analytics")) },
              { path: "web-analytics", ...page(() => import("../pages/admin/WebAnalytics")) },
              { path: "settings", ...page(() => import("../pages/admin/Settings")) },
            ],
          },
          { path: "*", ...page(() => import("../pages/NotFound")) },
        ],
      },
    ],
  },
];
