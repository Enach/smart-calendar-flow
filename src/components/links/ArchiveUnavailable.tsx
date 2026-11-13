import { AlertCircle, RotateCcw } from "lucide-react";

import { Button } from "@/components/ui/button";

/**
 * PAC-40 (contract section 7, K4-7): the archive could not be read, either
 * because the server answered something other than 200 (an older server
 * answers 400) or because the body did not match the schema this build knows.
 * Nothing from the archive is shown and nothing is promised.
 */
export function ArchiveUnavailable({
  testId = "archive-unavailable",
  onRetry,
  retrying = false,
}: {
  testId?: string;
  onRetry?: () => void;
  retrying?: boolean;
}) {
  return (
    <div
      role="alert"
      data-testid={testId}
      className="flex items-start gap-3 rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3"
    >
      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" aria-hidden="true" />
      <p className="min-w-0 flex-1 text-sm text-foreground">
        The archive is unavailable right now. Your deleted links and their bookings are not shown.
      </p>
      {onRetry && (
        <Button type="button" size="sm" variant="outline" onClick={onRetry} disabled={retrying} className="shrink-0">
          <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" /> Try again
        </Button>
      )}
    </div>
  );
}
