import { useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import { useAuth } from "@/contexts/useAuth";
import { Spinner } from "@/components/ui/spinner";

/** The sign-in failure state (PAC-35): the landing page shows it from this URL. */
const SIGN_IN_FAILED_PATH = "/?error=auth_failed";

/**
 * OAuth callback landing page. The backend has just set the session
 * cookie and redirected here; we re-fetch /me and route accordingly. When the
 * server says there is no session, the user sees the sign-in failure state
 * instead of being sent on as if signed in (PAC-35 AC-6).
 */
export default function AuthCallback() {
  const { refresh } = useAuth();
  const navigate = useNavigate();
  const { search } = useLocation();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const me = await refresh();
        if (cancelled) return;
        if (me === null) {
          navigate(SIGN_IN_FAILED_PATH, { replace: true });
          return;
        }
        const params = new URLSearchParams(search);
        const redirect = sanitizeRedirect(params.get("redirect"));
        navigate(redirect ?? "/app", { replace: true });
      } catch {
        if (!cancelled) navigate(SIGN_IN_FAILED_PATH, { replace: true });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [refresh, navigate, search]);

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
