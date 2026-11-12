/**
 * PAC-88 AC-33 / contract section 3.6: the demo source (non-production builds
 * only) carries a link zone and answers listings with the four PAC-88 keys,
 * grouped by the server's rule.
 */
import { describe, expect, it } from "vitest";

import { dateKeyInZone } from "@/lib/timeZone";
import { DEMO_LINK_ZONE, demoSchedulingLinksOps } from "./schedulingLinks";

const DAY = 86_400_000;
const key = (offsetDays: number) => new Date(Date.now() + offsetDays * DAY).toISOString().slice(0, 10);

describe("demo public booking (PAC-88)", () => {
  it("states the demo link's zone and horizon", () => {
    const info = demoSchedulingLinksOps.getPublicLink("intro-chat");
    expect(info.time_zone).toBe(DEMO_LINK_ZONE);
    expect(DEMO_LINK_ZONE).toBe("Europe/Paris");
    expect(info.booking_horizon_days).toBe(60);
  });

  it.each(["Europe/Paris", "Asia/Tokyo", "America/Los_Angeles"])("groups the overview and the day by their date in %s", (zone) => {
    const from = key(2);
    const to = key(2 + 41);
    const overview = demoSchedulingLinksOps.getPublicSlots("intro-chat", { from, to, duration: 30, displayTimeZone: zone });
    expect(overview).toMatchObject({ time_zone: DEMO_LINK_ZONE, display_time_zone: zone, range_from: from, range_to: to, slots: [] });
    expect(overview.available_dates.length).toBeGreaterThan(0);
    expect(overview.available_dates.every((d) => d >= from && d <= to)).toBe(true);

    for (const date of overview.available_dates.slice(0, 5)) {
      const day = demoSchedulingLinksOps.getPublicSlots("intro-chat", { date, duration: 30, displayTimeZone: zone });
      expect(day).toMatchObject({ display_time_zone: zone, range_from: date, range_to: date, available_dates: [] });
      expect(day.slots.length).toBeGreaterThan(0);
      for (const s of day.slots) expect(dateKeyInZone(s.start, zone)).toBe(date);
    }
  });

  it("answers no day outside the link's horizon and nothing for an unknown link", () => {
    const far = demoSchedulingLinksOps.getPublicSlots("intro-chat", { from: key(200), to: key(241), displayTimeZone: "UTC" });
    expect(far.available_dates).toEqual([]);
    const none = demoSchedulingLinksOps.getPublicSlots("no-such-link", { date: key(3), displayTimeZone: "UTC" });
    expect(none).toMatchObject({ slots: [], available_dates: [], display_time_zone: "UTC" });
  });
});
