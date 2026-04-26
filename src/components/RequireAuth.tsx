import { Navigate } from "react-router-dom";
import type { ReactNode } from "react";

import { useAuth } from "@/contexts/AuthContext";
import { Spinner } from "@/components/ui/spinner";

/**
 * Gate that wraps any route requiring an authenticated user (or a demo
 * session). Anonymous users are bounced back to the landing page.
 */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { user, isDemo, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Spinner size="lg" label="Loading…" />
      </div>
    );
  }

  if (!user && !isDemo) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}
