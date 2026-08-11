import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { api, setMockMode, isUsingMocks, isApiHttpError } from "./client";
import { isValidWebcalUrl } from "@/components/PersonalCalendarsSection";

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

describe("personal calendars contract", () => {
  beforeEach(() => {
    setMockMode(false);
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterAll(() => {
    vi.unstubAllGlobals();
  });

  it("normalizes provider/name into type/label on list", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse([
        { id: 1, provider: "google", name: "Perso", enabled: false },
        { id: 2, provider: "outlook", name: "Family", enabled: true, last_synced_at: "2026-05-04T00:00:00Z" },
      ]),
    );
    await expect(api.listPersonalCalendars()).resolves.toEqual([
      { id: "1", type: "google", label: "Perso", url: undefined, enabled: false, last_synced_at: undefined },
      { id: "2", type: "outlook", label: "Family", url: undefined, enabled: true, last_synced_at: "2026-05-04T00:00:00Z" },
    ]);
    expect(requestPath(fetchMock.mock.calls[0][0])).toBe("/api/personal-calendars");
  });

  it("posts the backend body shape when adding a webcal calendar", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ id: 9, provider: "webcal", name: "Sport", url: "webcal://x.test/a.ics", enabled: true }),
    );
    await expect(
      api.addPersonalCalendar({ type: "webcal", label: "Sport", url: "webcal://x.test/a.ics" }),
    ).resolves.toMatchObject({ id: "9", type: "webcal", label: "Sport" });

    const [input, init] = fetchMock.mock.calls[0];
    expect(requestPath(input)).toBe("/api/personal-calendars");
    expect(init?.method).toBe("POST");
    expect(JSON.parse(String(init?.body))).toEqual({
      provider: "webcal",
      name: "Sport",
      url: "webcal://x.test/a.ics",
      enabled: true,
    });
  });

  it("sends only the changed fields on PATCH", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ id: 3, provider: "google", name: "Perso", enabled: false }));
    await expect(api.updatePersonalCalendar("3", { enabled: false })).resolves.toMatchObject({ enabled: false });
    const [input, init] = fetchMock.mock.calls[0];
    expect(requestPath(input)).toBe("/api/personal-calendars/3");
    expect(init?.method).toBe("PATCH");
    expect(JSON.parse(String(init?.body))).toEqual({ enabled: false });
  });

  it("handles a 204 delete without parsing JSON", async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }));
    await expect(api.deletePersonalCalendar("4")).resolves.toBeUndefined();
    const [input, init] = fetchMock.mock.calls[0];
    expect(requestPath(input)).toBe("/api/personal-calendars/4");
    expect(init?.method).toBe("DELETE");
  });

  it("syncs through the sync endpoint", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ id: 5, provider: "webcal", name: "Sport", enabled: true, last_synced_at: "2026-06-01T10:00:00Z" }),
    );
    await expect(api.syncPersonalCalendar("5")).resolves.toMatchObject({
      id: "5",
      last_synced_at: "2026-06-01T10:00:00Z",
    });
    const [input, init] = fetchMock.mock.calls[0];
    expect(requestPath(input)).toBe("/api/personal-calendars/5/sync");
    expect(init?.method).toBe("POST");
  });

  it("surfaces real HTTP errors instead of falling back to demo data", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: "Invalid ICS url" }, 422));
    await expect(
      api.addPersonalCalendar({ type: "webcal", label: "Bad", url: "webcal://x.test/a.ics" }),
    ).rejects.toSatisfy((e: unknown) => isApiHttpError(e));
    expect(isUsingMocks()).toBe(false);
  });

  it("falls back to preview data only when the backend is unreachable", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    await expect(api.listPersonalCalendars()).resolves.toBeInstanceOf(Array);
    expect(isUsingMocks()).toBe(true);
    setMockMode(false);
  });
});

describe("webcal url validation", () => {
  it("accepts webcal and https urls", () => {
    expect(isValidWebcalUrl("webcal://example.com/a.ics")).toBe(true);
    expect(isValidWebcalUrl("https://example.com/a.ics")).toBe(true);
  });
  it("rejects empty or malformed urls", () => {
    expect(isValidWebcalUrl("")).toBe(false);
    expect(isValidWebcalUrl("not a url")).toBe(false);
    expect(isValidWebcalUrl("ftp://example.com/a.ics")).toBe(false);
  });
});
