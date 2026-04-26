import { Navigate, useLocation } from "react-router-dom";
import type { ReactNode } from "react";

import { useAuth } from "@/contexts/AuthContext";
import { Spinner } from "@/components/ui/spinner";
import { managerApi } from "@/api/manager";

/**
 * Gate that wraps any route requiring an authenticated user (or a demo
 * session). Anonymous users are bounced back to the landing page with the
 * attempted path preserved as ?redirect= so we can send them back after login.
 *
 * Also enforces the one-time onboarding/profile-selection step:
 * authenticated (non-demo) users without `onboarding_profile_selected`
 * are routed to /app/onboarding before they can land on the app.
 */
export function RequireAuth({
  children,
  requireOnboarding = true,
}: {
  children: ReactNode;
  requireOnboarding?: boolean;
}) {
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
    const search =
      attempted && attempted !== "/" && attempted !== "/app"
        ? `?redirect=${encodeURIComponent(attempted)}`
        : "";
    return <Navigate to={`/${search}`} replace />;
  }

  // Demo mode skips onboarding entirely (mirrors T-26 behavior).
  if (
    requireOnboarding &&
    !isDemo &&
    user &&
    !managerApi.getProfile().onboarding_profile_selected &&
    !location.pathname.startsWith("/app/onboarding")
  ) {
    return <Navigate to="/app/onboarding" replace />;
  }

  return <>{children}</>;
}
