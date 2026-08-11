import { useEffect, useState } from "react";
import { apiErrorMessage, subscribeMockMode } from "@/api/client";
import { useHealthPing } from "@/hooks/useHealthPing";
import { AlertTriangle, RefreshCw, Wifi } from "lucide-react";

export function MockBanner() {
  const [on, setOn] = useState(false);
  const health = useHealthPing(30_000);
  useEffect(() => subscribeMockMode(setOn), []);

  if (health.status === "unhealthy") {
    return (
      <div className="flex items-center justify-center gap-2 border-b border-destructive/30 bg-destructive/10 px-4 py-1.5 text-center text-[11px] font-medium text-destructive">
        <AlertTriangle className="h-3 w-3" />
        <span>Backend reachable but unhealthy — {apiErrorMessage(health.error)} Data shown may be out of date.</span>
        <button
          type="button"
          onClick={() => void health.retry()}
          className="inline-flex items-center gap-1 rounded border border-destructive/40 px-1.5 py-0.5 font-medium hover:bg-destructive/10"
        >
          <RefreshCw className="h-3 w-3" />
          Retry
        </button>
      </div>
    );
  }

  if (!on) return null;
  return (
    <div className="border-b border-warning/30 bg-warning/10 px-4 py-1.5 text-center text-[11px] font-medium text-warning">
      <Wifi className="mr-1 inline h-3 w-3" />
      Backend not reachable — showing demo data. Connect your Go backend at <code className="font-mono">/api</code> to use real data.
    </div>
  );
}
