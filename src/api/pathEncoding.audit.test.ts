import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import { api } from "./client";
import { teamsApi } from "./teams";

/**
 * Read-only security audit of 2026-11-22, follow-up item 2.
 *
 * `requestApi` builds its URL with `new URL()` (src/api/client.ts), which
 * resolves `..`, so any path segment interpolated into a request path must be
 * encoded or it can name a different endpoint — the mechanism PR #205 fixed for
 * the public booking slug. These are the segments that pass left behind:
 * `src/api/client.ts` (seven sites: a personal calendar's id, an event's id, an
 * event's conference) and `src/api/teams.ts`, which escaped both earlier passes
 * because it concatenates its paths instead of interpolating them.
 *
 * Every id here comes from a server payload or the persisted team state rather
 * than from the route, which is why this was deferred rather than urgent. It is
 * still worth closing: each of these requests carries the session cookie
 * (`credentials: "include"`), several are writes, and a traversal segment would
 * aim one at an endpoint of someone else's choosing.
 */

const fetchMock = vi.fn<typeof fetch>();

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

/** The path the browser would actually request, after `new URL()` normalisation. */
function requestedPath(input: RequestInfo | URL): string {
  return new URL(String(input), window.location.origin).pathname;
}

/** A segment shaped to climb out of its prefix and land on an admin endpoint. */
const TRAVERSAL = "../../admin/sso/providers";

describe("a traversal-shaped id cannot escape its API path prefix", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    fetchMock.mockResolvedValue(jsonResponse({ id: "x", name: "x", people: [] }));
    vi.stubGlobal("fetch", fetchMock);
    localStorage.clear();
  });

  afterAll(() => vi.unstubAllGlobals());

  it("new URL() is why encoding is needed at all: it resolves `..` in the path", () => {
    expect(new URL(`/api/events/${TRAVERSAL}`, "https://app.paceday.test").pathname).toBe("/admin/sso/providers");
  });

  it.each([
    ["updatePersonalCalendar", () => api.updatePersonalCalendar(TRAVERSAL, { enabled: false }), "/api/personal-calendars/"],
    ["deletePersonalCalendar", () => api.deletePersonalCalendar(TRAVERSAL), "/api/personal-calendars/"],
    ["syncPersonalCalendar", () => api.syncPersonalCalendar(TRAVERSAL), "/api/personal-calendars/"],
    ["updateEvent", () => api.updateEvent(TRAVERSAL, { title: "x" }), "/api/events/"],
    ["deleteEvent", () => api.deleteEvent(TRAVERSAL), "/api/events/"],
    ["addConference", () => api.addConference(TRAVERSAL, { provider: "google_meet" }), "/api/events/"],
    ["removeConference", () => api.removeConference(TRAVERSAL), "/api/events/"],
  ])("client.ts %s keeps the request under %s", async (_name, call, prefix) => {
    await call().catch(() => undefined);
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(requestedPath(fetchMock.mock.calls[0][0]).startsWith(prefix)).toBe(true);
  });

  it.each([
    ["get", () => teamsApi.remote.get(TRAVERSAL)],
    ["renameTeam", () => teamsApi.remote.renameTeam(TRAVERSAL, "New name")],
    ["deleteTeam", () => teamsApi.remote.deleteTeam(TRAVERSAL)],
    ["addPerson", () => teamsApi.remote.addPerson(TRAVERSAL, "a@co.test", "A")],
    ["inviteMember", () => teamsApi.remote.inviteMember(TRAVERSAL, "a@co.test", "A")],
    ["removeMember", () => teamsApi.remote.removeMember(TRAVERSAL, "a@co.test")],
    ["addZone", () => teamsApi.remote.addZone(TRAVERSAL, { day_of_week: 1, start_min: 540, end_min: 600, label: "x" })],
    ["updateZone", () => teamsApi.remote.updateZone(TRAVERSAL, TRAVERSAL, { label: "x" })],
    ["findSlots", () => teamsApi.remote.findSlots(TRAVERSAL, "2026-03-02", 30)],
    ["teamAnalytics", () => teamsApi.remote.teamAnalytics(TRAVERSAL)],
  ])("teams.ts %s keeps the request under /api/teams/", async (_name, call) => {
    await call().catch(() => undefined);
    expect(fetchMock).toHaveBeenCalled();
    for (const [input] of fetchMock.mock.calls) {
      expect(requestedPath(input).startsWith("/api/teams/")).toBe(true);
    }
  });

  it("teams.ts encodes both segments of a no-meeting-zone path, not only the first", async () => {
    await teamsApi.remote.removeZone(TRAVERSAL, TRAVERSAL).catch(() => undefined);
    const path = requestedPath(fetchMock.mock.calls[0][0]);
    expect(path.startsWith("/api/teams/")).toBe(true);
    expect(path).toContain("/no-meeting-zones/");
  });

  it("an ordinary id still reaches its endpoint spelled exactly as it was given", async () => {
    await api.deleteEvent("evt-123").catch(() => undefined);
    expect(requestedPath(fetchMock.mock.calls[0][0])).toBe("/api/events/evt-123");

    fetchMock.mockClear();
    await teamsApi.remote.deleteTeam("3f1a-9c").catch(() => undefined);
    expect(requestedPath(fetchMock.mock.calls[0][0])).toBe("/api/teams/3f1a-9c");
  });
});
