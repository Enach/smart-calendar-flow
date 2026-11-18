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

/** Where a prefill came from, for the notice the calendar shows. */
export type SchedulePrefillSource = "find-a-time" | "link";

export function schedulePrefillNotice(source: SchedulePrefillSource): string {
  return source === "find-a-time"
    ? "Prefilled from your team's Find a time — review and confirm a slot."
    : "Prefilled from the Manager dashboard — review and confirm a slot.";
}

/** The prefill an arrival carries, or null when it carries none. */
export function schedulePrefill(search: string, state: unknown): { text: string; source: SchedulePrefillSource } | null {
  const text = schedulePrefillText(search, state);
  if (!text) return null;
  const fromState = (state as SchedulePrefillState | null | undefined)?.attendees;
  return { text, source: Array.isArray(fromState) && fromState.length > 0 ? "find-a-time" : "link" };
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
