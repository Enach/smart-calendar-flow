import { describe, expect, it } from "vitest";

import { UI_LOCALE } from "./locale";
import { calendarSlotLabelFormat, DATE_TIME, formatDateTime, formatMinutesOfDay, formatTime } from "./timeFormat";

// PAC-55. Local times built in the test's own zone, so formatting in that
// zone yields exactly these clock values whatever the machine's zone is.
const at = (h: number, m: number) => new Date(2026, 9, 12, h, m, 0);
const FIXTURES = [at(0, 5), at(9, 0), at(13, 30), at(23, 59)];
const TWENTY_FOUR = ["00:05", "09:00", "13:30", "23:59"];

describe("formatTime (AC-6)", () => {
  it("is unchanged on 12h for both styles the app used", () => {
    for (const d of FIXTURES) {
      expect(formatTime(d, "12h")).toBe(d.toLocaleTimeString(UI_LOCALE, { hour: "2-digit", minute: "2-digit" }));
      expect(formatTime(d, "12h", "numeric")).toBe(d.toLocaleTimeString(UI_LOCALE, { hour: "numeric", minute: "2-digit" }));
    }
    expect(formatTime(at(13, 30), "12h", "numeric")).toBe("1:30 PM");
  });

  it("is HH:MM with no AM/PM on 24h, whatever style the call site used", () => {
    expect(FIXTURES.map((d) => formatTime(d, "24h"))).toEqual(TWENTY_FOUR);
    expect(FIXTURES.map((d) => formatTime(d, "24h", "numeric"))).toEqual(TWENTY_FOUR);
    expect(formatTime(at(9, 0).toISOString(), "24h")).toBe("09:00");
  });
});

describe("formatDateTime (AC-6)", () => {
  const audit = DATE_TIME.timestamp;

  it("is unchanged on 12h", () => {
    for (const d of FIXTURES) {
      expect(formatDateTime(d, "12h", audit)).toBe(d.toLocaleString(UI_LOCALE, audit));
      expect(formatDateTime(d, "12h")).toBe(d.toLocaleString(UI_LOCALE));
    }
  });

  it("keeps the date and seconds and changes only the clock on 24h", () => {
    expect(formatDateTime(at(0, 5), "24h", audit)).toBe("Oct 12, 2026, 00:05");
    expect(formatDateTime(at(13, 30), "24h", DATE_TIME.short)).toBe("Oct 12, 13:30");
    expect(formatDateTime(at(13, 30), "12h", DATE_TIME.short)).toBe("Oct 12, 1:30 PM");
    expect(formatDateTime(at(23, 59), "24h")).toBe("10/12/2026, 23:59:00");
    for (const d of FIXTURES) expect(formatDateTime(d, "24h", audit)).not.toMatch(/AM|PM/);
  });
});

describe("formatMinutesOfDay (AC-6, protected hours)", () => {
  it("is unchanged on 12h and HH:MM on 24h", () => {
    const minutes = [5, 9 * 60, 13 * 60 + 30, 23 * 60 + 59];
    expect(minutes.map((m) => formatMinutesOfDay(m, "12h"))).toEqual(["12:05 AM", "9:00 AM", "1:30 PM", "11:59 PM"]);
    expect(minutes.map((m) => formatMinutesOfDay(m, "24h"))).toEqual(TWENTY_FOUR);
  });
});

describe("calendar hour axis (AC-8 unit half)", () => {
  it("keeps the library default on 12h and is 24-hour on 24h", () => {
    expect(calendarSlotLabelFormat("12h")).toBeUndefined();
    expect(calendarSlotLabelFormat("24h")).toEqual({ hour: "2-digit", minute: "2-digit", hour12: false });
  });
});

// AC-7: every time of day goes through src/lib/timeFormat.ts.
const sources = import.meta.glob<string>(["/src/**/*.{ts,tsx}", "!/src/**/*.test.{ts,tsx}", "!/src/components/ui/**", "!/src/api/generated/**"], {
  query: "?raw",
  import: "default",
  eager: true,
});
const FORMATS_A_TIME = [
  /\.toLocaleTimeString\(/,
  /hourCycle|hour12/,
  /\bhour:\s*["']/,
  /\.toLocaleString\(UI_LOCALE\s*\)/,
  /["'`]\s?[AP]M["'`]/,
];

describe("one time-of-day formatting path (AC-7)", () => {
  it("formats no time of day outside src/lib/timeFormat.ts", () => {
    const offenders = Object.entries(sources)
      .filter(([file]) => !file.endsWith("/src/lib/timeFormat.ts"))
      .flatMap(([file, text]) =>
        text.split("\n").flatMap((line, i) => (FORMATS_A_TIME.some((re) => re.test(line)) ? [`${file}:${i + 1}: ${line.trim()}`] : [])),
      );
    expect(Object.keys(sources).length).toBeGreaterThan(50);
    expect(offenders).toEqual([]);
  });
});
