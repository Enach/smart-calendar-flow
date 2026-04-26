import { useEffect } from "react";
import { api } from "@/api/client";

/**
 * Polls /api/health every `intervalMs` ms (default 30s) so the
 * mock-mode flag stays in sync with backend reachability.
 *
 * Calling api.health() flips setMockMode internally; the MockBanner
 * subscribes to that flag and shows / hides itself accordingly.
 */
export function useHealthPing(intervalMs: number = 30_000) {
  useEffect(() => {
    let cancelled = false;
    const tick = () => {
      if (cancelled) return;
      api.health().catch(() => {});
    };
    tick();
    const id = window.setInterval(tick, intervalMs);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [intervalMs]);
}
