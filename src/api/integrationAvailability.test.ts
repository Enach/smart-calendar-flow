import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import { api, ApiHttpError, ApiUnreachableError } from "./client";

const fetchMock = vi.fn<typeof fetch>();

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("integration availability contract", () => {
  beforeEach(() => {
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
  });

  // Inverted (PAC-83 spec §2.5): never "every provider available" after a failure.
  it("rejects with ApiUnreachableError when the backend is unreachable (no invented availability)", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    await expect(api.integrationAvailability()).rejects.toBeInstanceOf(ApiUnreachableError);
  });
});
