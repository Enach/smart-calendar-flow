import { Mail, UserCheck, Users } from "lucide-react";
import type { Attendee, CalendarEvent } from "@/api/types";
import type { EventOwnership } from "@/lib/eventOwnership";

interface Props {
  ownership: EventOwnership;
  event: CalendarEvent;
  organizer?: Attendee;
}

/**
 * Small inline pill that tells the user whether they own this meeting
 * or are just a participant. Drives the rescheduling affordance below.
 */
export function OwnershipPill({ ownership, organizer }: Props) {
  if (ownership === "solo") return null;

  if (ownership === "owned") {
    return (
      <span
        className="inline-flex items-center gap-1 rounded-full border border-[#5FC9A6]/30 bg-[#5FC9A6]/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-[#2F8F73]"
        title="You organized this meeting — you can reschedule it directly."
      >
        <UserCheck className="h-3 w-3" />
        You organize
      </span>
    );
  }

  const who = organizer?.name || organizer?.email || "the organizer";
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full border border-[#9B7AE0]/30 bg-[#9B7AE0]/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-[#6F4FB8]"
      title={`Hosted by ${who} — they need to move it.`}
    >
      <Users className="h-3 w-3" />
      Guest
    </span>
  );
}

export function ParticipantNotice({
  event,
  organizer,
}: {
  event: CalendarEvent;
  organizer?: Attendee;
}) {
  const who = organizer?.name || organizer?.email;
  const subject = encodeURIComponent(`Reschedule: ${event.title}`);
  const body = encodeURIComponent(
    `Hi${organizer?.name ? " " + organizer.name.split(" ")[0] : ""},\n\n` +
      `Could we move "${event.title}" on ${new Date(event.start).toLocaleString()}? ` +
      `It's clashing with my focus time.\n\nThanks!`,
  );
  const mailto = organizer?.email
    ? `mailto:${organizer.email}?subject=${subject}&body=${body}`
    : null;

  return (
    <div className="rounded-xl border border-[#9B7AE0]/25 bg-[#9B7AE0]/5 p-4">
      <div className="flex items-start gap-3">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#9B7AE0]/15 text-[#6F4FB8]">
          <Users className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold text-foreground">You're a guest on this meeting</h3>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            {who ? (
              <>
                <span className="font-medium text-foreground">{who}</span> organizes this — only
                they can change the time. You can ask them to move it, or decline if it doesn't
                work.
              </>
            ) : (
              <>The organizer needs to reschedule this meeting. You can ask them to move it.</>
            )}
          </p>
          {mailto && (
            <a
              href={mailto}
              className="mt-3 inline-flex items-center gap-1.5 rounded-md bg-[#9B7AE0] px-2.5 py-1.5 text-[11px] font-semibold text-white transition hover:bg-[#8A6BD0]"
            >
              <Mail className="h-3 w-3" />
              Ask to reschedule
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
