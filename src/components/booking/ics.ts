/**
 * The calendar file the public booking page offers after a booking.
 *
 * Instants stay absolute (UTC `Z`), so every calendar client shows them in its
 * own zone (PAC-88 spec 3.6, unchanged). Only the file name carries a date:
 * the start's date in the zone the visitor booked in (AC-30).
 */
import type { BookingConfirmation } from "@/api/types";
import { dateKeyInZone } from "@/lib/timeZone";

const icsInstant = (s: string) => new Date(s).toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";

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
    `SUMMARY:${conf.title}`,
    `DESCRIPTION:Booked via Paceday${conf.notes ? `\\n\\n${conf.notes.replace(/\n/g, "\\n")}` : ""}`,
    `ORGANIZER;CN=${conf.hosts[0]?.name || conf.hosts[0]?.email}:mailto:${conf.hosts[0]?.email || ""}`,
    ...conf.hosts.map(
      (h) => `ATTENDEE;CN=${h.name || h.email};ROLE=REQ-PARTICIPANT;PARTSTAT=ACCEPTED:mailto:${h.email}`,
    ),
    `ATTENDEE;CN=${conf.booker_name};ROLE=REQ-PARTICIPANT;PARTSTAT=ACCEPTED:mailto:${conf.booker_email}`,
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
