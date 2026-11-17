import { useLayoutEffect, useRef, useState } from "react";
import { AlertTriangle, RotateCcw } from "lucide-react";
import { useNavigate } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { classifyApiFailure } from "@/api/client";
import { SIGN_OUT_NOT_CONFIRMED_TEXT, SIGN_OUT_NOT_CONFIRMED_TITLE, signOutFailureReason } from "./signOutFailure";
import { useAuth } from "@/contexts/useAuth";

/** Where focus goes when the alert is dismissed: the account menu, else the main content. */
function returnFocus() {
  const trigger = document.querySelector<HTMLElement>('[aria-label="Account menu"]');
  if (trigger) {
    trigger.focus();
    return;
  }
  const main = document.querySelector<HTMLElement>("main");
  if (main) {
    if (!main.hasAttribute("tabindex")) main.setAttribute("tabindex", "-1");
    main.focus();
  }
}

/**
 * SF-004: shown when POST /api/auth/logout failed. The session cookie may
 * still be live, so the user stays signed in and is told so, with a Retry.
 */
export function SignOutFailedAlert() {
  const { signOutFailure, logout, dismissSignOutFailure } = useAuth();
  const navigate = useNavigate();
  const [retrying, setRetrying] = useState(false);
  const retryRef = useRef<HTMLButtonElement>(null);
  // aria-busy, not disabled, keeps Retry focusable; this ref drops repeat clicks.
  const inFlight = useRef(false);

  // Move focus to Retry whenever a (new) failure is shown, so keyboard and
  // screen-reader users land on the way out of it. A layout effect, so the
  // focus moves in the same commit that shows the alert, never later.
  useLayoutEffect(() => {
    if (signOutFailure) retryRef.current?.focus();
  }, [signOutFailure]);

  if (!signOutFailure) return null;

  const retry = async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setRetrying(true);
    try {
      if (await logout()) navigate("/", { replace: true });
    } finally {
      inFlight.current = false;
      setRetrying(false);
    }
  };

  const dismiss = () => {
    if (inFlight.current) return;
    dismissSignOutFailure();
    returnFocus();
  };

  const reason = signOutFailureReason(signOutFailure.error);
  return (
    <div
      role="alert"
      data-testid="sign-out-failed"
      data-error-kind={classifyApiFailure(signOutFailure.error)}
      // Fixed above the sticky navbar (z-30) so it is seen however far the page is scrolled.
      className="fixed inset-x-0 top-0 z-40 flex flex-wrap items-start justify-center gap-3 border-b border-destructive/30 bg-background px-4 py-3 text-sm text-foreground shadow-md"
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
          ref={retryRef}
          onClick={() => void retry()}
          aria-busy={retrying}
        >
          <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
          {retrying ? "Signing out…" : "Retry sign-out"}
        </Button>
        <Button type="button" size="sm" variant="ghost" data-testid="sign-out-dismiss" onClick={dismiss}>
          Dismiss
        </Button>
      </div>
    </div>
  );
}
