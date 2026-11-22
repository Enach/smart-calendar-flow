/**
 * The calendar file the public booking page offers after a booking.
 *
 * Instants stay absolute (UTC `Z`), so every calendar client shows them in its
 * own zone (PAC-88 spec 3.6, unchanged). Only the file name carries a date:
 * the start's date in the zone the visitor booked in (AC-30).
 *
 * This is the one place on the public booking path that legitimately needs a
 * host's address: ORGANIZER and ATTENDEE are CAL-ADDRESS properties (RFC 5545
 * sections 3.8.4.3 and 3.8.4.1) and a calendar client needs a real reply-to in
 * them. It is a value written into a file the booker asked for, not something
 * the page displays, so it stays. What it must not do is throw when a host
 * reaches it with no address.
 */
import type { BookingConfirmation } from "@/api/types";
import { dateKeyInZone } from "@/lib/timeZone";

const icsInstant = (s: string) => new Date(s).toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";

/**
 * RFC 5545 section 3.3.11: a TEXT property value. Backslash, semicolon and
 * comma carry meaning inside a value and are escaped; every line break becomes
 * the literal `\n` (the one escape notes already relied on), and any other
 * control character becomes a space, so no free text can end the content line
 * and start a property of its own.
 */
const icsText = (v: string): string =>
  v
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r\n|[\r\n]/g, "\\n")
    .replace(/\p{Cc}+/gu, " ");

/**
 * RFC 5545 section 3.2: a parameter value, as in `CN=`. Parameters have no
 * escape mechanism: a value holding `;`, `:`, `,` or `"` is quoted, and a `"`
 * or a control character, which a quoted string cannot carry either, becomes a
 * space. Without this a host named `Doe, Jane` splits the ATTENDEE line's
 * parameters in two, and a `:` in a name ends the parameter list early.
 */
const icsParam = (v: string): string => {
  const safe = v.replace(/["\p{Cc}]+/gu, " ");
  return /[;:,]/.test(safe) ? `"${safe}"` : safe;
};

/** A CAL-ADDRESS (`mailto:`) is a URI: neither whitespace nor a control character belongs in one. */
const icsAddress = (v: string): string => v.replace(/[\s\p{Cc}]+/gu, "");

export function buildIcs(conf: BookingConfirmation, now: Date = new Date()): string {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Paceday//Booking//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${conf.id}@paceday.com`,
    `DTSTAMP:${icsInstant(now.toISOString())}`,
    `DTSTART:${icsInstant(conf.start)}`,
    `DTEND:${icsInstant(conf.end)}`,
    `SUMMARY:${icsText(conf.title)}`,
    `DESCRIPTION:${icsText(`Booked via Paceday${conf.notes ? `\n\n${conf.notes}` : ""}`)}`,
    `ORGANIZER;CN=${icsParam(conf.hosts[0]?.name || conf.hosts[0]?.email || "")}:mailto:${icsAddress(conf.hosts[0]?.email || "")}`,
    // ORGANIZER above already degrades to an empty CAL-ADDRESS for a host with
    // no address; ATTENDEE now does the same instead of throwing on one. A host
    // with an address is unaffected: `|| ""` only chooses what to escape.
    ...conf.hosts.map(
      (h) =>
        `ATTENDEE;CN=${icsParam(h.name || h.email || "")};ROLE=REQ-PARTICIPANT;PARTSTAT=ACCEPTED:mailto:${icsAddress(h.email || "")}`,
    ),
    `ATTENDEE;CN=${icsParam(conf.booker_name)};ROLE=REQ-PARTICIPANT;PARTSTAT=ACCEPTED:mailto:${icsAddress(conf.booker_email)}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  return lines.join("\r\n");
}

/** "<slug>-YYYY-MM-DD.ics", the date being the start's date in `zone`. */
export function icsFileName(conf: BookingConfirmation, zone: string): string {
  return `${conf.link_slug}-${dateKeyInZone(conf.start, zone)}.ics`;
}

export function downloadIcs(conf: BookingConfirmation, zone: string): void {
  const blob = new Blob([buildIcs(conf)], { type: "text/calendar" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = icsFileName(conf, zone);
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
