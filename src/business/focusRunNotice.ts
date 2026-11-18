import type { FocusRunResult } from "@/api/types";

/** What a focus run tells the user, and how (PAC-122 SF-050). */
export interface FocusRunNotice {
  kind: "success" | "info" | "error";
  message: string;
}

/** The date in an `errors[]` entry, wherever it is (`<date>: …`, `create event <date>: …`, `save block <date>: …`). */
const DATE_IN_ERROR = /(\d{4}-\d{2}-\d{2}):/;
/** engine/focus_time.go: the event was created on the calendar, then saving the block failed. */
const SAVE_BLOCK = /^save block /;

function plural(n: number, one: string, many: string): string {
  return n === 1 ? one : many;
}

function blocks(n: number): string {
  return `${n} focus ${plural(n, "block", "blocks")}`;
}

function distinctDates(entries: string[]): string[] {
  const dates = new Set<string>();
  for (const e of entries) {
    const d = DATE_IN_ERROR.exec(e)?.[1];
    if (d) dates.add(d);
  }
  return [...dates].sort();
}

/**
 * PAC-122 SF-050: the run answers `createdBlocks` (possibly empty) and
 * `errors[]`. The engine writes three shapes, one entry per day or per block
 * (backend/engine/focus_time.go): `<date>: …` (the day failed, SF-019),
 * `create event <date>: …` (a block was not created) and `save block <date>: …`
 * (the event WAS created and is counted in `createdBlocks`, but Paceday could
 * not record it). Problems are counted by distinct date, and the server's
 * internal text is not shown. A run with errors is never a plain success; a
 * run that created nothing says so.
 */
export function focusRunNotice(res: FocusRunResult): FocusRunNotice {
  const created = res.createdBlocks.length;
  if (res.errors.length > 0) {
    const head = created > 0 ? `Created ${blocks(created)}.` : "No focus block was created.";
    const days = distinctDates(res.errors);
    const undated = res.errors.filter((e) => !DATE_IN_ERROR.test(e)).length;
    const parts = [head];
    if (days.length > 0) parts.push(`Problems on ${days.length} ${plural(days.length, "day", "days")}: ${days.join(", ")}.`);
    if (undated > 0) {
      parts.push(`${undated} ${days.length > 0 ? "other " : ""}${plural(undated, "problem", "problems")}.`);
    }
    const unrecorded = distinctDates(res.errors.filter((e) => SAVE_BLOCK.test(e)));
    if (unrecorded.length > 0) {
      parts.push(
        `On ${unrecorded.join(", ")}, focus time was added to your calendar but Paceday could not record it.`,
      );
    }
    return { kind: "error", message: parts.join(" ") };
  }
  if (created === 0) return { kind: "info", message: "No focus block was created this week." };
  return { kind: "success", message: `Created ${blocks(created)}` };
}
