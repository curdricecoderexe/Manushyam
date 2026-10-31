import { Navigate, Outlet, useLocation } from "react-router";
import { useAuth } from "./context";
import { Skeleton } from "../components/ui/primitives";

// Client-side gate for UX only — the API enforces the same roles on every request.
export function ProtectedRoute({ roles, children }) {
  const { status, user } = useAuth();
  const location = useLocation();

  if (status === "loading") {
    return (
      <div className="container-page flex flex-col gap-4 py-16" aria-busy="true" aria-label="Loading your account">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  if (status !== "authenticated") {
    const next = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/login?next=${next}`} replace />;
  }

  if (roles && !roles.includes(user.role)) {
    return (
      <div className="container-page flex min-h-[50vh] flex-col items-start justify-center gap-4 py-16">
        <h1 className="text-4xl">You don’t have access to this page</h1>
        <p>This area is for the ManushyaM team. If you think this is a mistake, contact your administrator.</p>
      </div>
    );
  }

  return children ?? <Outlet />;
}
