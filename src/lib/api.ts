/**
 * Backend API client for auth + protected endpoints.
 *
 * Separate from `src/api/client.ts` (which talks to the calendar service at
 * `/api/*` with its own mock fallback). This module owns the JWT/OAuth
 * surface from T-22 and the SSO discovery from T-25.
 *
 * Behaviour
 * ─ checkApiAvailability(): pings GET /api/health with a 2s timeout, cached
 *   for the lifetime of the page so the value is stable across the session.
 * ─ apiFetch(path, init): thin wrapper around fetch that always sends
 *   credentials and JSON, prefixed with VITE_API_URL.
 */

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

/** True when the backend responded to /api/health within 2s, false otherwise. */
export function checkApiAvailability(): Promise<boolean> {
  if (availabilityPromise) return availabilityPromise;
  availabilityPromise = (async () => {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 2_000);
    try {
      const res = await fetch(`${API_BASE}/api/health`, {
        method: "GET",
        signal: ctrl.signal,
        credentials: "include",
      });
      return res.ok;
    } catch {
      return false;
    } finally {
      clearTimeout(timer);
    }
  })();
  return availabilityPromise;
}

/** Force the next call to re-probe (used after manual reconnect attempts). */
export function resetApiAvailability() {
  availabilityPromise = null;
}

export interface ApiError extends Error {
  status: number;
  data?: unknown;
}

/**
 * Fetch wrapper that prefixes API_BASE, sends cookies, and JSON-encodes
 * the body. Throws ApiError on non-2xx responses.
 */
export async function apiFetch<T = unknown>(
  path: string,
  init: RequestInit & { json?: unknown } = {},
): Promise<T> {
  const { json, headers, body, ...rest } = init;
  const finalBody = json !== undefined ? JSON.stringify(json) : body;
  const res = await fetch(`${API_BASE}${path.startsWith("/") ? path : `/${path}`}`, {
    ...rest,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(headers ?? {}),
    },
    body: finalBody,
  });

  if (!res.ok) {
    let data: unknown;
    try {
      data = await res.json();
    } catch {
      /* ignore */
    }
    const err: ApiError = Object.assign(new Error(`HTTP ${res.status}`), {
      status: res.status,
      data,
    });
    throw err;
  }

  if (res.status === 204) return undefined as T;
  const ct = res.headers.get("content-type") || "";
  if (!ct.includes("application/json")) return undefined as T;
  return (await res.json()) as T;
}

/** Absolute URL helper — used for OAuth redirects (server-driven). */
export function apiUrl(path: string): string {
  return `${API_BASE}${path.startsWith("/") ? path : `/${path}`}`;
}
