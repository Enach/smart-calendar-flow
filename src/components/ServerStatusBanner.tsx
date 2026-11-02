import { AlertTriangle, RefreshCw, WifiOff } from "lucide-react";

import { apiErrorMessage } from "@/api/client";
import { useHealthPing } from "@/hooks/useHealthPing";
import { useAuth } from "@/contexts/useAuth";

export const SERVER_UNREACHABLE_MESSAGE = "Can't reach Paceday right now. What's on screen may be out of date.";

/**
 * The persistent server-status banner (Dashboard, Settings, Audit). PAC-83: a
 * failed probe only changes this banner — it never switches what data calls
 * return, and it never mentions demo or preview data. Not shown in a demo.
 */
export function ServerStatusBanner() {
  const { isDemo } = useAuth();
  if (isDemo) return null;
  return <ServerStatusBannerInner />;
}

function ServerStatusBannerInner() {
  const health = useHealthPing(30_000);

  if (health.status === "unhealthy") {
    return (
      <div className="flex items-center justify-center gap-2 border-b border-destructive/30 bg-destructive/10 px-4 py-2 text-center text-sm font-medium text-destructive">
        <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
        <span>Paceday answered with an error — {apiErrorMessage(health.error)} What's on screen may be out of date.</span>
        <button
          type="button"
          onClick={() => void health.retry()}
          className="inline-flex min-h-8 items-center gap-1 rounded border border-destructive/40 px-2 py-1 font-medium hover:bg-destructive/10"
        >
          <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
          Retry
        </button>
      </div>
    );
  }

  if (health.status !== "offline") return null;
  return (
    <div
      role="status"
      data-testid="server-unreachable-banner"
      className="flex items-center justify-center gap-2 border-b border-warning/30 bg-warning/10 px-4 py-2 text-center text-sm font-medium text-foreground"
    >
      <WifiOff className="h-3.5 w-3.5" aria-hidden="true" />
      <span>{SERVER_UNREACHABLE_MESSAGE}</span>
      <button
        type="button"
        data-testid="server-unreachable-retry"
        onClick={() => void health.retry()}
        className="inline-flex min-h-8 items-center gap-1 rounded border border-border px-2 py-1 font-medium hover:bg-muted"
      >
        <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
        Retry
      </button>
    </div>
  );
}
