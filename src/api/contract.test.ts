import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { api, setMockMode } from "./client";
import { schedulingLinksApi } from "./schedulingLinks";
import type { ApiPort } from "./contract";

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

describe("frontend/backend API port", () => {
  beforeEach(() => {
    setMockMode(false);
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterAll(() => {
    vi.unstubAllGlobals();
  });

  it("keeps the concrete client assignable to the strict API port", () => {
    const port: ApiPort = api;
    expect(port).toBe(api);
  });

  it("defines the health response and request contract", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ status: "ok", version: "test" }));

    await expect(api.health()).resolves.toEqual({
      status: "ok",
      version: "test",
      reachable: true,
    });

    const [input, init] = fetchMock.mock.calls[0];
    expect(requestPath(input)).toBe("/api/health");
    expect(init?.method).toBe("GET");
    expect(init?.credentials).toBe("include");
  });

  it("sends scheduling requests using the backend JSON shape", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ slots: [] }));
    const body = {
      duration_minutes: 30,
      attendees: ["alice@example.com"],
      range_start: "2026-05-04T09:00:00Z",
      range_end: "2026-05-04T17:00:00Z",
      title: "Planning",
    };

    await expect(api.scheduleSuggest(body)).resolves.toEqual({ slots: [] });

    const [input, init] = fetchMock.mock.calls[0];
    expect(requestPath(input)).toBe("/api/schedule/suggest");
    expect(init?.method).toBe("POST");
    expect(init?.credentials).toBe("include");
    expect(JSON.parse(String(init?.body))).toEqual(body);
  });

  it("uses query parameters for calendar event reads", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse([]));

    await expect(api.getEvents("2026-05-04T00:00:00Z", "2026-05-05T00:00:00Z")).resolves.toEqual([]);

    const [input] = fetchMock.mock.calls[0];
    const url = new URL(String(input), window.location.origin);
    expect(url.pathname).toBe("/api/calendar/events");
    expect(url.searchParams.get("start")).toBe("2026-05-04T00:00:00Z");
    expect(url.searchParams.get("end")).toBe("2026-05-05T00:00:00Z");
  });

  it("uses the calendar disconnect endpoint instead of logout", async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }));

    await expect(api.authDisconnect()).resolves.toBeUndefined();

    const [input, init] = fetchMock.mock.calls[0];
    expect(requestPath(input)).toBe("/api/auth/disconnect");
    expect(init?.method).toBe("DELETE");
    expect(init?.credentials).toBe("include");
  });

  it("preserves the canonical freebusy response shape", async () => {
    const response = {
      start_time: "2026-05-04T09:00:00Z",
      end_time: "2026-05-04T17:00:00Z",
      participants: [{ email: "alice@example.com", status: "known" }],
      busy: { "alice@example.com": [{ start: "2026-05-04T10:00:00Z", end: "2026-05-04T11:00:00Z" }] },
    };
    fetchMock.mockResolvedValueOnce(jsonResponse(response));

    await expect(api.freebusy({
      emails: ["alice@example.com"],
      start_time: response.start_time,
      end_time: response.end_time,
    })).resolves.toEqual(response);
  });

  it("matches the backend compression result arrays", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({
      applied: ["event-1"],
      failed: ["event-2"],
    }));

    await expect(api.compressionApply({ proposals: [] })).resolves.toEqual({
      applied: ["event-1"],
      failed: ["event-2"],
    });
  });
  it("normalizes the scheduling-link list envelope and policy fields", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({
        owned: [{
          id: "link-1",
          owner_id: "user-1",
          title: "Intro",
          slug: "intro",
          durations: [30],
          days: ["mon"],
          window_start: "09:00",
          window_end: "17:00",
          min_notice_minutes: 60,
          usage_type: "single_use",
          uses_count: 0,
          active: true,
          hosts: [],
          created_at: "2026-05-04T00:00:00Z",
          is_owner: true,
        }],
        shared: [],
      }))
      .mockResolvedValueOnce(jsonResponse({ id: "user-1", email: "me@example.com" }));

    await expect(schedulingLinksApi.listLinks()).resolves.toMatchObject({
      owned: [{
        id: "link-1",
        min_notice_minutes: 60,
        usage_type: "single_use",
        days: ["mon"],
      }],
      shared: [],
    });
  });

  it("normalizes personal-calendar DTOs and PATCH payloads", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse([{
      id: 7,
      provider: "webcal",
      name: "Family",
      url: "webcal://example.test/family.ics",
      enabled: true,
      last_synced_at: "2026-05-04T00:00:00Z",
    }]));
    await expect(api.listPersonalCalendars()).resolves.toEqual([{
      id: "7",
      type: "webcal",
      label: "Family",
      url: "webcal://example.test/family.ics",
      enabled: true,
      last_synced_at: "2026-05-04T00:00:00Z",
    }]);

    fetchMock.mockResolvedValueOnce(jsonResponse({
      id: 7, provider: "webcal", name: "Renamed", enabled: false,
    }));
    await expect(api.updatePersonalCalendar("7", { label: "Renamed", enabled: false }))
      .resolves.toMatchObject({ id: "7", label: "Renamed", enabled: false });
    const [, init] = fetchMock.mock.calls[1];
    expect(JSON.parse(String(init?.body))).toEqual({ name: "Renamed", enabled: false });
  });

  it("uses event-level conferencing and audit routes", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ provider: "custom", url: "https://meet.example.test/room" }));
    await expect(api.addConference("event-1", { provider: "custom", url: "https://meet.example.test/room" }))
      .resolves.toEqual({ provider: "custom", url: "https://meet.example.test/room" });
    const [conferenceInput, conferenceInit] = fetchMock.mock.calls[0];
    expect(requestPath(conferenceInput)).toBe("/api/events/event-1/conference");
    expect(conferenceInit?.method).toBe("POST");

    fetchMock.mockResolvedValueOnce(jsonResponse([]));
    await expect(api.getAudit()).resolves.toEqual([]);
    const [auditInput] = fetchMock.mock.calls[1];
    expect(requestPath(auditInput)).toBe("/api/audit");
  });

});
