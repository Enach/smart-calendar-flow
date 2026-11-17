import { useState } from "react";
import { AlertTriangle, RotateCcw } from "lucide-react";
import { useNavigate } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { apiFailureMessage, classifyApiFailure, isApiHttpError } from "@/api/client";
import { useAuth } from "@/contexts/useAuth";

export const SIGN_OUT_NOT_CONFIRMED_TITLE = "Sign-out not confirmed";
export const SIGN_OUT_NOT_CONFIRMED_TEXT =
  "Paceday didn't confirm that you're signed out, so you are still signed in on this device. If this is a shared computer, don't leave it until sign-out is confirmed.";
const SERVER_PROBLEM = "The server had a problem. Try again shortly.";

/**
 * Why the sign-out was not confirmed, in the PAC-83 wording. Retrying a
 * sign-out is safe (it only expires this browser's cookie), so a lost answer
 * gets the read wording, which offers a retry, not the write one.
 */
function reasonFor(error: unknown): string {
  // A JSON 5xx carries the server's terse detail ("internal error"); say it plainly.
  if (isApiHttpError(error) && error.status >= 500 && classifyApiFailure(error) === "http") return SERVER_PROBLEM;
  return apiFailureMessage(error, "read").message;
}

/**
 * SF-004: shown when POST /api/auth/logout failed. The session cookie may
 * still be live, so the user stays signed in and is told so, with a Retry.
 */
export function SignOutFailedAlert() {
  const { signOutFailure, logout, dismissSignOutFailure } = useAuth();
  const navigate = useNavigate();
  const [retrying, setRetrying] = useState(false);
  if (!signOutFailure) return null;

  const retry = async () => {
    setRetrying(true);
    try {
      if (await logout()) navigate("/", { replace: true });
    } finally {
      setRetrying(false);
    }
  };

  const reason = reasonFor(signOutFailure.error);
  return (
    <div
      role="alert"
      data-testid="sign-out-failed"
      data-error-kind={classifyApiFailure(signOutFailure.error)}
      className="flex flex-wrap items-start justify-center gap-3 border-b border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-foreground"
    >
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" aria-hidden="true" />
      <div className="min-w-0 max-w-2xl flex-1">
        <p className="font-medium">{SIGN_OUT_NOT_CONFIRMED_TITLE}</p>
        <p>
          {SIGN_OUT_NOT_CONFIRMED_TEXT}
          {reason ? ` ${reason}` : ""}
        </p>
      </div>
      <div className="flex shrink-0 gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          data-testid="sign-out-retry"
          onClick={() => void retry()}
          disabled={retrying}
        >
          <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
          {retrying ? "Signing out…" : "Retry sign-out"}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={dismissSignOutFailure} disabled={retrying}>
          Dismiss
        </Button>
      </div>
    </div>
  );
}
