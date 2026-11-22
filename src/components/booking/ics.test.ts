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

/**
 * RFC 5545 escaping. The plain case is an ordinary host named "Doe, Jane":
 * unescaped, the comma splits the ATTENDEE line's parameters and the file is
 * wrong for every booker who downloads it. The same gap lets a line break or a
 * `:` in host-controlled text (title, host name) add or hijack a property in a
 * visitor's calendar, so the two are one fix.
 */
describe("booking calendar file escaping (RFC 5545)", () => {
  /** The content lines of a property, unfolded: one entry per CRLF-separated line. */
  const linesOf = (ics: string, name: string) =>
    ics.split("\r\n").filter((l) => l.startsWith(`${name}:`) || l.startsWith(`${name};`));

  it("a host named \"Doe, Jane\" stays one ATTENDEE parameter", () => {
    const ics = buildIcs({ ...conf, hosts: [{ email: "jane@co.com", name: "Doe, Jane" }] });
    const attendees = linesOf(ics, "ATTENDEE");
    expect(attendees[0]).toBe(
      'ATTENDEE;CN="Doe, Jane";ROLE=REQ-PARTICIPANT;PARTSTAT=ACCEPTED:mailto:jane@co.com',
    );
    // The comma is inside the quoted value, so ROLE and PARTSTAT are still the
    // line's other two parameters and the address is still its value.
    expect(attendees[0].split('"')[2].split(";")).toEqual([
      "",
      "ROLE=REQ-PARTICIPANT",
      "PARTSTAT=ACCEPTED:mailto:jane@co.com",
    ]);
    expect(linesOf(ics, "ORGANIZER")[0]).toBe('ORGANIZER;CN="Doe, Jane":mailto:jane@co.com');
  });

  it("a CRLF in the title stays inside SUMMARY instead of starting a property", () => {
    const ics = buildIcs({ ...conf, title: "Intro\r\nATTENDEE;CN=Evil:mailto:evil@attacker.test" });
    expect(linesOf(ics, "SUMMARY")).toEqual([
      "SUMMARY:Intro\\nATTENDEE\\;CN=Evil:mailto:evil@attacker.test",
    ]);
    // The host and the booker are still the only two attendees: the title
    // added no property of its own.
    expect(linesOf(ics, "ATTENDEE").map((l) => l.split("mailto:")[1])).toEqual([
      "host@co.com",
      "booker@co.com",
    ]);
  });

  it("a `:` in a host name cannot take over the ORGANIZER address", () => {
    const ics = buildIcs({ ...conf, hosts: [{ email: "host@co.com", name: "Host:mailto:evil@attacker.test" }] });
    const organizer = linesOf(ics, "ORGANIZER")[0];
    expect(organizer).toBe('ORGANIZER;CN="Host:mailto:evil@attacker.test":mailto:host@co.com');
    // Everything after the closing quote is the address: the real host's.
    expect(organizer.slice(organizer.lastIndexOf('"') + 1)).toBe(":mailto:host@co.com");
  });

  it("backslashes, semicolons and commas in notes survive as escapes, line breaks included", () => {
    const ics = buildIcs({ ...conf, notes: "a\\b; c, d\nnext" });
    expect(linesOf(ics, "DESCRIPTION")).toEqual([
      "DESCRIPTION:Booked via Paceday\\n\\na\\\\b\\; c\\, d\\nnext",
    ]);
  });
});

/**
 * A host that reaches the builder without an address. `PublicHost.email` is on
 * its way out of the DTO, and the ORGANIZER line already degrades to an empty
 * CAL-ADDRESS for a missing one; the ATTENDEE line did not, so one addressless
 * host threw a TypeError and took the whole download with it.
 *
 * The builder still reads `h.email`, and must: ORGANIZER and ATTENDEE are
 * CAL-ADDRESS properties (RFC 5545 §3.8.4.3, §3.8.4.1) and a calendar client
 * needs a real reply-to there. What changes is only what happens when there is
 * nothing to put.
 */
