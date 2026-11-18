/**
 * PAC-122 batch 6, SF-050: what a focus run tells the user. The run answers
 * `createdBlocks` (possibly empty) and `errors[]` (one `<date>: ...` entry per
 * day that failed; SF-019 made a failed focus-minutes read such a day). A run
 * with errors is never reported as plain success, and a run that created
 * nothing never says focus time was scheduled.
 */
import { describe, expect, it } from "vitest";

import { focusRunNotice } from "./focusRunNotice";

const block = (date: string) => ({
  google_event_id: `g-${date}`,
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

  it("reports the days that failed, by date, as an error even when some blocks were created", () => {
    const notice = focusRunNotice(
      run([block("2026-11-16")], ["2026-11-18: read existing focus minutes: connection refused"]),
    );
    expect(notice.kind).toBe("error");
    expect(notice.message).toBe("Created 1 focus block. 1 day could not be scheduled: 2026-11-18.");
    // The server's internal error text is not shown.
    expect(notice.message).not.toMatch(/connection refused/);
  });

  it("counts an error without a date prefix as a failed day", () => {
    expect(focusRunNotice(run([], ["2026-11-18: x", "something else failed"]))).toEqual({
      kind: "error",
      message: "No focus block was created. 2 days could not be scheduled: 2026-11-18.",
    });
    expect(focusRunNotice(run([], ["unknown"])).message).toBe("No focus block was created. 1 day could not be scheduled.");
  });
});
