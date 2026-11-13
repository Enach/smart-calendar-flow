/**
 * PAC-88: the zone arithmetic the booking page and its demo source rely on.
 * AC-11 (grouping property), AC-17 / AC-18 / AC-18a (offsets on transition
 * days), AC-20 (a day's own offset), the readable minus (spec 3.9) and the
 * 42-day grid (AC-16b).
 */
import { describe, expect, it } from "vitest";

import {
  addDaysToKey,
  canFormatZone,
  dateKeyInZone,
  daysBetweenKeys,
  formatDateKeyLong,
  formatOffset,
  groupStartsByDay,
  hostDisplayZone,
  keyToLocalDate,
  localDateToKey,
  monthGrid,
  monthOfKey,
  offsetMinutes,
  wallTimeInZone,
  zoneLabel,
  zoneMatches,
  zoneNoonInstant,
  zoneOffsetLabel,
  zoneOptions,
} from "./timeZone";
import { formatTimeInZone } from "./timeFormat";

/** The 15-minute grid of starts for a 30-minute meeting in [start, end) of one link day. */
function gridStarts(day: string, from: [number, number], to: [number, number], zone: string): string[] {
  const out: string[] = [];
  for (let m = from[0] * 60 + from[1]; m + 30 <= to[0] * 60 + to[1]; m += 15) {
    const t = wallTimeInZone(day, Math.floor(m / 60), m % 60, zone);
    if (t) out.push(t.toISOString());
  }
  return [...new Set(out)];
}

describe("offsets (spec 3.2, 3.9)", () => {
  it("writes the offset with a real minus sign so a screen reader reads it", () => {
    expect(formatOffset(-300)).toBe("UTC−05:00");
    expect(formatOffset(60)).toBe("UTC+01:00");
    expect(formatOffset(0)).toBe("UTC+00:00");
    expect(formatOffset(345)).toBe("UTC+05:45");
    expect(formatOffset(-570)).toBe("UTC−09:30");
  });

  it("reads the offset in force at the instant, including :30 and :45 zones and ±12/14", () => {
    expect(offsetMinutes("2027-01-15T12:00:00Z", "Europe/Paris")).toBe(60);
    expect(offsetMinutes("2027-07-15T12:00:00Z", "Europe/Paris")).toBe(120);
    expect(offsetMinutes("2027-01-15T12:00:00Z", "Asia/Kolkata")).toBe(330);
    expect(offsetMinutes("2027-01-15T12:00:00Z", "Asia/Kathmandu")).toBe(345);
    expect(offsetMinutes("2027-01-15T12:00:00Z", "Pacific/Kiritimati")).toBe(840);
    expect(offsetMinutes("2027-01-15T12:00:00Z", "Etc/GMT+12")).toBe(-720);
    expect(offsetMinutes("2027-01-15T12:00:00Z", "UTC")).toBe(0);
    expect(zoneLabel("Asia/Tokyo", "2027-01-15T00:00:00Z")).toBe("Asia/Tokyo (UTC+09:00)");
    expect(zoneLabel("UTC", "2027-01-15T00:00:00Z")).toBe("UTC (UTC+00:00)");
  });

  it("AC-20: a later day's offset is that day's, not today's", () => {
    expect(zoneOffsetLabel(zoneNoonInstant("2027-03-01", "Europe/Paris"), "Europe/Paris")).toBe("UTC+01:00");
    expect(zoneOffsetLabel(zoneNoonInstant("2027-04-05", "Europe/Paris"), "Europe/Paris")).toBe("UTC+02:00");
    expect(dateKeyInZone(zoneNoonInstant("2027-04-05", "Pacific/Kiritimati"), "Pacific/Kiritimati")).toBe("2027-04-05");
  });

  it("AC-17: New York spring-forward Sunday 01:00-04:00 has no 2:xx and −05:00 then −04:00", () => {
    const starts = gridStarts("2027-03-14", [1, 0], [4, 0], "America/New_York");
    const shown = starts.map((s) => `${formatTimeInZone(s, "America/New_York")} ${zoneOffsetLabel(s, "America/New_York")}`);
    expect(shown.some((t) => /^2:\d\d/.test(t))).toBe(false);
    expect(shown[0]).toMatch(/^1:00\sAM UTC−05:00$/);
    expect(shown.at(-1)).toMatch(/^3:30\sAM UTC−04:00$/);
    expect(new Set(shown.map((t) => t.split(" ").pop())).size).toBe(2);
  });

  it("AC-18: a UTC link's Sunday 05:00-07:00 shown in New York on 2027-11-07 is seven times, the repeated ones told apart by offset", () => {
    const starts = gridStarts("2027-11-07", [5, 0], [7, 0], "UTC");
    expect(starts).toHaveLength(7);
    const shown = starts.map((s) => `${formatTimeInZone(s, "America/New_York")} ${zoneOffsetLabel(s, "America/New_York")}`);
    expect(shown.map((t) => t.replace(/\s/g, " "))).toEqual([
      "1:00 AM UTC−04:00",
      "1:15 AM UTC−04:00",
      "1:30 AM UTC−04:00",
      "1:45 AM UTC−04:00",
      "1:00 AM UTC−05:00",
      "1:15 AM UTC−05:00",
      "1:30 AM UTC−05:00",
    ]);
    expect(new Set(shown).size).toBe(7);
  });

  it("AC-18a: a London link 00:00-03:00 on the October fall-back Sunday never repeats a wall time; each time has its own offset", () => {
    const starts = gridStarts("2027-10-31", [0, 0], [3, 0], "Europe/London");
    const walls = starts.map((s) => formatTimeInZone(s, "Europe/London"));
    expect(new Set(walls).size).toBe(walls.length);
    const offsets = starts.map((s) => zoneOffsetLabel(s, "Europe/London"));
    expect(offsets[0]).toBe("UTC+01:00");
    expect(offsets.at(-1)).toBe("UTC+00:00");
    // Every 01:xx is the first occurrence (BST), as the server's wallClock resolves it.
    expect(starts.filter((s) => /^1:/.test(formatTimeInZone(s, "Europe/London"))).every((s) => zoneOffsetLabel(s, "Europe/London") === "UTC+01:00")).toBe(true);
  });
});