describe("booking calendar file with no host address", () => {
  const linesOf = (ics: string, name: string) =>
    ics.split("\r\n").filter((l) => l.startsWith(`${name}:`) || l.startsWith(`${name};`));

  /** A hosts array as a server that has dropped `email` would send it. */
  const addressless = (...hosts: Array<{ name?: string }>) => hosts as BookingConfirmation["hosts"];

  it("builds a file for a named host carrying no address", () => {
    const ics = buildIcs({ ...conf, hosts: addressless({ name: "Alice Martin" }) }, new Date("2027-01-01T00:00:00Z"));
    expect(linesOf(ics, "ORGANIZER")).toEqual(["ORGANIZER;CN=Alice Martin:mailto:"]);
    expect(linesOf(ics, "ATTENDEE")).toEqual([
      "ATTENDEE;CN=Alice Martin;ROLE=REQ-PARTICIPANT;PARTSTAT=ACCEPTED:mailto:",
      "ATTENDEE;CN=Booker;ROLE=REQ-PARTICIPANT;PARTSTAT=ACCEPTED:mailto:booker@co.com",
    ]);
  });

  it("builds a file for a host carrying neither name nor address", () => {
    const ics = buildIcs({ ...conf, hosts: addressless({}) }, new Date("2027-01-01T00:00:00Z"));
    expect(linesOf(ics, "ORGANIZER")).toEqual(["ORGANIZER;CN=:mailto:"]);
    expect(linesOf(ics, "ATTENDEE")[0]).toBe("ATTENDEE;CN=;ROLE=REQ-PARTICIPANT;PARTSTAT=ACCEPTED:mailto:");
    expect(ics.split("\r\n").at(-1)).toBe("END:VCALENDAR");
  });

  it("builds a file for a host whose address is the empty string", () => {
    const ics = buildIcs({ ...conf, hosts: [{ email: "", name: "Alice Martin" }] }, new Date("2027-01-01T00:00:00Z"));
    expect(linesOf(ics, "ATTENDEE")[0]).toBe(
      "ATTENDEE;CN=Alice Martin;ROLE=REQ-PARTICIPANT;PARTSTAT=ACCEPTED:mailto:",
    );
  });

  it("degrades for one addressless host without touching the others", () => {
    const ics = buildIcs(
      { ...conf, hosts: [{ email: "host@co.com", name: "Host" }, ...addressless({ name: "Alice Martin" })] },
      new Date("2027-01-01T00:00:00Z"),
    );
    expect(linesOf(ics, "ATTENDEE")).toEqual([
      "ATTENDEE;CN=Host;ROLE=REQ-PARTICIPANT;PARTSTAT=ACCEPTED:mailto:host@co.com",
      "ATTENDEE;CN=Alice Martin;ROLE=REQ-PARTICIPANT;PARTSTAT=ACCEPTED:mailto:",
      "ATTENDEE;CN=Booker;ROLE=REQ-PARTICIPANT;PARTSTAT=ACCEPTED:mailto:booker@co.com",
    ]);
    expect(linesOf(ics, "ORGANIZER")).toEqual(["ORGANIZER;CN=Host:mailto:host@co.com"]);
  });

  it("leaves a well-formed host's lines byte for byte as they were", () => {
    const ics = buildIcs(conf, new Date("2027-01-01T00:00:00Z"));
    expect(linesOf(ics, "ORGANIZER")).toEqual(["ORGANIZER;CN=Host:mailto:host@co.com"]);
    expect(linesOf(ics, "ATTENDEE")).toEqual([
      "ATTENDEE;CN=Host;ROLE=REQ-PARTICIPANT;PARTSTAT=ACCEPTED:mailto:host@co.com",
      "ATTENDEE;CN=Booker;ROLE=REQ-PARTICIPANT;PARTSTAT=ACCEPTED:mailto:booker@co.com",
    ]);
  });

  it("keeps the #205 escaping on a host that has a name but no address", () => {
    const ics = buildIcs(
      { ...conf, hosts: addressless({ name: "Doe, Jane:mailto:evil@attacker.test" }) },
      new Date("2027-01-01T00:00:00Z"),
    );
    // The name is still one quoted parameter value, so it cannot add a
    // parameter or supply an address of its own.
    expect(linesOf(ics, "ATTENDEE")[0]).toBe(
      'ATTENDEE;CN="Doe, Jane:mailto:evil@attacker.test";ROLE=REQ-PARTICIPANT;PARTSTAT=ACCEPTED:mailto:',
    );
    expect(linesOf(ics, "ORGANIZER")[0]).toBe('ORGANIZER;CN="Doe, Jane:mailto:evil@attacker.test":mailto:');
  });
});
