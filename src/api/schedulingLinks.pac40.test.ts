import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import { ApiHttpError, ApiUnreachableError } from "./client";
import { ArchiveUnavailableError, BookingsUnreadableError, schedulingLinksApi } from "./schedulingLinks";
import {
  ARCHIVED_A,
  ARCHIVED_EMPTY,
  BOOKING,
  ERASED_BOOKING,
  LINK_ID,
  POLICY_A,
  jsonResponse,
  requestPath,
} from "@/test/pac40Fixtures";

// PAC-40 part A, web: the two archive reads, parsed strictly with the
// generated schemas (contract section 2.1, section 7 / K4-7).

const fetchMock = vi.fn<typeof fetch>();

describe("PAC-40 archive reads", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterAll(() => vi.unstubAllGlobals());

  it("listArchive reads GET /api/scheduling-links/archive and returns the links and the erasure policy", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ links: [ARCHIVED_A, ARCHIVED_EMPTY], booker_erasure: POLICY_A }));
    const out = await schedulingLinksApi.listArchive();
    expect(requestPath(fetchMock.mock.calls[0][0])).toBe("/api/scheduling-links/archive");
    expect(fetchMock.mock.calls[0][1]?.method ?? "GET").toBe("GET");
    expect(out.booker_erasure).toEqual({ enabled: false, retention_days: 90 });
    expect(out.links.map((l) => l.slug)).toEqual(["intro-call", "old-demo"]);
  });

  it("an owner who deleted nothing gets an empty archive, not an error (AC-24)", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ links: [], booker_erasure: POLICY_A }));
    await expect(schedulingLinksApi.listArchive()).resolves.toEqual({ links: [], booker_erasure: POLICY_A });
  });

  it("K4-7: a 200 whose body fails the generated schema is ArchiveUnavailableError (unknown field)", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ links: [{ ...ARCHIVED_A, restored_at: null }], booker_erasure: POLICY_A }),
    );
    await expect(schedulingLinksApi.listArchive()).rejects.toBeInstanceOf(ArchiveUnavailableError);
  });

  it("K4-7: a policy outside the contract (retention_days other than 90, missing policy) is ArchiveUnavailableError", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ links: [], booker_erasure: { enabled: true, retention_days: 30 } }));
    await expect(schedulingLinksApi.listArchive()).rejects.toBeInstanceOf(ArchiveUnavailableError);
    fetchMock.mockResolvedValueOnce(jsonResponse({ links: [] }));
    await expect(schedulingLinksApi.listArchive()).rejects.toBeInstanceOf(ArchiveUnavailableError);
  });

  it("an older server answers 400 'invalid id' (contract section 7): the HTTP error reaches the caller", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ error: "invalid id" }, 400));
    const err = await schedulingLinksApi.listArchive().catch((e) => e);
    expect(err).toBeInstanceOf(ApiHttpError);
    expect((err as ApiHttpError).status).toBe(400);
  });

  it("PAC-83: a transport failure is the caller's error, never archive data", async () => {
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));
    await expect(schedulingLinksApi.listArchive()).rejects.toBeInstanceOf(ApiUnreachableError);
  });

  it("getArchivedLink reads GET /api/scheduling-links/archive/{id} with every booking, erased ones as null + timestamp", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ link: ARCHIVED_A, bookings: [BOOKING, ERASED_BOOKING] }));
    const out = await schedulingLinksApi.getArchivedLink(LINK_ID);
    expect(requestPath(fetchMock.mock.calls[0][0])).toBe(`/api/scheduling-links/archive/${LINK_ID}`);
    expect(out.bookings).toHaveLength(2);
    expect(out.bookings[0]).toMatchObject({ booker_name: "Ada Lovelace", booker_email: "ada@example.com", booker_erased_at: null });
    expect(out.bookings[1]).toMatchObject({ booker_name: null, booker_email: null, booker_erased_at: "2027-03-01T03:00:00Z" });
  });

  it("getArchivedLink: 404 (unknown, live, paused or not owned) reaches the caller as a 404", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ error: "not found" }, 404));
    const err = await schedulingLinksApi.getArchivedLink(LINK_ID).catch((e) => e);
    expect(err).toBeInstanceOf(ApiHttpError);
    expect((err as ApiHttpError).status).toBe(404);
  });

  it("K4-7: getArchivedLink with a booking missing a required field is ArchiveUnavailableError", async () => {
    const withoutNotes: Record<string, unknown> = { ...BOOKING };
    delete withoutNotes.notes;
    fetchMock.mockResolvedValue(jsonResponse({ link: ARCHIVED_A, bookings: [withoutNotes] }));
    await expect(schedulingLinksApi.getArchivedLink(LINK_ID)).rejects.toBeInstanceOf(ArchiveUnavailableError);
  });

  it("deleteLink is unchanged: DELETE /api/scheduling-links/{id}, empty 204", async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
    await expect(schedulingLinksApi.deleteLink(LINK_ID)).resolves.toBeUndefined();
    expect(requestPath(fetchMock.mock.calls[0][0])).toBe(`/api/scheduling-links/${LINK_ID}`);
    expect(fetchMock.mock.calls[0][1]?.method).toBe("DELETE");
  });
});

describe("PAC-40 and PAC-134 booking erasure", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterAll(() => vi.unstubAllGlobals());

  const NOTES = "Jane Roe, Acme Ltd, +33 6 12 34 56 78";

  it("reads an erased archived booking and strips retained notes from the result", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ link: ARCHIVED_A, bookings: [{ ...ERASED_BOOKING, notes: NOTES }] }),
    );
    await expect(schedulingLinksApi.getArchivedLink(LINK_ID)).resolves.toEqual({
      link: ARCHIVED_A,
      bookings: [ERASED_BOOKING],
    });
  });

  it("the live read refuses the very same record, with its own error", async () => {
    fetchMock.mockResolvedValue(jsonResponse([{ ...ERASED_BOOKING, notes: NOTES }]));
    await expect(schedulingLinksApi.listBookings(LINK_ID)).rejects.toBeInstanceOf(BookingsUnreadableError);
  });

  it("an archived booking that says erased but still names its booker is unavailable too", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ link: ARCHIVED_A, bookings: [{ ...ERASED_BOOKING, booker_name: "Jane Roe" }] }),
    );
    await expect(schedulingLinksApi.getArchivedLink(LINK_ID)).rejects.toBeInstanceOf(ArchiveUnavailableError);
  });

  it("an archived booking with a null name but no erasure marker is unavailable (AC-22)", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ link: ARCHIVED_A, bookings: [{ ...BOOKING, booker_name: null }] }),
    );
    await expect(schedulingLinksApi.getArchivedLink(LINK_ID)).rejects.toBeInstanceOf(ArchiveUnavailableError);
  });

  it("a contract-shaped archive, erased booking included, still reads", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ link: ARCHIVED_A, bookings: [BOOKING, ERASED_BOOKING] }));
    const out = await schedulingLinksApi.getArchivedLink(LINK_ID);
    expect(out.bookings.map((b) => b.notes)).toEqual(["About the roadmap", ""]);
  });
});
