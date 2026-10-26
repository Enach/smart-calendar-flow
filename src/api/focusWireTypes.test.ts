import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { api, setMockMode } from "./client";
import {
  CompressionApplyRequest,
  CompressionResult as CompressionResultSchema,
  FocusBlockRecord,
  FocusRunResult as FocusRunResultSchema,
} from "./generated/schemas";
import type { MoveProposal } from "./types";

// PAC-32 (API-015, API-016): the focus-run result, the focus blocks and the
// compression proposals are read with the keys the server sends, which are the
// generated contract types. The fixtures below are parsed with the generated
// strict zod schemas first, so a fixture cannot drift from the contract either.

const fetchMock = vi.fn<typeof fetch>();

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

/** POST /api/focus/run as the backend answers it: camelCase wrapper, snake_case blocks. */
const RUN = {
  weekStart: "2026-11-02T00:00:00Z",
  createdBlocks: [
    { google_event_id: "gcal-1", start_time: "2026-11-02T08:00:00Z", end_time: "2026-11-02T09:30:00Z", date: "2026-11-02" },
    { google_event_id: "gcal-2", start_time: "2026-11-04T13:00:00Z", end_time: "2026-11-04T15:00:00Z", date: "2026-11-04" },
  ],
  skippedDays: ["2026-11-03"],
  totalMinutes: 210,
  errors: [],
};

const PROPOSAL: MoveProposal = {
  eventId: "evt-1",
  eventTitle: "Standup",
  currentStart: "2026-11-02T10:30:00Z",
  currentEnd: "2026-11-02T11:00:00Z",
  proposedStart: "2026-11-02T09:30:00Z",
  proposedEnd: "2026-11-02T10:00:00Z",
  reason: "close a gap",
  focusGainMinutes: 60,
};

describe("focus and compression wire shapes (PAC-32)", () => {
  beforeEach(() => {
    setMockMode(false);
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterAll(() => {
    vi.unstubAllGlobals();
    setMockMode(false);
  });

  it("the run fixture is the backend's FocusRunResult", () => {
    expect(FocusRunResultSchema.parse(RUN)).toEqual(RUN);
  });

  it("runFocus returns the created blocks with their times under the server's keys", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(RUN));
    const res = await api.runFocus("2026-11-02");
    expect(res.createdBlocks).toHaveLength(2);
    expect(res.createdBlocks.map((b) => [b.start_time, b.end_time])).toEqual([
      ["2026-11-02T08:00:00Z", "2026-11-02T09:30:00Z"],
      ["2026-11-04T13:00:00Z", "2026-11-04T15:00:00Z"],
    ]);
    expect(res.skippedDays).toEqual(["2026-11-03"]);
    expect(res.totalMinutes).toBe(210);
    expect(res.weekStart).toBe("2026-11-02T00:00:00Z");
  });

  it("the preview run in mock mode has the same shape as the backend's", async () => {
    setMockMode(true);
    const res = await api.runFocus("2026-11-02");
    expect(() => FocusRunResultSchema.parse(res)).not.toThrow();
    expect(res.totalMinutes).toBe(res.createdBlocks.length * 90);
    const blocks = await api.getFocusBlocks("2026-11-02");
    expect(blocks.length).toBeGreaterThan(0);
    for (const b of blocks) expect(() => FocusBlockRecord.parse(b)).not.toThrow();
  });

  it("compressionPreview returns proposals under the server's camelCase keys", async () => {
    const body = [{ date: "2026-11-02", proposals: [PROPOSAL], totalFocusGainMinutes: 60 }];
    expect(CompressionResultSchema.array().parse(body)).toEqual(body);
    fetchMock.mockResolvedValueOnce(jsonResponse(body));
    const res = await api.compressionPreview({ date: "2026-11-02" });
    expect(res[0].proposals[0].proposedStart).toBe("2026-11-02T09:30:00Z");
    expect(res[0].totalFocusGainMinutes).toBe(60);
  });

  it("compressionApply posts the proposal the user saw in the apply request's snake_case shape", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ applied: ["evt-1"], failed: [] }));
    await expect(api.compressionApply({ proposals: [PROPOSAL] })).resolves.toEqual({ applied: ["evt-1"], failed: [] });

    const [input, init] = fetchMock.mock.calls[0];
    expect(new URL(String(input), window.location.origin).pathname).toBe("/api/schedule/compress/apply");
    const sent = JSON.parse(String(init?.body));
    expect(sent).toEqual({
      proposals: [{ event_id: "evt-1", proposed_start: "2026-11-02T09:30:00Z", proposed_end: "2026-11-02T10:00:00Z" }],
    });
    expect(() => CompressionApplyRequest.parse(sent)).not.toThrow();
  });

  it("the preview apply in mock mode reports the event ids it was given", async () => {
    setMockMode(true);
    await expect(api.compressionApply({ proposals: [PROPOSAL] })).resolves.toEqual({ applied: ["evt-1"], failed: [] });
  });
});
