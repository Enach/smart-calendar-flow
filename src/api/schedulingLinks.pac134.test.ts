import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { BookingsUnreadableError, schedulingLinksApi } from "./schedulingLinks";
import { jsonResponse, requestPath } from "@/test/pac40Fixtures";
import { ERASED, LIVE } from "@/test/pac134Fixtures";

// PAC-134 AC-6w (web), contract md 5: an operator may erase a booker's address
// on a LIVE link. listSchedulingLinkBookings then answers that booking with
// booker_erased_at set and null name and email; every other record is
// unchanged. The list stays readable, and the strict parse still refuses a
// record that mixes the two shapes.

const fetchMock = vi.fn<typeof fetch>();

function answer(body: unknown) {
  fetchMock.mockImplementation(async (input) => {
    expect(requestPath(input)).toBe("/api/scheduling-links/l1/bookings");
    return jsonResponse(body);
  });
}

describe("PAC-134 listBookings with an erased live booking", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterAll(() => vi.unstubAllGlobals());

  it("AC-6w: a list holding one erased booking is readable; the other booking is mapped as today", async () => {
    answer([LIVE, ERASED]);
    const res = await schedulingLinksApi.listBookings("l1");
    expect(res).toEqual([
      {
        id: LIVE.id,
        start: LIVE.start_time,
        end: LIVE.end_time,
        duration_minutes: 30,
        booker_name: "Zoe",
        booker_email: "zoe@co.com",
        notes: "Agenda",
      },
      {
        id: ERASED.id,
        start: ERASED.start_time,
        end: ERASED.end_time,
        duration_minutes: 60,
        booker_name: null,
        booker_email: null,
        erased_at: "2027-03-01T03:00:00Z",
      },
    ]);
    // A non-erased booking carries no erased state at all.
    expect(res[0]).not.toHaveProperty("erased_at");
  });

  it.each([
    ["erased with a name", { ...ERASED, booker_name: "Zoe" }],
    ["erased with an email", { ...ERASED, booker_email: "zoe@co.com" }],
    ["erased with notes", { ...ERASED, notes: "Agenda" }],
    ["a null name without erasure", { ...LIVE, booker_name: null }],
    ["a null email without erasure", { ...LIVE, booker_email: null }],
    ["a null booker_erased_at", { ...LIVE, booker_erased_at: null }],
    ["a booker_erased_at that is not a date-time", { ...ERASED, booker_erased_at: "yesterday" }],
  ])("contract md 5: %s fails the parse (BookingsUnreadableError), never a partial list", async (_label, bad) => {
    answer([LIVE, bad]);
    await expect(schedulingLinksApi.listBookings("l1")).rejects.toBeInstanceOf(BookingsUnreadableError);
  });

  it("the strict parse still refuses an unknown field", async () => {
    answer([{ ...LIVE, erased: true }]);
    await expect(schedulingLinksApi.listBookings("l1")).rejects.toBeInstanceOf(BookingsUnreadableError);
  });
});