describe("days of the displayed zone (spec 3.4)", () => {
  it("reads an instant's calendar date in a zone", () => {
    expect(dateKeyInZone("2027-01-14T23:30:00Z", "Asia/Tokyo")).toBe("2027-01-15");
    expect(dateKeyInZone("2027-01-14T23:30:00Z", "UTC")).toBe("2027-01-14");
    expect(dateKeyInZone("2027-01-15T03:30:00Z", "America/Los_Angeles")).toBe("2027-01-14");
  });

  it("round-trips grid dates and moves keys by calendar days", () => {
    expect(localDateToKey(keyToLocalDate("2027-03-14"))).toBe("2027-03-14");
    expect(addDaysToKey("2027-02-28", 1)).toBe("2027-03-01");
    expect(addDaysToKey("2028-02-28", 1)).toBe("2028-02-29");
    expect(daysBetweenKeys("2027-03-01", "2027-04-11")).toBe(41);
    expect(formatDateKeyLong("2027-03-11")).toBe("Thursday, March 11, 2027");
    expect(localDateToKey(monthOfKey("2027-03-14"))).toBe("2027-03-01");
  });

  it("AC-16b: the visible grid is six weeks from the Sunday before the 1st: never more than 42 days", () => {
    for (const month of ["2027-02-01", "2027-03-01", "2027-08-01", "2026-11-01"]) {
      const { from, to } = monthGrid(keyToLocalDate(month));
      expect(daysBetweenKeys(from, to)).toBe(41);
      expect(new Date(`${from}T00:00:00Z`).getUTCDay()).toBe(0);
      expect(from <= month).toBe(true);
    }
    expect(monthGrid(keyToLocalDate("2027-03-01"))).toEqual({ from: "2027-02-28", to: "2027-04-10" });
  });

  const ZONES = ["UTC", "Etc/GMT+12", "Pacific/Kiritimati", "Asia/Kolkata", "Asia/Kathmandu", "America/New_York", "Pacific/Auckland", "Europe/Paris"];
  it.each(ZONES)("AC-11: every offered start falls under exactly one day, its date in %s", (zone) => {
    // A Paris link, Monday 09:00-17:00 and Friday 20:00-23:59, over three weeks across the March change.
    const offered = [
      ...["2027-03-15", "2027-03-22", "2027-03-29"].flatMap((d) => gridStarts(d, [9, 0], [17, 0], "Europe/Paris")),
      ...["2027-03-19", "2027-03-26"].flatMap((d) => gridStarts(d, [20, 0], [23, 59], "Europe/Paris")),
    ];
    const byDay = groupStartsByDay(offered, zone);
    const union = [...byDay.values()].flat();
    expect(union.sort()).toEqual([...offered].sort());
    expect(new Set(union).size).toBe(union.length);
    for (const [day, starts] of byDay) for (const s of starts) expect(dateKeyInZone(s, zone)).toBe(day);
  });

  it("AC-10: a Paris Monday 09:00-17:00 shown in Auckland in winter is 12 Monday and 19 Tuesday starts", () => {
    const offered = gridStarts("2027-01-11", [9, 0], [17, 0], "Europe/Paris");
    expect(offered).toHaveLength(31);
    const byDay = groupStartsByDay(offered, "Pacific/Auckland");
    expect([...byDay.keys()]).toEqual(["2027-01-11", "2027-01-12"]);
    expect(byDay.get("2027-01-11")!.map((s) => formatTimeInZone(s, "Pacific/Auckland").replace(/\s/g, " "))[0]).toBe("9:00 PM");
    expect(byDay.get("2027-01-11")).toHaveLength(12);
    expect(byDay.get("2027-01-12")).toHaveLength(19);
    expect(formatTimeInZone(byDay.get("2027-01-12")!.at(-1)!, "Pacific/Auckland").replace(/\s/g, " ")).toBe("4:30 AM");
  });
});

