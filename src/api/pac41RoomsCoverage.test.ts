/**
 * PAC-41 at the API layer: the room and free/busy-participant shapes are the
 * generated contract types (AC-6, AC-7, checked by `make typecheck`, which
 * type-checks this file), room search sends `q` only (AC-5), the room list's
 * failures are told apart by body (AC-16), the coverage cache copies no
 * provider (API-046), and demo answers have the live shapes (AC-10).
 */
import { afterAll, afterEach, beforeEach, describe, expect, expectTypeOf, it, vi } from "vitest";

import { api, ApiHttpError, ApiRequestCancelledError, ApiUnreachableError, roomListFailure } from "./client";
import { clearFreebusyCache, getCoverageMap } from "./coverageCache";
import type { ApiPort } from "./contract";
import type { components } from "./generated/types";
import { CalendarRoom as CalendarRoomSchema, FreeBusyParticipant as FreeBusyParticipantSchema } from "./generated/schemas";
import type { CalendarRoom, CoverageStatus, FreeBusyResponse, ParticipantCoverage } from "./types";
import type { ChipState } from "@/components/links/CoverageBadge";

type GeneratedRoom = components["schemas"]["CalendarRoom"];
type GeneratedParticipant = components["schemas"]["FreeBusyParticipant"];

const ROOM_ADDRESS = /^[^@\s]+@resource\.calendar\.google\.com$/;
const HELSINKI = { id: "c_1888helsinki@resource.calendar.google.com", name: "Helsinki" };

const fetchMock = vi.fn<typeof fetch>();
const answer = (status: number, body: string, contentType = "application/json") =>
  new Response(body, { status, headers: { "content-type": contentType } });

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  sessionStorage.removeItem("paceday:demo");
  clearFreebusyCache();
});
afterEach(() => vi.restoreAllMocks());
afterAll(() => {
  vi.unstubAllGlobals();
  sessionStorage.removeItem("paceday:demo");
});

describe("AC-6: one room type, the generated one", () => {
  it("every room consumer's room type is mutually assignable with the generated CalendarRoom", () => {
    expectTypeOf<CalendarRoom>().toEqualTypeOf<GeneratedRoom>();
    expectTypeOf(api.searchRooms).returns.resolves.toEqualTypeOf<GeneratedRoom[]>();
    expectTypeOf<ReturnType<ApiPort["searchRooms"]>>().resolves.toEqualTypeOf<GeneratedRoom[]>();
    // A room with only an identifier and a name is accepted everywhere.
    expectTypeOf({ id: "x@resource.calendar.google.com", name: "X" }).toMatchTypeOf<CalendarRoom>();
    // A hand-written shape with an extra required field is not the room type.
    expectTypeOf<{ id: string; name: string; email: string }>().not.toEqualTypeOf<CalendarRoom>();
    expectTypeOf<CalendarRoom>().not.toMatchTypeOf<{ id: string; name: string; email: string }>();
  });
});

describe("AC-7: two coverage statuses and no provider", () => {
  it("the coverage types are the generated participant's", () => {
    expectTypeOf<CoverageStatus>().toEqualTypeOf<"known" | "unknown">();
    expectTypeOf<CoverageStatus>().toEqualTypeOf<GeneratedParticipant["status"]>();
    expectTypeOf<ParticipantCoverage>().toEqualTypeOf<GeneratedParticipant>();
    expectTypeOf<ParticipantCoverage>().not.toHaveProperty("provider");
    expectTypeOf<FreeBusyResponse["participants"][number]>().toEqualTypeOf<GeneratedParticipant>();
    expectTypeOf<Extract<ChipState, { kind: "synced" }>>().not.toHaveProperty("provider");
  });

  it("the coverage cache copies the status and nothing else", async () => {
    const freebusy = vi.spyOn(api, "freebusy").mockResolvedValue({
      start_time: "2026-11-13T00:00:00Z",
      end_time: "2026-11-27T00:00:00Z",
      participants: [
        { email: "Ana@Co.com", status: "known", busy: [] },
        { email: "bo@gmail.com", status: "unknown", busy: [] },
      ],
    });
    const map = await getCoverageMap(["ana@co.com", "bo@gmail.com"]);
    expect(freebusy).toHaveBeenCalledTimes(1);
    expect(map.get("ana@co.com")).toStrictEqual({ status: "known" });
    expect(map.get("bo@gmail.com")).toStrictEqual({ status: "unknown" });
  });
});

