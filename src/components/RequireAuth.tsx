import { Navigate, useLocation } from "react-router-dom";
import type { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";

import { useAuth } from "@/contexts/useAuth";
import { Spinner } from "@/components/ui/spinner";
import { Button } from "@/components/ui/button";
import { managerApi, managerKeys } from "@/api/manager";
import { apiErrorMessage } from "@/api/client";

/**
 * Gate that wraps any route requiring an authenticated user (or a demo
 * session). Anonymous users are bounced back to the landing page with the
 * attempted path preserved as ?redirect= so we can send them back after login.
 *
 * Also enforces the one-time onboarding/profile-selection step. The source of
 * truth is the server manager profile (GET /api/manager/profile); the local
 * marker is only a fallback while the request is in flight or unreachable.
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

  const onboardingRoute = location.pathname.startsWith("/app/onboarding");
  const needsProfile = requireOnboarding && !isDemo && Boolean(user) && !onboardingRoute;

  const profileQuery = useQuery({
    queryKey: managerKeys.profile,
    queryFn: () => managerApi.remote.getProfile(),
    enabled: needsProfile,
    staleTime: 60_000,
  });

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

  if (needsProfile) {
    // Wait for the server answer instead of redirecting on stale local state.
    if (profileQuery.isPending) {
      return (
        <div className="flex min-h-screen items-center justify-center bg-background">
          <Spinner size="lg" label="Loading your profile…" />
        </div>
      );
    }

    if (profileQuery.isError) {
      return (
        <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background px-6 text-center">
          <p className="max-w-md text-sm text-muted-foreground">
            {apiErrorMessage(profileQuery.error)}
          </p>
          <Button onClick={() => profileQuery.refetch()}>Retry</Button>
        </div>
      );
    }

    if (!profileQuery.data?.onboarding_profile_selected) {
      return <Navigate to="/app/onboarding" replace />;
    }
  }

  return <>{children}</>;
}
