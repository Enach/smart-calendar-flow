/**
 * The one place the app formats a time of day (PAC-55).
 *
 * Each user chooses a 12-hour or 24-hour clock (settings `timeFormat`). On
 * "12h" every helper returns exactly what its call site rendered before
 * PAC-55; on "24h" the hour has two digits and there is no AM/PM ("09:00",
 * "14:30", "00:05"). Dates, weekday and month names stay English (UI_LOCALE).
 *
 * A structural test (timeFormat.test.ts) fails if a time of day is formatted
 * anywhere else, so new call sites have to come through here.
 */
import { UI_LOCALE } from "./locale";

export type TimeFormat = "12h" | "24h";

/** Until a user's choice is known, the app shows 12-hour time. */
export const DEFAULT_TIME_FORMAT: TimeFormat = "12h";

export function asTimeFormat(value: unknown): TimeFormat {
  return value === "24h" ? "24h" : DEFAULT_TIME_FORMAT;
}

type DateLike = Date | string | number;

const toDate = (value: DateLike) => (value instanceof Date ? value : new Date(value));

/**
 * A time of day, e.g. "02:30 PM" / "2:30 PM" (12h, by `hour`) or "14:30" (24h).
 * `hour` is the 12-hour style the call site used before PAC-55.
 */
export function formatTime(value: DateLike, format: TimeFormat, hour: "2-digit" | "numeric" = "2-digit"): string {
  const d = toDate(value);
  if (format === "24h") {
    return d.toLocaleTimeString(UI_LOCALE, { hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
  }
  return d.toLocaleTimeString(UI_LOCALE, { hour, minute: "2-digit" });
}

/**
 * A date with a time of day. `options` are the call site's own date and time
 * options (or none, for the locale's full default); on 24h only the clock
 * changes: two-digit hour, no AM/PM, any seconds kept.
 */
export function formatDateTime(value: DateLike, format: TimeFormat, options?: Intl.DateTimeFormatOptions): string {
  const d = toDate(value);
  if (format === "12h") return d.toLocaleString(UI_LOCALE, options);
  const base: Intl.DateTimeFormatOptions =
    options && Object.keys(options).length > 0
      ? { ...options }
      : { year: "numeric", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit" };
  if (base.hour) base.hour = "2-digit";
  return d.toLocaleString(UI_LOCALE, { ...base, hourCycle: "h23" });
}

/** Date-and-time layouts used by the app; pass one to formatDateTime. */
export const DATE_TIME = {
  /** "Oct 12, 2026, 02:30 PM" — the activity log. */
  timestamp: { year: "numeric", month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit" },
  /** "Oct 12, 2:30 PM" — short "last scanned" notes. */
  short: { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" },
} as const satisfies Record<string, Intl.DateTimeFormatOptions>;

/** Minutes after midnight ("540" → "9:00 AM" / "09:00"), for wall-clock values with no date. */
export function formatMinutesOfDay(minutes: number, format: TimeFormat): string {
  const h = Math.floor(minutes / 60);
  const m = (minutes % 60).toString().padStart(2, "0");
  if (format === "24h") return `${h.toString().padStart(2, "0")}:${m}`;
  const ampm = h >= 12 ? "PM" : "AM";
  const h12 = ((h + 11) % 12) + 1;
  return `${h12}:${m} ${ampm}`;
}

/**
 * The calendar's hour-axis label format: on 12h the library's own default
 * ("7am", unchanged), on 24h "07:00".
 */
export function calendarSlotLabelFormat(format: TimeFormat) {
  return format === "24h" ? { hour: "2-digit" as const, minute: "2-digit" as const, hour12: false } : undefined;
}
