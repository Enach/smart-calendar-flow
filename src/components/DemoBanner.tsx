import { useEffect, useState } from "react";
import { X } from "lucide-react";

import { useAuth } from "@/contexts/useAuth";

const DISMISS_KEY = "paceday:demo-banner-dismissed";

/**
 * Sticky banner shown across the app while the user is in demo mode.
 * Dismissable for the session only — re-appears on a fresh tab.
 */
export function DemoBanner() {
  const { isDemo } = useAuth();
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    try {
      setDismissed(sessionStorage.getItem(DISMISS_KEY) === "1");
    } catch {
      /* ignore */
    }
  }, []);

  if (!isDemo || dismissed) return null;

  return (
    <div
      role="status"
      className="flex items-center justify-between gap-3 px-4 py-2 text-[13px] font-medium"
      style={{ backgroundColor: "#E9B949", color: "#1A1A1A", fontFamily: "Inter, sans-serif" }}
    >
      <span>
        <strong className="font-semibold">Demo mode</strong> — backend is offline. Data is
        simulated and changes will not be saved.
      </span>
      <button
        type="button"
        onClick={() => {
          try {
            sessionStorage.setItem(DISMISS_KEY, "1");
          } catch {
            /* ignore */
          }
          setDismissed(true);
        }}
        aria-label="Dismiss demo banner"
        className="rounded p-1 transition hover:bg-black/10"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
