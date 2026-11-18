/**
 * The scheduling prefill the calendar page reads on arrival. Links from the
 * Manager dashboard carry `?title=&attendees=&duration=` in the address.
 * Team Find a time (PAC-129 AC-36) carries `?title=&duration=&start=` in the
 * address and the attendees in navigation state, so no attendee email is ever
 * in the page address.
 */
export interface SchedulePrefillState {
  attendees?: unknown;
}

/** The NLP bar text for a prefill, or null when the arrival carries none. */
export function schedulePrefillText(search: string, state: unknown): string | null {
  const sp = new URLSearchParams(search);
  const title = sp.get("title");
  const fromState = (state as SchedulePrefillState | null | undefined)?.attendees;
  const stateAttendees = Array.isArray(fromState) ? fromState.filter((a): a is string => typeof a === "string") : [];
  const attendees = stateAttendees.length > 0 ? stateAttendees.join(", ") : sp.get("attendees");
  if (!title && !attendees) return null;
  const dur = sp.get("duration") ?? "30";
  return `Schedule ${dur}m ${title ?? "meeting"}${attendees ? ` with ${attendees}` : ""}`;
}
