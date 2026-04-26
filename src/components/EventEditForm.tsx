import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Loader2, Save, Trash2 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { LocationPicker } from "@/components/LocationPicker";
import { ParticipantPicker } from "@/components/ParticipantPicker";
import { MeetingLinkRow } from "@/components/MeetingLinkRow";
import { api } from "@/api/client";
import { toast } from "@/hooks/useToast";
import type { Attendee, CalendarEvent, ConferenceLink } from "@/api/types";

const inputCls =
  "h-9 w-full rounded-lg border border-input bg-background px-3 text-sm text-foreground transition placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20";

function isoDateOnly(iso: string) {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function isoTimeOnly(iso: string) {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}
function combineDateTime(date: string, time: string): string {
  const [h, m] = time.split(":").map(Number);
  const d = new Date(`${date}T00:00:00`);
  d.setHours(h, m, 0, 0);
  return d.toISOString();
}
function attendeesToDetails(ev: CalendarEvent): Attendee[] {
  if (ev.attendee_details?.length) return ev.attendee_details;
  if (!ev.attendees?.length) return [];
  return ev.attendees.map((email) => ({ email, rsvp: "pending" as const }));
}

interface EventEditFormProps {
  event: CalendarEvent;
  onBack: () => void;
  onClose: () => void;
}

export function EventEditForm({ event, onBack, onClose }: EventEditFormProps) {
  const qc = useQueryClient();
  const isFocus = !!event.is_focus_block;

  const [title, setTitle] = useState(event.title);
  const [date, setDate] = useState(isoDateOnly(event.start));
  const [startTime, setStartTime] = useState(isoTimeOnly(event.start));
  const [endTime, setEndTime] = useState(isoTimeOnly(event.end));
  const [description, setDescription] = useState(event.description ?? "");
  const [location, setLocation] = useState(event.location ?? "");
  const [roomEmail, setRoomEmail] = useState<string | undefined>(event.room_resource_email);
  const [participants, setParticipants] = useState<Attendee[]>(attendeesToDetails(event));
  const [conference, setConference] = useState<ConferenceLink | undefined>(event.conference);
  const [notify, setNotify] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    setTitle(event.title);
    setDate(isoDateOnly(event.start));
    setStartTime(isoTimeOnly(event.start));
    setEndTime(isoTimeOnly(event.end));
    setDescription(event.description ?? "");
    setLocation(event.location ?? "");
    setRoomEmail(event.room_resource_email);
    setParticipants(attendeesToDetails(event));
    setConference(event.conference);
    setNotify(false);
  }, [event]);

  const start = combineDateTime(date, startTime);
  const end = combineDateTime(date, endTime);

  const save = async () => {
    if (!title.trim()) {
      toast.error("Title is required");
      return;
    }
    if (new Date(end) <= new Date(start)) {
      toast.error("End time must be after start time");
      return;
    }
    setSaving(true);
    try {
      await api.updateEvent(
        event.id,
        {
          title: title.trim(),
          start,
          end,
          description,
          location,
          room_resource_email: roomEmail,
          attendee_details: participants,
          attendees: participants.map((p) => p.email),
        },
        notify ? "all" : "none",
      );
      toast.success("Event saved");
      qc.invalidateQueries({ queryKey: ["events"] });
      onClose();
    } catch {
      toast.error("Failed to save event");
    } finally {
      setSaving(false);
    }
  };

  const doDelete = async () => {
    setDeleting(true);
    try {
      await api.deleteEvent(event.id, notify ? "all" : "none");
      toast.success("Event deleted");
      qc.invalidateQueries({ queryKey: ["events"] });
      setConfirmingDelete(false);
      onClose();
    } catch {
      toast.error("Failed to delete event");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <>
      <div className="flex items-center gap-2 border-b border-border bg-card/50 px-5 py-4">
        <button
          type="button"
          onClick={onBack}
          className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition hover:bg-muted hover:text-foreground"
          title="Back to details"
          aria-label="Back to details"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div>
          <h2 className="text-sm font-semibold text-foreground">
            {isFocus ? "🎯 Focus block" : "Edit event"}
          </h2>
          <p className="text-[11px] text-muted-foreground">
            {isFocus ? "Focus blocks are managed automatically." : "Update the details and save your changes."}
          </p>
        </div>
      </div>

      <div className="flex-1 space-y-5 overflow-y-auto p-5">
        <div>
          <label className="mb-1 block text-xs font-medium text-foreground">Title</label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            disabled={isFocus}
            className={inputCls}
          />
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-foreground">Date</label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              disabled={isFocus}
              className={inputCls}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-foreground">Start</label>
            <input
              type="time"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              disabled={isFocus}
              className={inputCls}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-foreground">End</label>
            <input
              type="time"
              value={endTime}
              onChange={(e) => setEndTime(e.target.value)}
              disabled={isFocus}
              className={inputCls}
            />
          </div>
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-foreground">Description</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            disabled={isFocus}
            rows={3}
            className={`${inputCls} h-auto py-2 leading-relaxed`}
            placeholder="Notes, agenda, links…"
          />
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-foreground">Location</label>
          <LocationPicker
            location={location}
            roomEmail={roomEmail}
            start={start}
            end={end}
            onChange={({ location: loc, room_resource_email }) => {
              setLocation(loc);
              setRoomEmail(room_resource_email);
            }}
          />
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-foreground">Participants</label>
          <ParticipantPicker participants={participants} onChange={setParticipants} />
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-foreground">Meeting link</label>
          <MeetingLinkRow eventId={event.id} conference={conference} onChange={setConference} />
        </div>

        <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-border bg-muted/30 px-3 py-2">
          <input
            type="checkbox"
            checked={notify}
            onChange={(e) => setNotify(e.target.checked)}
            className="h-4 w-4 rounded border-input text-primary focus:ring-primary"
          />
          <div className="min-w-0">
            <p className="text-xs font-medium text-foreground">Notify attendees?</p>
            <p className="text-[11px] text-muted-foreground">
              Sends an email update on save or delete.
            </p>
          </div>
        </label>
      </div>

      <div className="sticky bottom-0 flex items-center justify-between gap-2 border-t border-border bg-card/95 p-4 backdrop-blur">
        <button
          type="button"
          onClick={() => setConfirmingDelete(true)}
          disabled={isFocus || saving || deleting}
          className="flex items-center gap-1.5 rounded-lg border border-destructive/30 px-3 py-1.5 text-xs font-medium text-destructive transition hover:bg-destructive/10 disabled:opacity-50"
        >
          <Trash2 className="h-3.5 w-3.5" />
          Delete event
        </button>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onBack}
            className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground transition hover:bg-muted hover:text-foreground"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={save}
            disabled={isFocus || saving}
            className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground transition hover:bg-primary/90 disabled:opacity-50"
          >
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
            Save changes
          </button>
        </div>
      </div>

      <AlertDialog open={confirmingDelete} onOpenChange={setConfirmingDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this event?</AlertDialogTitle>
            <AlertDialogDescription>
              "{event.title}" will be permanently removed from your calendar
              {notify ? " and attendees will be notified." : ". Attendees won't receive a notification."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                doDelete();
              }}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
              Delete event
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
