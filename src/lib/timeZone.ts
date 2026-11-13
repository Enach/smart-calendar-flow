/**
 * Time-zone helpers for the public booking page (PAC-88).
 *
 * Every date and time on the booking page is shown in one zone, the
 * "displayed zone": the link's zone by default (owner decision PAC-72 D-9),
 * or the zone the visitor picked. A day on the page is a calendar day of that
 * zone, identified by its `YYYY-MM-DD` key (the same string the server's
 * `date`, `from`, `to` and `available_dates` carry).
 *
 * The react-day-picker grid works with browser-local `Date`s; the page uses
 * them as plain calendar dates (`keyToLocalDate` / `localDateToKey`), never as
 * instants, so the browser's own zone never decides which day a time is on.
 *
 * Times of day are formatted in src/lib/timeFormat.ts (PAC-55 AC-7).
 */

export const UTC_ZONE = "UTC";

type DateLike = Date | string | number;
const toDate = (value: DateLike) => (value instanceof Date ? value : new Date(value));

const formatterCache = new Map<string, Intl.DateTimeFormat>();
function cached(key: string, make: () => Intl.DateTimeFormat): Intl.DateTimeFormat {
  let f = formatterCache.get(key);
  if (!f) {
    f = make();
    formatterCache.set(key, f);
  }
  return f;
}

/** True when this browser can show times in `zone` (spec F-6). */
export function canFormatZone(zone: string | undefined | null): zone is string {
  if (!zone) return false;
  try {
    cached(`probe|${zone}`, () => new Intl.DateTimeFormat("en-US", { timeZone: zone }));
    return true;
  } catch {
    return false;
  }
}

/** The browser's own zone, or undefined when the browser does not say. */
export function browserTimeZone(): string | undefined {
  try {
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return canFormatZone(zone) ? zone : undefined;
  } catch {
    return undefined;
  }
}

/**
 * The zone the page opens in: the link's zone (`PublicLinkInfo.time_zone`),
 * or UTC when the link states none (A-4 reading) or the browser cannot format
 * it (F-6). Never the browser's zone.
 */
export function hostDisplayZone(linkZone: string | undefined): string {
  return canFormatZone(linkZone) ? linkZone : UTC_ZONE;
}

/** Offset of `zone` from UTC at `instant`, in minutes (east positive). */
export function offsetMinutes(instant: DateLike, zone: string): number {
  const f = cached(`offset|${zone}`, () => new Intl.DateTimeFormat("en-US", { timeZone: zone, timeZoneName: "longOffset" }));
  const name = f.formatToParts(toDate(instant)).find((p) => p.type === "timeZoneName")?.value ?? "GMT";
  const m = /^(?:GMT|UTC)([+-−])(\d{1,2})(?::?(\d{2}))?/.exec(name);
  if (!m) return 0;
  const sign = m[1] === "+" ? 1 : -1;
  return sign * (Number(m[2]) * 60 + Number(m[3] ?? 0));
}

/**
 * "UTC+01:00", "UTC−05:00", "UTC+05:45", "UTC+00:00". The minus is U+2212 so
 * a screen reader reads the sign (spec 3.9; pinned by timeZone.test.ts).
 */
export function formatOffset(minutes: number): string {
  const sign = minutes < 0 ? "−" : "+";
  const abs = Math.abs(minutes);
  const hh = String(Math.floor(abs / 60)).padStart(2, "0");
  const mm = String(abs % 60).padStart(2, "0");
  return `UTC${sign}${hh}:${mm}`;
}

/** The offset in force in `zone` at `instant`, e.g. "UTC+09:00". */
export function zoneOffsetLabel(instant: DateLike, zone: string): string {
  return formatOffset(offsetMinutes(instant, zone));
}

/** "Europe/Paris (UTC+01:00)": the zone and the offset in force at `instant`. */
export function zoneLabel(zone: string, instant: DateLike): string {
  return `${zone} (${zoneOffsetLabel(instant, zone)})`;
}

