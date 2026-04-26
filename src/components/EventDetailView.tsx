import { useState } from "react";
import {
  Calendar as CalendarIcon,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  MapPin,
  Pencil,
  Users,
  Video,
  X,
} from "lucide-react";
import { RescheduleSuggestions } from "@/components/RescheduleSuggestions";
import type { Attendee, CalendarEvent } from "@/api/types";

interface EventDetailViewProps {
  event: CalendarEvent;
  events: CalendarEvent[];
  workStart: string;
  workEnd: string;
  onEdit: () => void;
  onClose: () => void;
}

function formatRange(startISO: string, endISO: string) {
  const s = new Date(startISO);
  const e = new Date(endISO);
  const datePart = s.toLocaleDateString(undefined, {
    weekday: "long",
    day: "numeric",
    month: "short",
  });
  const timeFmt: Intl.DateTimeFormatOptions = { hour: "2-digit", minute: "2-digit", hour12: false };
  return `${datePart} · ${s.toLocaleTimeString(undefined, timeFmt)} – ${e.toLocaleTimeString(undefined, timeFmt)}`;
}

function initialsOf(a: Attendee): string {
  const source = (a.name || a.email || "?").trim();
  const parts = source.split(/[\s@.]+/).filter(Boolean);
  if (!parts.length) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

function attendeesOf(ev: CalendarEvent): Attendee[] {
  if (ev.attendee_details?.length) return ev.attendee_details;
  if (!ev.attendees?.length) return [];
  return ev.attendees.map((email) => ({ email, rsvp: "pending" as const }));
}

export function EventDetailView({
  event,
  events,
  workStart,
  workEnd,
  onEdit,
  onClose,
}: EventDetailViewProps) {
  const isFocus = !!event.is_focus_block;
  const isPersonal = !!event.is_personal_block || /personal time/i.test(event.title);
  const readOnly = isFocus || isPersonal;

  const [descExpanded, setDescExpanded] = useState(false);
  const [rescheduleOpen, setRescheduleOpen] = useState(true);

  const participants = attendeesOf(event);
  const description = event.description ?? "";
  const showDescToggle = description.split("\n").length > 3 || description.length > 240;

  return (
    <div className="flex flex-1 flex-col">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 border-b border-border bg-card/50 p-5">
        <div className="min-w-0 flex-1">
          <h2 className="break-words text-xl font-semibold leading-tight text-foreground">
            {event.title}
          </h2>
          <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
            <CalendarIcon className="h-3.5 w-3.5" />
            {formatRange(event.start, event.end)}
          </p>
        </div>
        <div className="flex flex-shrink-0 items-center gap-1">
          {!readOnly && (
            <button
              type="button"
              onClick={onEdit}
              aria-label="Edit event"
              className="rounded-md p-2 text-muted-foreground transition hover:bg-muted hover:text-foreground"
            >
              <Pencil className="h-4 w-4" />
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-md p-2 text-muted-foreground transition hover:bg-muted hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 space-y-5 overflow-y-auto p-5">
        {(event.location || event.room_resource_email) && (
          <div className="flex items-start gap-2 text-sm">
            <MapPin className="mt-0.5 h-4 w-4 flex-shrink-0 text-muted-foreground" />
            <div className="min-w-0">
              <p className="text-foreground">{event.location || event.room_resource_email}</p>
              {event.location && event.room_resource_email && (
                <p className="text-xs text-muted-foreground">{event.room_resource_email}</p>
              )}
            </div>
          </div>
        )}

        {participants.length > 0 && (
          <div>
            <p className="mb-2 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <Users className="h-3.5 w-3.5" />
              Participants ({participants.length})
            </p>
            <ul className="space-y-1.5">
              {participants.map((p) => (
                <li key={p.email} className="flex items-center gap-2.5">
                  <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-primary/10 text-[10px] font-semibold text-primary">
                    {initialsOf(p)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm text-foreground">{p.name || p.email}</p>
                    {p.name && (
                      <p className="truncate text-[11px] text-muted-foreground">{p.email}</p>
                    )}
                  </div>
                  {p.rsvp && p.rsvp !== "pending" && (
                    <span
                      className={
                        "rounded-full px-2 py-0.5 text-[10px] font-medium capitalize " +
                        (p.rsvp === "accepted"
                          ? "bg-success/10 text-success"
                          : p.rsvp === "declined"
                            ? "bg-destructive/10 text-destructive"
                            : "bg-warning/10 text-warning")
                      }
                    >
                      {p.rsvp}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}

        {event.conference?.url && (
          <a
            href={event.conference.url}
            target="_blank"
            rel="noreferrer noopener"
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90"
          >
            <Video className="h-4 w-4" />
            Join {event.conference.provider ? event.conference.provider.replace(/_/g, " ") : "meeting"}
            <ExternalLink className="h-3 w-3" />
          </a>
        )}

        {description && (
          <div>
            <p className="mb-1 text-xs font-medium text-muted-foreground">Description</p>
            <p
              className={
                "whitespace-pre-wrap text-sm leading-relaxed text-foreground " +
                (descExpanded ? "" : "line-clamp-3")
              }
            >
              {description}
            </p>
            {showDescToggle && (
              <button
                type="button"
                onClick={() => setDescExpanded((v) => !v)}
                className="mt-1 text-xs font-medium text-primary hover:underline"
              >
                {descExpanded ? "Show less" : "Show more"}
              </button>
            )}
          </div>
        )}

        {/* Reschedule */}
        {!readOnly && (
          <section className="rounded-xl border border-border bg-muted/20 p-3">
            <button
              type="button"
              onClick={() => setRescheduleOpen((v) => !v)}
              className="flex w-full items-center justify-between text-left"
              aria-expanded={rescheduleOpen}
            >
              <div>
                <p className="text-sm font-semibold text-foreground">Reschedule</p>
                <p className="text-[11px] text-muted-foreground">
                  Smart suggestions ranked by focus-time impact
                </p>
              </div>
              {rescheduleOpen ? (
                <ChevronUp className="h-4 w-4 text-muted-foreground" />
              ) : (
                <ChevronDown className="h-4 w-4 text-muted-foreground" />
              )}
            </button>
            {rescheduleOpen && (
              <div className="mt-3">
                <RescheduleSuggestions
                  event={event}
                  events={events}
                  workStart={workStart}
                  workEnd={workEnd}
                  onMoved={onClose}
                />
              </div>
            )}
          </section>
        )}
      </div>
    </div>
  );
}