describe("AC-5: room search asks only for what the server answers", () => {
  it("GET /api/rooms carries q and no start or end", async () => {
    fetchMock.mockResolvedValueOnce(answer(200, JSON.stringify([HELSINKI])));
    const rooms = await api.searchRooms("hel");
    expect(rooms).toEqual([HELSINKI]);
    const url = new URL(String(fetchMock.mock.calls[0][0]));
    expect(url.pathname).toMatch(/\/api\/rooms$/);
    expect([...url.searchParams.keys()]).toEqual(["q"]);
    expect(url.searchParams.get("q")).toBe("hel");
    expectTypeOf(api.searchRooms).parameters.toEqualTypeOf<[q: string]>();
  });
});

describe("AC-16: the room list's failures, told apart by body", () => {
  async function failureFor(res: Response) {
    fetchMock.mockResolvedValueOnce(res);
    try {
      await api.searchRooms("hel");
    } catch (e) {
      return roomListFailure(e);
    }
    throw new Error("expected searchRooms to fail");
  }

  it("401 calendar not connected (JSON) is the not-connected case", async () => {
    expect(await failureFor(answer(401, '{"error":"calendar not connected"}'))).toBe("calendar-not-connected");
  });

  it("401 from the session middleware (text/plain unauthorized) is the session-ended case, never not-connected", async () => {
    expect(await failureFor(answer(401, '{"error":"unauthorized"}\n', "text/plain; charset=utf-8"))).toBe("session-ended");
  });

  it("500 internal error (an unusable stored Google connection included) is could-not-be-loaded", async () => {
    expect(await failureFor(answer(500, '{"error":"internal error"}'))).toBe("unavailable");
  });

  it("no answer is could-not-be-loaded; a cancelled request says nothing; a 401 with another body is not guessed", () => {
    expect(roomListFailure(new ApiUnreachableError("network"))).toBe("unavailable");
    expect(roomListFailure(new ApiRequestCancelledError())).toBeNull();
    expect(roomListFailure(new ApiHttpError(401, undefined))).toBe("unavailable");
  });
});

describe("AC-10: demo answers have the live shapes", () => {
  it("demo rooms are {id, name} with bookable room addresses", async () => {
    sessionStorage.setItem("paceday:demo", "1"); // PAC-83: demo answers only in an explicit demo session
    const rooms = await api.searchRooms("");
    expect(rooms.length).toBeGreaterThan(0);
    for (const room of rooms) {
      expect(Object.keys(room).sort()).toEqual(["id", "name"]);
      expect(room.id).toMatch(ROOM_ADDRESS);
      expect(() => CalendarRoomSchema.parse(room)).not.toThrow();
    }
    // Search matches the name or the address, like the server.
    expect((await api.searchRooms("helsinki")).map((r) => r.name)).toEqual(["Helsinki"]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("demo coverage has two statuses and no provider", async () => {
    sessionStorage.setItem("paceday:demo", "1");
    const res = await api.freebusy({
      emails: ["me@paceday.com", "ana@co.com", "sam@outlook.com", "bo@gmail.com"],
      start_time: "2026-11-13T00:00:00Z",
      end_time: "2026-11-20T00:00:00Z",
    });
    expect(res.participants).toHaveLength(4);
    for (const p of res.participants) {
      expect(["known", "unknown"]).toContain(p.status);
      expect(Object.keys(p).sort()).toEqual(["busy", "email", "status"]);
      expect(() => FreeBusyParticipantSchema.parse(p)).not.toThrow();
    }
    expect(res.participants.find((p) => p.email === "bo@gmail.com")?.status).toBe("unknown");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
