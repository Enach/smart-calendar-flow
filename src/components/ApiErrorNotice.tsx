import { useEffect, useState } from "react";
import { AlertCircle, RotateCcw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { apiFailureMessage, classifyApiFailure, rateLimitRetryAfterMs, type ApiEffect } from "@/api/client";
import { cn } from "@/lib/utils";

/**
 * NEW-booking-rate-limit: a retry offered after a 429 waits out the server's
 * `Retry-After` (its own default when the answer carried none) before it can
 * be pressed, so the retry never spends the budget that is already gone.
 * Returns true for every other failure: nothing to wait for.
 */
function useRetryAllowed(error: unknown): boolean {
  const waitMs = rateLimitRetryAfterMs(error);
  const [allowed, setAllowed] = useState(waitMs === null || waitMs <= 0);
  useEffect(() => {
    if (waitMs === null || waitMs <= 0) {
      setAllowed(true);
      return;
    }
    setAllowed(false);
    const timer = setTimeout(() => setAllowed(true), waitMs);
    return () => clearTimeout(timer);
    // `error` identity: a refetch that is refused again restarts the wait.
  }, [error, waitMs]);
  return allowed;
}

/**
 * PAC-83 (spec §3.4, contract §5.1): an inline failure shown where the action
 * happened. `data-error-kind` / `data-effect` are a contract with the e2e
 * suite; the retry control appears only when a manual retry is offered (reads),
 * and nothing is shown for a request cancelled because the page is being left.
 */
export function ApiErrorNotice({
  error,
  effect,
  onRetry,
  retrying = false,
  shorten,
  message,
  className,
}: {
  error: unknown;
  effect: ApiEffect;
  onRetry?: () => void;
  retrying?: boolean;
  /** What to shorten when the request was too large (413). */
  shorten?: string;
  /** Replaces the computed text (the kind and effect attributes stay). */
  message?: string;
  className?: string;
}) {
  const kind = classifyApiFailure(error);
  const retryAllowed = useRetryAllowed(error);
  if (kind === "cancelled") return null;
  const failure = apiFailureMessage(error, effect, shorten);
  return (
    <div
      role="alert"
      data-testid="api-error"
      data-error-kind={kind}
      data-effect={effect}
      className={cn(
        "flex items-start gap-3 rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3",
        className,
      )}
    >
      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" aria-hidden="true" />
      <p className="min-w-0 flex-1 text-sm text-foreground">{message ?? failure.message}</p>
      {failure.retry && onRetry && (
        <Button
          type="button"
          size="sm"
          variant="outline"
          data-testid="api-error-retry"
          onClick={onRetry}
          disabled={retrying || !retryAllowed}
          className="shrink-0"
        >
          <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" /> Try again
        </Button>
      )}
    </div>
  );
}

/**
 * PAC-83: the message of an API failure as inline text, for surfaces that
 * already have their own layout and retry control. Carries the same e2e
 * contract (`api-error`, `data-error-kind`, `data-effect`) as ApiErrorNotice.
 */
export function ApiErrorText({ error, effect, className }: { error: unknown; effect: ApiEffect; className?: string }) {
  const kind = classifyApiFailure(error);
  if (kind === "cancelled") return null;
  return (
    <span data-testid="api-error" data-error-kind={kind} data-effect={effect} className={className}>
      {apiFailureMessage(error, effect).message}
    </span>
  );
}

