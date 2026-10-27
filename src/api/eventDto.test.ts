import { afterAll, beforeEach, describe, expect, expectTypeOf, it, vi } from "vitest";
import { api, setMockMode } from "./client";
import { CalendarEvent as CalendarEventSchema } from "./generated/schemas";
import type { components } from "./generated/types";
import type { ParseResult } from "./types";

// PAC-29 (API-017), AC-4: POST /api/schedule/create, POST /api/nlp/confirm and
// PATCH /api/events/{id} answer the same CalendarEvent DTO as the events list.
// The three client methods are typed with the generated schema, and the
// fixture is parsed by the generated strict zod schema so it cannot drift.

type GeneratedCalendarEvent = components["schemas"]["CalendarEvent"];

const fetchMock = vi.fn<typeof fetch>();

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

/** One event as the backend's toCalendarEventDTO emits it. */
const DTO = {
  id: "evt-1",
  title: "Sync",
  start: "2026-05-04T10:00:00Z",
  end: "2026-05-04T10:30:00Z",
  attendees: ["bob@example.com"],
  attendee_details: [{ email: "bob@example.com", rsvp: "pending" }],
  conference: { provider: "google_meet", url: "https://meet.google.com/abc-defg-hij", label: "Google Meet" },
};

const PARSE: ParseResult = {
  intent: "schedule_meeting",
  title: "Sync",
  suggested_slots: [{ start: "2026-05-04T10:00:00Z", end: "2026-05-04T10:30:00Z", score: 1, reasons: [] }],
};

describe("event mutations answer the CalendarEvent DTO (PAC-29)", () => {
  beforeEach(() => {
    setMockMode(false);
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterAll(() => {
    vi.unstubAllGlobals();
    setMockMode(false);
  });

  it("the fixture is the backend's CalendarEvent", () => {
    expect(CalendarEventSchema.parse(DTO)).toEqual(DTO);
  });

  it("scheduleCreate returns the DTO and its title", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(DTO));
    const ev = await api.scheduleCreate({ title: "Sync", start: DTO.start, end: DTO.end, attendees: ["bob@example.com"] });
    expect(ev.title).toBe("Sync");
    expect(ev).toEqual(DTO);
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toMatch(/\/api\/schedule\/create$/);
    expect(init?.method).toBe("POST");
  });

  it("nlpConfirm returns the DTO and its title", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(DTO));
    const ev = await api.nlpConfirm(PARSE, 0);
    expect(ev.title).toBe("Sync");
    expect(ev).toEqual(DTO);
    expect(String(fetchMock.mock.calls[0][0])).toMatch(/\/api\/nlp\/confirm$/);
  });

  it("updateEvent returns the DTO and its title", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(DTO));
    const ev = await api.updateEvent("evt-1", { title: "Sync" }, "all");
    expect(ev.title).toBe("Sync");
    expect(ev).toEqual(DTO);
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toMatch(/\/api\/events\/evt-1$/);
    expect(init?.method).toBe("PATCH");
    expect(JSON.parse(String(init?.body))).toEqual({ title: "Sync", send_updates: "all" });
  });

  it("the three methods are typed with the generated CalendarEvent", () => {
    expectTypeOf(api.scheduleCreate).returns.resolves.toEqualTypeOf<GeneratedCalendarEvent>();
    expectTypeOf(api.nlpConfirm).returns.resolves.toEqualTypeOf<GeneratedCalendarEvent>();
    expectTypeOf(api.updateEvent).returns.resolves.toEqualTypeOf<GeneratedCalendarEvent>();
  });

  it("the preview (mock) answers have the same shape", async () => {
    setMockMode(true);
    const created = await api.scheduleCreate({ title: "Sync", start: DTO.start, end: DTO.end, attendees: ["bob@example.com"] });
    expect(() => CalendarEventSchema.parse(created)).not.toThrow();
    const confirmed = await api.nlpConfirm(PARSE, 0);
    expect(() => CalendarEventSchema.parse(confirmed)).not.toThrow();
    const updated = await api.updateEvent(created.id, { title: "Renamed" });
    expect(() => CalendarEventSchema.parse(updated)).not.toThrow();
    expect(updated.title).toBe("Renamed");
  });
});
