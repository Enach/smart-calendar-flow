import type { FocusRunResult } from "@/api/types";

/** What a focus run tells the user, and how (PAC-122 SF-050). */
export interface FocusRunNotice {
  kind: "success" | "info" | "error";
  message: string;
}

const DAY_PREFIX = /^(\d{4}-\d{2}-\d{2}):/;

function blocks(n: number): string {
  return `${n} focus block${n === 1 ? "" : "s"}`;
}

/**
 * PAC-122 SF-050: the run answers `createdBlocks` (possibly empty) and
 * `errors[]`, one entry per day that failed (`<date>: ...`, since SF-019 a
 * failed focus-minutes read is such a day). A run with errors is an error
 * naming the failed dates, never a plain success; the server's internal error
 * text is not shown. A run that created nothing says so.
 */
export function focusRunNotice(res: FocusRunResult): FocusRunNotice {
  const created = res.createdBlocks.length;
  if (res.errors.length > 0) {
    const dates = res.errors.map((e) => DAY_PREFIX.exec(e)?.[1]).filter((d): d is string => Boolean(d));
    const failed = res.errors.length;
    const head = created > 0 ? `Created ${blocks(created)}.` : "No focus block was created.";
    const tail = `${failed} day${failed === 1 ? "" : "s"} could not be scheduled${dates.length ? `: ${dates.join(", ")}` : ""}.`;
    return { kind: "error", message: `${head} ${tail}` };
  }
  if (created === 0) return { kind: "info", message: "No focus block was created this week." };
  return { kind: "success", message: `Created ${blocks(created)}` };
}
