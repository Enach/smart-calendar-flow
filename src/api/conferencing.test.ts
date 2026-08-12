import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
  api,
  conferenceRequestBody,
  isApiHttpError,
  isUsingMocks,
  isValidConferenceUrl,
  normalizeConferenceProviders,
  setMockMode,
} from "./client";

const fetchMock = vi.fn<typeof fetch>();

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function requestPath(input: RequestInfo | URL): string {
  return new URL(String(input), window.location.origin).pathname;
}

describe("conferencing contract", () => {
  beforeEach(() => {
    setMockMode(false);
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterAll(() => {
    vi.unstubAllGlobals();
  });

  it("normalizes provider status entries and drops unknown providers", () => {
    expect(
      normalizeConferenceProviders([
        { provider: "Google-Meet", connected: true, auto_with: "google" },
        { provider: "zoom", connected: false, email: 5 },
        { provider: "microsoft_teams", connected: true, enabled: false },
        { provider: "webex", connected: true },
        null,
      ]),
    ).toEqual([
      { provider: "google_meet", connected: true, email: undefined, enabled: undefined, auto_with: "google" },
      { provider: "zoom", connected: false, email: undefined, enabled: undefined, auto_with: undefined },
      { provider: "teams", connected: true, email: undefined, enabled: false, auto_with: undefined },
    ]);
  });

  it("returns an empty list for a non-array payload", () => {
    expect(normalizeConferenceProviders({})).toEqual([]);
  });

  it("lists providers from GET /api/conference/providers", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse([{ provider: "zoom", connected: true, email: "a@b.test" }]));
    await expect(api.conferenceProviders()).resolves.toEqual([
      { provider: "zoom", connected: true, email: "a@b.test", enabled: undefined, auto_with: undefined },
    ]);
    expect(requestPath(fetchMock.mock.calls[0][0])).toBe("/api/conference/providers");
  });

  it("omits url for non-custom providers and keeps it for custom", () => {
    expect(conferenceRequestBody({ provider: "zoom", url: "https://x.test" })).toEqual({ provider: "zoom" });
    expect(conferenceRequestBody({ provider: "custom", url: " https://x.test " })).toEqual({
      provider: "custom",
      url: "https://x.test",
    });
  });

  it("posts the contract body when adding a conference", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ provider: "zoom", url: "https://zoom.us/j/1", label: "Zoom" }));
    await expect(api.addConference("ev1", { provider: "zoom", url: "ignored" })).resolves.toEqual({
      provider: "zoom",
      url: "https://zoom.us/j/1",
      label: "Zoom",
    });
    const [input, init] = fetchMock.mock.calls[0];
    expect(requestPath(input)).toBe("/api/events/ev1/conference");
    expect(init?.method).toBe("POST");
    expect(JSON.parse(String(init?.body))).toEqual({ provider: "zoom" });
  });

  it("handles a 204 removal without JSON parsing", async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }));
    await expect(api.removeConference("ev1")).resolves.toBeUndefined();
    const [input, init] = fetchMock.mock.calls[0];
    expect(requestPath(input)).toBe("/api/events/ev1/conference");
    expect(init?.method).toBe("DELETE");
  });

  it("surfaces provider-specific backend errors instead of demo data", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: "Zoom account is not linked" }, 409));
    await expect(api.addConference("ev1", { provider: "zoom" })).rejects.toSatisfy(
      (e: unknown) => isApiHttpError(e) && e.status === 409,
    );
    expect(isUsingMocks()).toBe(false);
  });

  it("does not swallow a 401 on zoom disconnect", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: "unauthorized" }, 401));
    await expect(api.zoomDisconnect()).rejects.toSatisfy((e: unknown) => isApiHttpError(e) && e.status === 401);
  });

  it("falls back to demo providers only when the backend is unreachable", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("network down"));
    const list = await api.conferenceProviders();
    expect(list.map((p) => p.provider)).toEqual(["google_meet", "zoom", "teams"]);
    expect(isUsingMocks()).toBe(true);
    setMockMode(false);
  });

  it("validates custom conference URLs", () => {
    expect(isValidConferenceUrl("https://meet.example.com/a")).toBe(true);
    expect(isValidConferenceUrl(" http://x.test ")).toBe(true);
    expect(isValidConferenceUrl("ftp://x.test")).toBe(false);
    expect(isValidConferenceUrl("meet.example.com")).toBe(false);
    expect(isValidConferenceUrl("")).toBe(false);
  });

  it("builds the zoom OAuth entry point URL", () => {
    expect(api.zoomConnectUrl()).toMatch(/\/auth\/zoom$/);
  });
});
