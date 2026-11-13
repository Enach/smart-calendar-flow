/** PAC-88 AC-30: the calendar file keeps UTC instants; its name carries the displayed-zone date. */
import { describe, expect, it } from "vitest";

import type { BookingConfirmation } from "@/api/types";
import { buildIcs, icsFileName } from "./ics";

const conf: BookingConfirmation = {
  id: "b1",
  link_slug: "intro",
  title: "Intro call",
  start: "2027-01-14T23:30:00Z",
  end: "2027-01-15T00:00:00Z",
  duration_minutes: 30,
  hosts: [{ email: "host@co.com", name: "Host" }],
  booker_name: "Booker",
  booker_email: "booker@co.com",
  notes: "line 1\nline 2",
};

describe("booking calendar file (AC-30)", () => {
  it("names the file with the start's date in the zone the visitor booked in", () => {
    expect(icsFileName(conf, "Asia/Tokyo")).toBe("intro-2027-01-15.ics");
    expect(icsFileName(conf, "UTC")).toBe("intro-2027-01-14.ics");
    expect(icsFileName(conf, "America/Los_Angeles")).toBe("intro-2027-01-14.ics");
  });

  it("keeps absolute UTC instants whatever the zone", () => {
    const ics = buildIcs(conf, new Date("2027-01-01T00:00:00Z"));
    expect(ics).toContain("DTSTART:20270114T233000Z");
    expect(ics).toContain("DTEND:20270115T000000Z");
    expect(ics).toContain("DTSTAMP:20270101T000000Z");
    expect(ics).toContain("DESCRIPTION:Booked via Paceday\\n\\nline 1\\nline 2");
    expect(ics).toContain("ATTENDEE;CN=Booker;ROLE=REQ-PARTICIPANT;PARTSTAT=ACCEPTED:mailto:booker@co.com");
    expect(ics.split("\r\n")[0]).toBe("BEGIN:VCALENDAR");
  });
});
