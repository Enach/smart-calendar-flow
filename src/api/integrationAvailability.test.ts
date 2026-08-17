import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import { api, ApiHttpError, isUsingMocks, setMockMode } from "./client";

const fetchMock = vi.fn<typeof fetch>();

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("integration availability contract", () => {
  beforeEach(() => {
    setMockMode(false);
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterAll(() => {
    vi.unstubAllGlobals();
  });

  it("loads non-sensitive provider availability from the backend", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        google: { available: true, reason: "configured" },
        microsoft: { available: false, reason: "missing_credentials" },
        zoom: { available: false, reason: "invalid_redirect_uri" },
        slack: { available: false, reason: "missing_credentials" },
        notion: { available: false, reason: "missing_credentials" },
        webcal: { available: true, reason: "built_in" },
      }),
    );

    await expect(api.integrationAvailability()).resolves.toEqual({
      google: { available: true, reason: "configured" },
      microsoft: { available: false, reason: "missing_credentials" },
      zoom: { available: false, reason: "invalid_redirect_uri" },
      slack: { available: false, reason: "missing_credentials" },
      notion: { available: false, reason: "missing_credentials" },
      webcal: { available: true, reason: "built_in" },
    });
    expect(String(fetchMock.mock.calls[0][0])).toContain("/api/integrations/availability");
  });

  it("does not turn a real availability error into demo availability", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: "server unavailable" }, 503));

    await expect(api.integrationAvailability()).rejects.toBeInstanceOf(ApiHttpError);
    expect(isUsingMocks()).toBe(false);
  });

  it("uses all providers in preview mode only when the backend is unreachable", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch"));

    const availability = await api.integrationAvailability();

    expect(availability.google.available).toBe(true);
    expect(availability.microsoft.available).toBe(true);
    expect(availability.notion.available).toBe(true);
    expect(isUsingMocks()).toBe(true);
  });
});
