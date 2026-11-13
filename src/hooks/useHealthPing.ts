import { useCallback, useEffect, useRef, useState } from "react";
import { api, isApiHttpError } from "@/api/client";

export type HealthState =
  | { status: "unknown"; error: null }
  | { status: "healthy"; error: null }
  | { status: "offline"; error: null }
  | { status: "unhealthy"; error: unknown };

/**
 * Polls /api/health every `intervalMs` ms (default 30s).
 *
 * Three outcomes (PAC-83: none of them changes what data calls return):
 *  - healthy   → backend answered 2xx.
 *  - offline   → no answer within HEALTH_PROBE_BOUND_MS, network failure,
 *                non-JSON or gateway answer: the "can't reach" banner.
 *  - unhealthy → backend answered an HTTP error with a JSON body: cached real
 *                data is kept and the caller shows an explicit error with Retry.
 */
export function useHealthPing(intervalMs: number = 30_000) {
  const [state, setState] = useState<HealthState>({ status: "unknown", error: null });
  const cancelled = useRef(false);

  const ping = useCallback(async () => {
    try {
      const r = await api.health();
      if (cancelled.current) return;
      setState({ status: r.reachable ? "healthy" : "offline", error: null });
    } catch (e) {
      if (cancelled.current) return;
      setState(isApiHttpError(e) ? { status: "unhealthy", error: e } : { status: "offline", error: null });
    }
  }, []);

  useEffect(() => {
    cancelled.current = false;
    void ping();
    const id = window.setInterval(() => void ping(), intervalMs);
    return () => {
      cancelled.current = true;
      window.clearInterval(id);
    };
  }, [intervalMs, ping]);

  return { ...state, retry: ping };
}
