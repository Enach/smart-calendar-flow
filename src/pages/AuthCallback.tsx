import { useEffect } from "react";
import { useNavigate } from "react-router-dom";

import { useAuth } from "@/contexts/AuthContext";
import { Spinner } from "@/components/ui/spinner";

/**
 * OAuth callback landing page. The backend has just set the session
 * cookie and redirected here; we re-fetch /me and route accordingly.
 */
export default function AuthCallback() {
  const { refresh } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await refresh();
        if (cancelled) return;
        const params = new URLSearchParams(window.location.search);
        const redirect = sanitizeRedirect(params.get("redirect"));
        navigate(redirect ?? "/app", { replace: true });
      } catch {
        if (!cancelled) navigate("/?error=auth_failed", { replace: true });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [refresh, navigate]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <Spinner size="lg" label="Signing you in…" />
    </div>
  );
}

/** Only allow same-origin internal paths to prevent open-redirect. */
function sanitizeRedirect(value: string | null): string | null {
  if (!value) return null;
  if (!value.startsWith("/") || value.startsWith("//")) return null;
  return value;
}
