import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
  api,
  apiErrorMessage,
  ApiHttpError,
  ApiUnreachableError,
  isUsingMocks,
  requestApi,
  setMockMode,
  withFallback,
} from "./client";

const fetchMock = vi.fn<typeof fetch>();

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function htmlResponse(): Response {
  return new Response("<!doctype html><html></html>", {
    status: 200,
    headers: { "content-type": "text/html" },
  });
}

describe("API error boundary", () => {
  beforeEach(() => {
    setMockMode(false);
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterAll(() => {
    vi.unstubAllGlobals();
  });

  it.each([401, 403, 409, 410, 422, 500])(
    "surfaces HTTP %i instead of returning demo data",
    async (status) => {
      fetchMock.mockResolvedValue(jsonResponse({ error: "nope" }, status));
      await expect(api.getEvents("2026-05-04T00:00:00Z", "2026-05-05T00:00:00Z")).rejects.toBeInstanceOf(
        ApiHttpError,
      );
      expect(isUsingMocks()).toBe(false);
    },
  );

  it("falls back to preview data only when the backend is unreachable", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    const value = await withFallback(
      () => requestApi<string>("GET", "/settings"),
      () => "preview",
    );
    expect(value).toBe("preview");
    expect(isUsingMocks()).toBe(true);
  });

  it("treats a non-JSON (SPA index.html) response as unreachable", async () => {
    fetchMock.mockResolvedValueOnce(htmlResponse());
    await expect(requestApi("GET", "/health")).rejects.toBeInstanceOf(ApiUnreachableError);
  });

  it("clears preview mode once a real response succeeds", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    await withFallback(() => requestApi<string>("GET", "/settings"), () => "preview");
    expect(isUsingMocks()).toBe(true);

    setMockMode(false); // health probe re-enables the online path
    fetchMock.mockResolvedValueOnce(jsonResponse({ work_start: "09:00" }));
    await withFallback(() => requestApi<unknown>("GET", "/settings"), () => "preview");
    expect(isUsingMocks()).toBe(false);
  });

  it("maps statuses to actionable messages", () => {
    expect(apiErrorMessage(new ApiHttpError(401))).toMatch(/sign in/i);
    expect(apiErrorMessage(new ApiHttpError(409))).toMatch(/conflict/i);
    expect(apiErrorMessage(new ApiHttpError(422, { error: "email is invalid" }))).toBe("email is invalid");
    expect(apiErrorMessage(new ApiUnreachableError())).toMatch(/preview/i);
  });

  it("health flips the offline flag without throwing", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    await expect(api.health()).resolves.toMatchObject({ reachable: false });
    expect(isUsingMocks()).toBe(true);
  });

  it("health treats a non-JSON SPA response as unreachable", async () => {
    fetchMock.mockResolvedValueOnce(htmlResponse());
    await expect(api.health()).resolves.toMatchObject({ reachable: false });
    expect(isUsingMocks()).toBe(true);
  });

  it.each([500, 502, 503])(
    "health surfaces HTTP %i as an unhealthy backend, not as offline",
    async (status) => {
      setMockMode(false);
      fetchMock.mockResolvedValue(jsonResponse({ error: "upstream down" }, status));
      await expect(api.health()).rejects.toBeInstanceOf(ApiHttpError);
      // Backend answered → reachable, so we must NOT switch to preview data.
      expect(isUsingMocks()).toBe(false);
    },
  );

  it("health keeps preview mode off and reports the failure message", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ error: "database unavailable" }, 503));
    const err = await api.health().catch((e) => e);
    expect(err).toBeInstanceOf(ApiHttpError);
    expect((err as ApiHttpError).status).toBe(503);
    expect(apiErrorMessage(err)).toBe("database unavailable");
    expect(isUsingMocks()).toBe(false);
  });
});
