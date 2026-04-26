import { Navigate, useLocation } from "react-router-dom";
import type { ReactNode } from "react";

import { useAuth } from "@/contexts/AuthContext";
import { Spinner } from "@/components/ui/spinner";

/**
 * Gate that wraps any route requiring an authenticated user (or a demo
 * session). Anonymous users are bounced back to the landing page with the
 * attempted path preserved as ?redirect= so we can send them back after login.
 */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { user, isDemo, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Spinner size="lg" label="Loading…" />
      </div>
    );
  }

  if (!user && !isDemo) {
    const attempted = `${location.pathname}${location.search}`;
    // Only preserve a redirect for non-default app paths.
    const search =
      attempted && attempted !== "/" && attempted !== "/app"
        ? `?redirect=${encodeURIComponent(attempted)}`
        : "";
    return <Navigate to={`/${search}`} replace />;
  }

  return <>{children}</>;
}
