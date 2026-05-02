/**
 * Ownership of a calendar event from the current user's perspective.
 *
 * - "solo":        no other attendees (focus/personal blocks, self-only events).
 *                  Trivially reschedulable — it's just yours.
 * - "owned":       there are attendees AND the current user is the organizer.
 *                  Reschedulable directly — moving it updates everyone's invite.
 * - "participant": there are attendees and someone else is the organizer.
 *                  We cannot reschedule unilaterally — we have to ask the host.
 */

import type { Attendee, CalendarEvent } from "@/api/types";

export type EventOwnership = "solo" | "owned" | "participant";

function attendees(ev: CalendarEvent): Attendee[] {
  if (ev.attendee_details?.length) return ev.attendee_details;
  if (ev.attendees?.length) return ev.attendees.map((email) => ({ email }));
  return [];
}

export function getEventOwnership(ev: CalendarEvent, userEmail?: string | null): EventOwnership {
  if (ev.is_focus_block || ev.is_personal_block) return "solo";
  const list = attendees(ev);
  // No co-attendees → effectively solo (nothing to coordinate).
  const others = list.filter((a) => !userEmail || a.email.toLowerCase() !== userEmail.toLowerCase());
  if (others.length === 0) return "solo";

  const me = userEmail
    ? list.find((a) => a.email.toLowerCase() === userEmail.toLowerCase())
    : undefined;
  if (me?.organizer) return "owned";

  // If we know there's an explicit organizer who isn't us → participant.
  if (list.some((a) => a.organizer)) return "participant";

  // Unknown organizer + multi-attendee → assume we're a participant (safer:
  // we don't want to silently let the user reschedule someone else's meeting).
  return "participant";
}

export function getEventOrganizer(ev: CalendarEvent): Attendee | undefined {
  return ev.attendee_details?.find((a) => a.organizer);
}

export function isOwned(ev: CalendarEvent, userEmail?: string | null): boolean {
  const o = getEventOwnership(ev, userEmail);
  return o === "owned" || o === "solo";
}
