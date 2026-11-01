/**
 * Backend API client for auth + protected endpoints.
 *
 * Separate from `src/api/client.ts` (which talks to the calendar service at
 * `/api/*`) but sharing its bounded transport and error classes (PAC-83).
 * This module owns the JWT/OAuth surface from T-22 and the SSO discovery
 * from T-25.
 *
 * Behaviour
 * ─ checkApiAvailability(): pings GET /api/health within HEALTH_PROBE_BOUND_MS;
 *   a success is cached for the page, a failure is re-probed next time.
 * ─ apiFetch(path, init): bounded fetch that always sends credentials and
 *   JSON, prefixed with VITE_API_URL.
 */

import {
  CLIENT_REQUEST_BOUND_MS,
  HEALTH_PROBE_BOUND_MS,
  boundedExchange,
  interpretResponse,
} from "@/api/client";

// Resolve API host at runtime so no URL is baked into the bundle.
// __API_BASE_URL__ is injected by the Go fileserver and includes the /api
// suffix (e.g. https://api.example.com/api). This module adds /api itself
// in every path, so strip the trailing /api to avoid doubling it.
export const API_BASE: string = (() => {
  const win = window as Window & { __API_BASE_URL__?: string };
  if (win.__API_BASE_URL__) return win.__API_BASE_URL__.replace(/\/api\/?$/, "");
  return (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/+$/, "") ?? "";
})();

let availabilityPromise: Promise<boolean> | null = null;

/**
 * True when the backend answered GET /api/health with a 2xx within
 * HEALTH_PROBE_BOUND_MS (PAC-83: the old 2 s probe refused sign-ins to a
 * slow server). A success is cached for the page; a failure is not, so the
 * sign-in dialog's "Try again" re-probes (contract §3.1).
 */
export function checkApiAvailability(): Promise<boolean> {
  if (availabilityPromise) return availabilityPromise;
  const probe = (async () => {
    try {
      const { res } = await boundedExchange(
        `${API_BASE}/api/health`,
        { method: "GET", credentials: "include" },
        HEALTH_PROBE_BOUND_MS,
      );
      return res.ok;
    } catch {
      return false;
    }
  })();
  availabilityPromise = probe;
  void probe.then((ok) => {
    if (!ok && availabilityPromise === probe) availabilityPromise = null;
  });
  return probe;
}

/** Force the next call to re-probe (used after manual reconnect attempts). */
export function resetApiAvailability() {
  availabilityPromise = null;
}

/**
 * What apiFetch throws for an HTTP answer: the client's error classes
 * (ApiHttpError, ApiGatewayError) all carry `.status` (and ApiHttpError
 * `.data`), which AuthContext.refresh reads to decide "signed out".
 */
export interface ApiError extends Error {
  status: number;
  data?: unknown;
}

/**
 * Fetch wrapper that prefixes API_BASE, sends cookies, and JSON-encodes the
 * body. Bounded by CLIENT_REQUEST_BOUND_MS like every requestApi call, and
 * throws the same classes (PAC-83 contract §3.1): 204 → undefined; a non-JSON
 * 2xx → ApiUnreachableError("non-json") — never undefined, which signed the
 * user out when /api/auth/me was answered by the SPA's index.html.
 */
export async function apiFetch<T = unknown>(
  path: string,
  init: RequestInit & { json?: unknown } = {},
): Promise<T> {
  const { json, headers, body, ...rest } = init;
  const finalBody = json !== undefined ? JSON.stringify(json) : body;
  const { res, text } = await boundedExchange(
    `${API_BASE}${path.startsWith("/") ? path : `/${path}`}`,
    {
      ...rest,
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        ...(headers ?? {}),
      },
      body: finalBody,
    },
    CLIENT_REQUEST_BOUND_MS,
  );
  return interpretResponse<T>(res, text);
}

/** Absolute URL helper — used for OAuth redirects (server-driven). */
export function apiUrl(path: string): string {
  return `${API_BASE}${path.startsWith("/") ? path : `/${path}`}`;
}
