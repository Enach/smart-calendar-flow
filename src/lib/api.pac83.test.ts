/**
 * PAC-83 AC-3 (the apiFetch family: sign-in, sign-out, "who am I") and the
 * contract §3.1 apiFetch / checkApiAvailability rules.
 */
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { apiFetch, checkApiAvailability, resetApiAvailability } from "./api";
import { ApiGatewayError, ApiHttpError, ApiUnreachableError, CLIENT_REQUEST_BOUND_MS, HEALTH_PROBE_BOUND_MS } from "@/api/client";

const fetchMock = vi.fn<typeof fetch>();
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const hanging = (_u: RequestInfo | URL, init?: RequestInit) =>
  new Promise<Response>((_, reject) => init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError"))));

describe("apiFetch (PAC-83)", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    resetApiAvailability();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => {
    vi.useRealTimers();
  });
  afterAll(() => {
    vi.unstubAllGlobals();
  });

  it.each(["/api/auth/me", "/api/auth/detect", "/api/auth/login", "/api/auth/logout"])(
    "AC-3: %s is still waiting at 131 s and lost at CLIENT_REQUEST_BOUND_MS",
    async (path) => {
      vi.useFakeTimers();
      fetchMock.mockImplementation(hanging);
      let settled: unknown = "pending";
      const p = apiFetch(path, { method: "POST" }).then(
        (v) => (settled = { resolved: v }),
        (e) => (settled = e),
      );
      await vi.advanceTimersByTimeAsync(131_000);
      expect(settled).toBe("pending");
      await vi.advanceTimersByTimeAsync(CLIENT_REQUEST_BOUND_MS - 131_000);
      await p;
      expect(settled).toBeInstanceOf(ApiUnreachableError);
    },
  );

  it("a non-JSON 2xx (the SPA's index.html) throws — it never resolves to undefined and signs the user out", async () => {
    fetchMock.mockResolvedValueOnce(new Response("<!doctype html>", { status: 200, headers: { "content-type": "text/html" } }));
    const err = await apiFetch("/api/auth/me").catch((e) => e);
    expect(err).toBeInstanceOf(ApiUnreachableError);
    expect((err as ApiUnreachableError).reason).toBe("non-json");
  });

  it("204 resolves to undefined; HTTP errors keep .status and .data", async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }));
    await expect(apiFetch("/api/auth/logout", { method: "POST" })).resolves.toBeUndefined();
    fetchMock.mockResolvedValueOnce(json({ error: "no session" }, 401));
    const err = await apiFetch("/api/auth/me").catch((e) => e);
    expect(err).toBeInstanceOf(ApiHttpError);
    expect(err).toMatchObject({ status: 401, data: { error: "no session" } });
    fetchMock.mockResolvedValueOnce(new Response("<html>502</html>", { status: 502, headers: { "content-type": "text/html" } }));
    const gw = await apiFetch("/api/auth/me").catch((e) => e);
    expect(gw).toBeInstanceOf(ApiGatewayError);
    expect(gw).toMatchObject({ status: 502 });
  });

  it("checkApiAvailability: a failure is not cached (the sign-in retry re-probes); a success is", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    await expect(checkApiAvailability()).resolves.toBe(false);
    fetchMock.mockResolvedValueOnce(json({ status: "ok" }));
    await expect(checkApiAvailability()).resolves.toBe(true);
    await expect(checkApiAvailability()).resolves.toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("checkApiAvailability waits up to HEALTH_PROBE_BOUND_MS (a 3 s answer is fine)", async () => {
    vi.useFakeTimers();
    fetchMock.mockImplementationOnce(() => new Promise((r) => setTimeout(() => r(json({ status: "ok" })), 3_000)));
    const p = checkApiAvailability();
    await vi.advanceTimersByTimeAsync(3_000);
    await expect(p).resolves.toBe(true);
    resetApiAvailability();
    fetchMock.mockImplementationOnce(hanging);
    let settled: unknown = "pending";
    const q = checkApiAvailability().then((v) => (settled = v));
    await vi.advanceTimersByTimeAsync(HEALTH_PROBE_BOUND_MS);
    await q;
    expect(settled).toBe(false);
  });
});
