import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import { ApiHttpError, normalizeAttendees, normalizeEvents } from "./client";
import { teamsApi, unwrapTeam, unwrapTeamList } from "./teams";
import { getEventOwnership } from "@/lib/eventOwnership";
import type { CalendarEvent } from "./types";

const fetchMock = vi.fn<typeof fetch>();

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("event attendee normalization", () => {
  it("keeps string attendees", () => {
    expect(normalizeAttendees(["a@x.com", "b@x.com"]).attendees).toEqual(["a@x.com", "b@x.com"]);
  });

  it("maps object attendees to emails and keeps details", () => {
    const out = normalizeAttendees([{ email: "a@x.com", name: "A", organizer: true }]);
    expect(out.attendees).toEqual(["a@x.com"]);
    expect(out.attendee_details?.[0]).toMatchObject({ email: "a@x.com", organizer: true });
  });

  it("handles missing, malformed and mixed arrays", () => {
    expect(normalizeAttendees(undefined)).toEqual({});
    expect(normalizeAttendees([null, {}, "  ", { name: "No Email" }]).attendees).toEqual(["No Email"]);
    const mixed = normalizeAttendees(["a@x.com", { email: "b@x.com" }]);
    expect(mixed.attendees).toEqual(["a@x.com", "b@x.com"]);
  });

  it("does not crash ownership logic for object attendees", () => {
    const [ev] = normalizeEvents([
      {
        id: "1",
        title: "Sync",
        start: "2026-05-04T09:00:00Z",
        end: "2026-05-04T09:30:00Z",
        attendees: [{ email: "me@x.com", organizer: true }, { email: "b@x.com" }],
      },
    ]) as CalendarEvent[];
    expect(() => getEventOwnership(ev, "me@x.com")).not.toThrow();
    expect(getEventOwnership(ev, "me@x.com")).toBe("owned");
  });
});

describe("event conference normalization", () => {
  // Read-only security audit, 2026-11-22, finding 1: `conference` is invite
  // data, and EventDetailView builds the `Join meeting` href out of it.
  const event = (conference: unknown) => ({
    id: "1",
    title: "Sync",
    start: "2026-05-04T09:00:00Z",
    end: "2026-05-04T09:30:00Z",
    conference,
  });

  it("keeps a conference the contract's schema and the link allowlist both accept", () => {
    const [ev] = normalizeEvents([
      event({ provider: "google_meet", url: "https://meet.google.com/abc-defg-hij", label: "Google Meet" }),
    ]);
    expect(ev.conference).toEqual({
      provider: "google_meet",
      url: "https://meet.google.com/abc-defg-hij",
      label: "Google Meet",
    });
  });

  it("drops a conference whose url carries a scheme we never make clickable", () => {
    for (const url of ["javascript:alert(1)", "  JavaScript:alert(1)", "data:text/html,x", "vbscript:MsgBox(1)", "//evil.example/j"]) {
      const [ev] = normalizeEvents([event({ provider: "custom", url })]);
      expect(ev.conference).toBeUndefined();
      // The event itself survives: only the Join button goes.
      expect(ev.title).toBe("Sync");
    }
  });

  it("drops a conference that is not the contract's CalendarEventConference", () => {
    for (const bad of [null, "https://meet.google.com/abc", { url: "https://meet.google.com/abc" }, { provider: "custom" }, { provider: "custom", url: "https://x.test", onclick: "alert(1)" }]) {
      expect(normalizeEvents([event(bad)])[0].conference).toBeUndefined();
    }
  });

  it("leaves an event with no conference alone", () => {
    const [ev] = normalizeEvents([
      { id: "1", title: "Sync", start: "2026-05-04T09:00:00Z", end: "2026-05-04T09:30:00Z" },
    ]);
    expect("conference" in ev).toBe(false);
  });
});

describe("teams list payload shapes", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
    localStorage.clear();
  });

  afterAll(() => {
    vi.unstubAllGlobals();
  });

  it("accepts a bare array", () => {
    expect(unwrapTeamList([{ id: "t1", name: "A" }]).map((t) => t.id)).toEqual(["t1"]);
  });

  it("accepts an envelope with teams", () => {
    expect(unwrapTeamList({ teams: [{ id: "t2", name: "B" }] }).map((t) => t.id)).toEqual(["t2"]);
  });

  it("accepts both create response shapes", () => {
    expect(unwrapTeam({ id: "t3", name: "C" })?.id).toBe("t3");
    expect(unwrapTeam({ team: { id: "t4", name: "D" } })?.id).toBe("t4");
    expect(unwrapTeam({})).toBeNull();
  });

  it("keeps an HTTP error as an error instead of demo data", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ error: "nope" }, 500));
    await expect(teamsApi.remote.list()).rejects.toBeInstanceOf(ApiHttpError);
  });
});
