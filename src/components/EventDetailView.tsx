import { useState } from "react";
import { CalendarClock, Crown, ExternalLink, MapPin, Pencil, Users, Video, X } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { RescheduleSuggestions } from "@/components/RescheduleSuggestions";
import { OwnershipPill, ParticipantNotice } from "@/components/EventOwnership";
import { useAuth } from "@/contexts/AuthContext";
import { getEventOwnership, getEventOrganizer } from "@/lib/eventOwnership";
import type { Attendee, CalendarEvent } from "@/api/types";

const RSVP_LABEL: Record<string, string> = {
  accepted: "Accepted",
  declined: "Declined",
  tentative: "Tentative",
  pending: "Pending",
};
const RSVP_COLOR: Record<string, string> = {
  accepted: "bg-success/15 text-success",
  declined: "bg-destructive/15 text-destructive",
  tentative: "bg-warning/15 text-warning",
  pending: "bg-muted text-muted-foreground",
};

function attendeesToDetails(ev: CalendarEvent): Attendee[] {
  if (ev.attendee_details?.length) return ev.attendee_details;
  if (!ev.attendees?.length) return [];
  return ev.attendees.map((email) => ({ email, rsvp: "pending" as const }));
}

function initials(a: Attendee) {
  const src = a.name || a.email;
  const parts = src.split(/[\s@.]+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "?";
}

function formatRange(startISO: string, endISO: string) {
  const s = new Date(startISO);
  const e = new Date(endISO);
  const day = s.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" });
  const sTime = s.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  const eTime = e.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  return `${day} · ${sTime} – ${eTime}`;
}

interface Props {
  event: CalendarEvent;
  events: CalendarEvent[];
  workStart: string;
  workEnd: string;
  onEdit: () => void;
  onClose: () => void;
}

export function EventDetailView({ event, events, workStart, workEnd, onEdit, onClose }: Props) {
  const [showFullDescription, setShowFullDescription] = useState(false);
  const { user } = useAuth();
  const isFocus = !!event.is_focus_block;
  const isPersonal = !!event.is_personal_block;
  const participants = attendeesToDetails(event);
  const description = event.description?.trim() ?? "";
  const longDescription = description.split(/\r?\n/).length > 3 || description.length > 220;
  const ownership = getEventOwnership(event, user?.email);
  const organizer = getEventOrganizer(event);
  const isParticipantOnly = ownership === "participant";

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 border-b border-border bg-card/50 px-5 py-4">
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-xl font-semibold leading-tight text-foreground">
            {isFocus ? "🎯 " : isPersonal ? "🏠 " : ""}
            {event.title}
          </h2>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <CalendarClock className="h-3.5 w-3.5" />
              {formatRange(event.start, event.end)}
            </p>
            <OwnershipPill ownership={ownership} event={event} organizer={organizer} />
          </div>
        </div>
        <div className="flex items-center gap-1">
          {!isFocus && !isPersonal && !isParticipantOnly && (
            <button
              type="button"
              onClick={onEdit}
              className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition hover:bg-muted hover:text-foreground"
              title="Edit event"
              aria-label="Edit event"
            >
              <Pencil className="h-4 w-4" />
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition hover:bg-muted hover:text-foreground"
            title="Close"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 space-y-4 overflow-y-auto p-5">
        {(event.location || event.room_resource_email) && (
          <div className="flex items-start gap-2 text-sm text-foreground">
            <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
            <div className="min-w-0">
              <p className="truncate">{event.location || event.room_resource_email}</p>
              {event.location && event.room_resource_email && (
                <p className="truncate text-xs text-muted-foreground">{event.room_resource_email}</p>
              )}
            </div>
          </div>
        )}

        {event.conference?.url && (
          <div className="flex items-center gap-2">
            <Video className="h-4 w-4 shrink-0 text-muted-foreground" />
            <a
              href={event.conference.url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground transition hover:bg-primary/90"
            >
              Join meeting
              <ExternalLink className="h-3 w-3" />
            </a>
            <span className="text-xs text-muted-foreground">
              {event.conference.label || event.conference.provider.replace("_", " ")}
            </span>
          </div>
        )}

        {/* Scheduling confidence (T-40) — only when free/busy data was used at scheduling time. */}
        {!isFocus && !isPersonal && event.coverage && event.coverage.total > 0 && (() => {
          const total = event.coverage!.total;
          const checked = event.coverage!.checked;
          const allChecked = checked >= total;
          return (
            <div className="flex items-center gap-2 text-xs">
              <span
                className={
                  "inline-block h-2 w-2 rounded-full " +
                  (allChecked ? "bg-[#5FC9A6]" : "bg-[#E9B949]")
                }
                aria-hidden
              />
              <span className={allChecked ? "text-muted-foreground" : "font-medium text-[#8A6A14]"}>
                {allChecked
                  ? "Times verified for all attendees"
                  : `Times verified for ${checked} of ${total} attendees`}
              </span>
            </div>
          );
        })()}

        {participants.length > 0 && (
          <div>
            <p className="mb-2 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <Users className="h-3.5 w-3.5" />
              {participants.length} participant{participants.length === 1 ? "" : "s"}
            </p>
            <ul className="space-y-1.5">
              {participants.map((p) => {
                const isMe = user?.email && p.email.toLowerCase() === user.email.toLowerCase();
                return (
                  <li
                    key={p.email}
                    className="flex items-center gap-2 rounded-md px-1.5 py-1 text-sm hover:bg-muted/50"
                  >
                    <Avatar className="h-7 w-7">
                      <AvatarFallback className="bg-primary-muted text-[10px] font-semibold text-accent-foreground">
                        {initials(p)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <p className="truncate text-sm text-foreground">
                          {p.name || p.email}
                          {isMe && <span className="ml-1 text-muted-foreground">(you)</span>}
                        </p>
                        {p.organizer && (
                          <span
                            className="inline-flex items-center gap-0.5 rounded bg-[#E9B949]/15 px-1 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-[#8A6A14]"
                            title="Meeting organizer"
                          >
                            <Crown className="h-2.5 w-2.5" />
                            Host
                          </span>
                        )}
                      </div>
                      {p.name && <p className="truncate text-[11px] text-muted-foreground">{p.email}</p>}
                    </div>
                    {p.rsvp && (
                      <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${RSVP_COLOR[p.rsvp]}`}>
                        {RSVP_LABEL[p.rsvp]}
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        {description && (
          <div>
            <p className="mb-1 text-xs font-medium text-muted-foreground">Description</p>
            <p
              className={
                "whitespace-pre-wrap text-sm text-foreground " +
                (showFullDescription ? "" : "line-clamp-3")
              }
            >
              {description}
            </p>
            {longDescription && (
              <button
                type="button"
                onClick={() => setShowFullDescription((v) => !v)}
                className="mt-1 text-xs font-medium text-primary hover:underline"
              >
                {showFullDescription ? "Show less" : "Show more"}
              </button>
            )}
          </div>
        )}

        {!isFocus && !isPersonal && (
          <RescheduleSuggestions
            event={event}
            events={events}
            workStart={workStart}
            workEnd={workEnd}
            onMoved={onClose}
          />
        )}
      </div>
    </div>
  );
}
