import { AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";
import { apiFailureMessage, classifyApiFailure, type ApiEffect } from "@/api/client";

interface InlineErrorProps {
  title?: string;
  message?: string;
  onRetry?: () => void;
  retrying?: boolean;
  className?: string;
  compact?: boolean;
  /**
   * PAC-83: the API failure shown. With `effect`, the notice carries the e2e
   * contract's `api-error` test id and kind, and the retry control is offered
   * only when the failure allows a manual retry.
   */
  error?: unknown;
  effect?: ApiEffect;
}

export function InlineError({
  title = "Couldn't load",
  message = "Something went wrong. Please try again.",
  onRetry,
  retrying = false,
  className,
  compact = false,
  error,
  effect,
}: InlineErrorProps) {
  const tagged = effect !== undefined && error !== undefined;
  const showRetry = onRetry && (!tagged || apiFailureMessage(error, effect).retry);
  return (
    <div
      role="alert"
      data-testid={tagged ? "api-error" : undefined}
      data-error-kind={tagged ? classifyApiFailure(error) : undefined}
      data-effect={tagged ? effect : undefined}
      className={cn(
        "flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-destructive/40 bg-destructive/5 text-center",
        compact ? "p-3" : "p-5",
        className,
      )}
    >
      <AlertTriangle
        className={cn("text-destructive", compact ? "h-4 w-4" : "h-5 w-5")}
        aria-hidden="true"
      />
      <div className="space-y-0.5">
        <p
          className={cn(
            "font-medium text-foreground",
            compact ? "text-xs" : "text-sm",
          )}
        >
          {title}
        </p>
        <p className={cn("text-muted-foreground", compact ? "text-[11px]" : "text-xs")}>
          {message}
        </p>
      </div>
      {showRetry && (
        <Button
          type="button"
          data-testid={tagged ? "api-error-retry" : undefined}
          variant="outline"
          size="sm"
          onClick={onRetry}
          disabled={retrying}
          className="mt-1 h-8"
        >
          {retrying ? (
            <>
              <Spinner className="h-3.5 w-3.5" />
              Retrying…
            </>
          ) : (
            <>
              <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
              Retry
            </>
          )}
        </Button>
      )}
    </div>
  );
}