describe("the zone the page opens in and the switcher's list (spec 3.1, 3.3)", () => {
  it("is the link's zone, UTC when none or when the browser cannot format it (A-4, F-6)", () => {
    expect(hostDisplayZone("Europe/Paris")).toBe("Europe/Paris");
    expect(hostDisplayZone(undefined)).toBe("UTC");
    expect(hostDisplayZone("Mars/Olympus_Mons")).toBe("UTC");
    expect(canFormatZone("Mars/Olympus_Mons")).toBe(false);
  });

  it("AC-6: lists the link's zone and UTC first, even when the browser's list omits them, without duplicates", () => {
    const opts = zoneOptions("Europe/Paris", ["Asia/Tokyo", "America/New_York", "Europe/Paris", "Not/AZone"]);
    expect(opts).toEqual(["Europe/Paris", "UTC", "America/New_York", "Asia/Tokyo"]);
    expect(zoneOptions(undefined, ["UTC", "Asia/Tokyo"])).toEqual(["UTC", "Asia/Tokyo"]);
  });

  it("AC-6: filters case-insensitively with spaces and underscores equivalent", () => {
    expect(zoneMatches("America/New_York", "new york")).toBe(true);
    expect(zoneMatches("America/New_York", "NEW_YO")).toBe(true);
    expect(zoneMatches("America/New_York", "paris")).toBe(false);
    expect(zoneMatches("Europe/Paris", "")).toBe(true);
  });

  it("resolves a wall time to its first occurrence and a skipped one to nothing (server rule)", () => {
    expect(wallTimeInZone("2027-03-14", 2, 30, "America/New_York")).toBeUndefined();
    expect(wallTimeInZone("2027-11-07", 1, 30, "America/New_York")?.toISOString()).toBe("2027-11-07T05:30:00.000Z");
    expect(wallTimeInZone("2027-01-11", 9, 0, "Europe/Paris")?.toISOString()).toBe("2027-01-11T08:00:00.000Z");
  });
});
