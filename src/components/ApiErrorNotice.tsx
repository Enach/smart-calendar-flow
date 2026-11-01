import { AlertCircle, RotateCcw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { apiFailureMessage, classifyApiFailure, type ApiEffect } from "@/api/client";
import { cn } from "@/lib/utils";

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
          disabled={retrying}
          className="shrink-0"
        >
          <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" /> Try again
        </Button>
      )}
    </div>
  );
}