/** The calendar date (`YYYY-MM-DD`) of `instant` in `zone`. */
export function dateKeyInZone(instant: DateLike, zone: string): string {
  const f = cached(`date|${zone}`, () =>
    new Intl.DateTimeFormat("en-US", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit" }),
  );
  const parts = f.formatToParts(toDate(instant));
  const get = (t: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("year").padStart(4, "0")}-${get("month")}-${get("day")}`;
}

function parseKey(key: string): [number, number, number] {
  const [y, m, d] = key.split("-").map((x) => Number(x));
  return [y!, m!, d!];
}

/** A browser-local Date at the start of the calendar date `key` (for the day grid). */
export function keyToLocalDate(key: string): Date {
  const [y, m, d] = parseKey(key);
  return new Date(y, m - 1, d);
}

/** The calendar date of a grid Date, read with local getters (the inverse of keyToLocalDate). */
export function localDateToKey(d: Date): string {
  return `${String(d.getFullYear()).padStart(4, "0")}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** `key` moved by `days` calendar days. */
export function addDaysToKey(key: string, days: number): string {
  const [y, m, d] = parseKey(key);
  const t = new Date(Date.UTC(y, m - 1, d + days));
  return t.toISOString().slice(0, 10);
}

/** Whole days from `from` to `to` (`to` − `from`). */
export function daysBetweenKeys(from: string, to: string): number {
  const [y1, m1, d1] = parseKey(from);
  const [y2, m2, d2] = parseKey(to);
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86_400_000);
}

/**
 * The six-week grid the calendar shows for the month of `month` (Sunday first,
 * `fixedWeeks`): its first and last cell. Always 42 days, the most the
 * overview accepts (contract PAC-88 section 2.2).
 */
export function monthGrid(month: Date): { from: string; to: string } {
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const from = localDateToKey(first);
  const start = addDaysToKey(from, -first.getDay());
  return { from: start, to: addDaysToKey(start, 41) };
}

/** First of the month containing the calendar date `key`, as a grid Date. */
export function monthOfKey(key: string): Date {
  const [y, m] = parseKey(key);
  return new Date(y, m - 1, 1);
}

/** An instant around noon of the calendar date `key` in `zone`: the day's offset (AC-20). */
export function zoneNoonInstant(key: string, zone: string): Date {
  const [y, m, d] = parseKey(key);
  const guess = Date.UTC(y, m - 1, d, 12);
  return new Date(guess - offsetMinutes(guess, zone) * 60_000);
}

/** "Thursday, March 11, 2027" for the calendar date `key` (no zone involved). */
export function formatDateKeyLong(key: string): string {
  const [y, m, d] = parseKey(key);
  return formatDateLongInZone(Date.UTC(y, m - 1, d, 12), UTC_ZONE);
}

/** "Thursday, March 11, 2027": the date of `instant` in `zone`. */
export function formatDateLongInZone(instant: DateLike, zone: string): string {
  const f = cached(`long|${zone}`, () =>
    new Intl.DateTimeFormat("en-US", { timeZone: zone, weekday: "long", month: "long", day: "numeric", year: "numeric" }),
  );
  return f.format(toDate(instant));
}

/** Every zone this browser lists (may omit UTC; see zoneOptions). */
export function supportedTimeZones(): string[] {
  try {
    const list = (Intl as unknown as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf?.("timeZone");
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

/**
 * The switcher's options: the link's zone and UTC first (even when the
 * browser's list omits them, spec 3.3), then every other zone the browser can
 * format, alphabetically, without duplicates.
 */
export function zoneOptions(linkZone: string | undefined, all: string[] = supportedTimeZones()): string[] {
  const head = [linkZone, UTC_ZONE].filter((z): z is string => canFormatZone(z));
  const seen = new Set<string>();
  const out: string[] = [];
  for (const z of head) {
    if (!seen.has(z)) {
      seen.add(z);
      out.push(z);
    }
  }
  for (const z of [...all].sort()) {
    if (!seen.has(z) && canFormatZone(z)) {
      seen.add(z);
      out.push(z);
    }
  }
  return out;
}

const normalizeZoneText = (s: string) => s.toLowerCase().replace(/[_\s]+/g, " ").trim();

/** Case-insensitive, space and underscore equivalent ("new york" finds America/New_York). */
export function zoneMatches(zone: string, query: string): boolean {
  const q = normalizeZoneText(query);
  return q === "" || normalizeZoneText(zone).includes(q);
}

/**
 * Groups offered starts by their calendar date in `zone`: the rule the server
 * applies to `display_time_zone` (contract PAC-88 section 2.1), used by the
 * demo source (AC-33) so the demo answers look like the server's.
 */
export function groupStartsByDay(starts: string[], zone: string): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const s of [...starts].sort((a, b) => new Date(a).getTime() - new Date(b).getTime())) {
    const key = dateKeyInZone(s, zone);
    const list = out.get(key);
    if (list) list.push(s);
    else out.set(key, [s]);
  }
  return out;
}

/**
 * The instant at wall-clock `hh:mm` on calendar date `key` in `zone`, or
 * undefined when that wall time does not exist (a spring-forward gap). A
 * repeated wall time resolves to its first occurrence, as the server does
 * (`wallClock`, backend/engine/booking_window.go). Used by the demo source.
 */
export function wallTimeInZone(key: string, hh: number, mm: number, zone: string): Date | undefined {
  const [y, m, d] = parseKey(key);
  const naive = Date.UTC(y, m - 1, d, hh, mm);
  const candidates = new Set<number>();
  for (const probe of [naive - 36 * 3_600_000, naive, naive + 36 * 3_600_000]) {
    candidates.add(naive - offsetMinutes(probe, zone) * 60_000);
  }
  const hits = [...candidates]
    .filter((t) => offsetMinutes(t, zone) * 60_000 === naive - t)
    .sort((a, b) => a - b);
  return hits.length ? new Date(hits[0]!) : undefined;
}
