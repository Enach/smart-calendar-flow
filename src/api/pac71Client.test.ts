import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import { api, apiErrorMessage, ApiHttpError, connectStartPath, isApiHttpError, isUsingMocks, setMockMode } from "./client";

// PAC-71 (contract contracts/features/PAC-71.md in the api repo): the client
// half of "connect is a signed-in step" and of the reworded Teams 400s.

const fetchMock = vi.fn<typeof fetch>();

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

const AUTHORIZE = "https://accounts.google.com/o/oauth2/v2/auth?client_id=c&state=s";

describe("PAC-71 connect start (startGoogleConnect / startMicrosoftConnect)", () => {
  beforeEach(() => {
    setMockMode(false);
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterAll(() => vi.unstubAllGlobals());

  it("maps each calendar to its connect start", () => {
    expect(connectStartPath("google")).toBe("/auth/google/connect");
    expect(connectStartPath("outlook")).toBe("/auth/microsoft/connect");
  });

  it.each([
    ["google", "/api/auth/google/connect"],
    ["outlook", "/api/auth/microsoft/connect"],
  ] as const)("POSTs the %s start with no body, with credentials, and returns authorize_url", async (provider, path) => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ authorize_url: AUTHORIZE }));
    await expect(api.startConnect(provider)).resolves.toBe(AUTHORIZE);
    const [input, init] = fetchMock.mock.calls[0];
    expect(new URL(String(input)).pathname).toBe(path);
    expect(init?.method).toBe("POST");
    expect(init?.body).toBeUndefined();
    expect(init?.credentials).toBe("include");
  });

  it("parses the answer strictly: an unknown field or a missing URL is an error, not a navigation", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ authorize_url: AUTHORIZE, state: "leak" }));
    await expect(api.startConnect("google")).rejects.toThrow();
    fetchMock.mockResolvedValueOnce(jsonResponse({}));
    await expect(api.startConnect("google")).rejects.toThrow();
    fetchMock.mockResolvedValueOnce(jsonResponse({ authorize_url: "not a url" }));
    await expect(api.startConnect("google")).rejects.toThrow();
  });

  it.each(["javascript:alert(1)", "http://accounts.google.com/o/oauth2/v2/auth?state=s"])(
    "refuses an authorize_url that is not https (%s)",
    async (url) => {
      fetchMock.mockResolvedValueOnce(jsonResponse({ authorize_url: url }));
      await expect(api.startConnect("google")).rejects.toThrow(/not a secure web address/);
    },
  );

  it.each(["google", "outlook"] as const)("saves the %s work calendar with a PATCH carrying only calendarProvider", async (provider) => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ calendarProvider: provider }));
    await expect(api.saveWorkCalendar(provider)).resolves.toMatchObject({ calendar_provider: provider });
    const [input, init] = fetchMock.mock.calls[0];
    expect(new URL(String(input)).pathname).toBe("/api/settings");
    expect(init?.method).toBe("PATCH");
    expect(JSON.parse(String(init?.body))).toEqual({ calendarProvider: provider });
  });

  it("a failed work-calendar save is thrown, never preview data", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: "internal error" }, 500));
    const err = await api.saveWorkCalendar("outlook").catch((e: unknown) => e);
    expect(isApiHttpError(err)).toBe(true);
    expect(isUsingMocks()).toBe(false);
  });

  it.each([401, 500, 503])("surfaces a %s as an HTTP failure and never switches to preview data", async (status) => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: "x" }, status));
    const err = await api.startConnect("outlook").catch((e: unknown) => e);
    expect(isApiHttpError(err)).toBe(true);
    expect((err as ApiHttpError).status).toBe(status);
    expect(isUsingMocks()).toBe(false);
  });

  it("no longer offers a GET connect URL", () => {
    expect("authConnectUrl" in api).toBe(false);
  });
});

describe("PAC-71 Teams 400 texts point to Settings", () => {
  const NOT_CONNECTED = "teams: not connected — connect Outlook in Settings (POST /api/auth/microsoft/connect)";
  const LOST = "teams: connection lost — reconnect Outlook in Settings (POST /api/auth/microsoft/connect)";

  it("words the two server texts for people, pointing to Settings and to no API route", () => {
    const notConnected = apiErrorMessage(new ApiHttpError(400, { error: NOT_CONNECTED }));
    const lost = apiErrorMessage(new ApiHttpError(400, { error: LOST }));
    expect(notConnected).toBe("Microsoft Teams is not connected. Connect Outlook in Settings to add Teams links.");
    expect(lost).toBe("The Microsoft Teams connection was lost. Reconnect Outlook in Settings to add Teams links.");
    for (const m of [notConnected, lost]) expect(m).not.toMatch(/\/api\//);
  });

  it("leaves every other 400 text, and the same text on another status, as the server wrote it", () => {
    const zoom = "zoom: not connected — visit /api/auth/zoom to authenticate";
    expect(apiErrorMessage(new ApiHttpError(400, { error: zoom }))).toBe(zoom);
    expect(apiErrorMessage(new ApiHttpError(409, { error: NOT_CONNECTED }))).toBe(NOT_CONNECTED);
  });
});
