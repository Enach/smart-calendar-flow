import { AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";

interface InlineErrorProps {
  title?: string;
  message?: string;
  onRetry?: () => void;
  retrying?: boolean;
  className?: string;
  compact?: boolean;
}

export function InlineError({
  title = "Couldn't load",
  message = "Something went wrong. Please try again.",
  onRetry,
  retrying = false,
  className,
  compact = false,
}: InlineErrorProps) {
  return (
    <div
      role="alert"
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
      {onRetry && (
        <Button
          type="button"
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
