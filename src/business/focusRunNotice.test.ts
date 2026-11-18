/**
 * PAC-122 batch 6, SF-050: what a focus run tells the user. The run answers
 * `createdBlocks` (possibly empty) and `errors[]`, in three shapes written by
 * backend/engine/focus_time.go: `<date>: …` (the day failed; SF-019 made a
 * failed focus-minutes read such a day), `create event <date>: …` and
 * `save block <date>: …` (one entry per block). A run with errors is never
 * reported as plain success, and a run that created nothing never says focus
 * time was scheduled.
 */
import { describe, expect, it } from "vitest";

import { focusRunNotice } from "./focusRunNotice";

const block = (date: string, n = 1) => ({
  google_event_id: `g-${date}-${n}`,
  start_time: `${date}T08:00:00Z`,
  end_time: `${date}T09:30:00Z`,
  date,
});
const run = (createdBlocks: ReturnType<typeof block>[], errors: string[] = []) => ({
  weekStart: "2026-11-16T00:00:00Z",
  createdBlocks,
  skippedDays: [],
  totalMinutes: createdBlocks.length * 90,
  errors,
});

describe("focusRunNotice (PAC-122 SF-050)", () => {
  it("counts the blocks the run created", () => {
    expect(focusRunNotice(run([block("2026-11-16"), block("2026-11-17")]))).toEqual({
      kind: "success",
      message: "Created 2 focus blocks",
    });
    expect(focusRunNotice(run([block("2026-11-16")])).message).toBe("Created 1 focus block");
  });

  it("says nothing was created when the run created nothing", () => {
    expect(focusRunNotice(run([]))).toEqual({ kind: "info", message: "No focus block was created this week." });
  });

  it("names the day that failed, and never shows the server's internal text", () => {
    const notice = focusRunNotice(run([block("2026-11-16")], ["2026-11-18: read existing focus minutes: connection refused"]));
    expect(notice).toEqual({ kind: "error", message: "Created 1 focus block. Problems on 1 day: 2026-11-18." });
  });

  it("finds the date in 'create event <date>:' entries and counts distinct days, not entries", () => {
    const notice = focusRunNotice(
      run([], [
        "create event 2026-11-17: googleapi: Error 503",
        "create event 2026-11-17: googleapi: Error 503",
        "2026-11-19: read existing focus minutes: boom",
      ]),
    );
    expect(notice).toEqual({ kind: "error", message: "No focus block was created. Problems on 2 days: 2026-11-17, 2026-11-19." });
  });

  it("a 'save block' failure says the time is on the calendar but not recorded, never 'could not be scheduled'", () => {
    const notice = focusRunNotice(run([block("2026-11-17")], ["save block 2026-11-17: pq: connection reset"]));
    expect(notice.kind).toBe("error");
    expect(notice.message).toBe(
      "Created 1 focus block. Problems on 1 day: 2026-11-17. On 2026-11-17, focus time was added to your calendar but Paceday could not record it.",
    );
    expect(notice.message).not.toMatch(/could not be scheduled/);
  });

  it("counts an entry without a date as a problem", () => {
    expect(focusRunNotice(run([], ["2026-11-18: x", "something else failed"])).message).toBe(
      "No focus block was created. Problems on 1 day: 2026-11-18. 1 other problem.",
    );
    expect(focusRunNotice(run([], ["unknown"])).message).toBe("No focus block was created. 1 problem.");
  });
});
