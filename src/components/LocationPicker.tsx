import { useEffect, useRef, useState } from "react";
import { Loader2, MapPin, Building2, Search, X, Pencil } from "lucide-react";
import { api, ROOM_LIST_FAILURE_TEXT, roomListFailure, type RoomListFailure } from "@/api/client";
import type { CalendarRoom } from "@/api/types";

const inputCls =
  "h-9 w-full rounded-lg border border-input bg-background px-3 text-sm text-foreground transition placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20";

/**
 * The interim notices of PAC-41 D-6 (until PAC-102 adds the release-or-keep
 * question). Paceday adds rooms and never releases one, and an event loaded
 * from the server does not show its room, so the form cannot know whether one
 * is held: it says so whenever the user books a room (AC-12) and whenever they
 * leave room booking during this edit (AC-13).
 */
const ROOM_NOTICE_TEXT = {
  booking:
    "Saving adds the chosen room to this event. It does not release a room the event already holds: release a held room in your calendar itself.",
  left: "A room already booked on this event stays booked. Release it in your calendar itself.",
} as const;

interface LocationPickerProps {
  location: string;
  roomEmail?: string;
  onChange: (next: { location: string; room_resource_email?: string }) => void;
}

type Mode = "text" | "room";

export function LocationPicker({ location, roomEmail, onChange }: LocationPickerProps) {
  const [mode, setMode] = useState<Mode>(roomEmail ? "room" : "text");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<CalendarRoom[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<CalendarRoom | null>(null);
  const [failure, setFailure] = useState<RoomListFailure | null>(null);
  const [attempt, setAttempt] = useState(0);
  // AC-13: the user entered room booking during this edit, then left it.
  const [enteredRoom, setEnteredRoom] = useState(Boolean(roomEmail));
  const [leftRoom, setLeftRoom] = useState(false);
  const debounceRef = useRef<number | null>(null);

  // Show the room the form already holds as selected (AC-4). The room's
  // identifier is its address, so the match is on `id`; the search text is the
  // address's local part, which the server's substring match on the id finds.
  useEffect(() => {
    if (mode !== "room") return;
    if (!roomEmail) {
      setSelected(null);
      return;
    }
    let live = true;
    api.searchRooms(roomEmail.split("@")[0]).then(
      (rs) => {
        if (!live) return;
        const match = rs.find((r) => r.id.toLowerCase() === roomEmail.toLowerCase());
        if (match) setSelected(match);
      },
      (e) => {
        if (!live) return;
        const f = roomListFailure(e);
        if (f) setFailure(f);
      },
    );
    return () => {
      live = false;
    };
  }, [roomEmail, mode]);

  // Debounced search: the search text only, no time window (AC-5).
  useEffect(() => {
    if (mode !== "room") return;
    if (selected) return; // don't keep searching after a pick
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(async () => {
      setLoading(true);
      try {
        const rs = await api.searchRooms(query);
        setResults(rs);
        setFailure(null);
      } catch (e) {
        // A failure is said, never shown as "no rooms" (AC-16). It does not
        // touch the room address the form holds.
        const f = roomListFailure(e);
        if (f) {
          setResults([]);
          setFailure(f);
        }
      } finally {
        setLoading(false);
      }
    }, 400);
    return () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
    };
  }, [query, mode, selected, attempt]);

  const switchMode = (next: Mode) => {
    setMode(next);
    if (next === "text") {
      if (enteredRoom) setLeftRoom(true);
      setSelected(null);
      setFailure(null);
      onChange({ location, room_resource_email: undefined });
    } else {
      setEnteredRoom(true);
      onChange({ location: "", room_resource_email: roomEmail });
    }
  };

  const pickRoom = (room: CalendarRoom) => {
    setSelected(room);
    setResults([]);
    setQuery("");
    onChange({ location: room.name, room_resource_email: room.id });
  };

  const clearRoom = () => {
    setSelected(null);
    setLeftRoom(true);
    onChange({ location: "", room_resource_email: undefined });
  };

  const showLeftNotice = leftRoom && (mode === "text" || !selected);

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => switchMode("text")}
          aria-pressed={mode === "text"}
          title="Free text"
          data-testid="location-mode-text"
          className={`flex h-7 items-center gap-1 rounded-md px-2 text-[11px] font-medium transition ${
            mode === "text"
              ? "bg-primary/10 text-primary"
              : "text-muted-foreground hover:bg-muted hover:text-foreground"
          }`}
        >
          <Pencil className="h-3 w-3" />
          Free text
        </button>
        <button
          type="button"
          onClick={() => switchMode("room")}
          aria-pressed={mode === "room"}
          title="Book a room"
          data-testid="location-mode-room"
          className={`flex h-7 items-center gap-1 rounded-md px-2 text-[11px] font-medium transition ${
            mode === "room"
              ? "bg-primary/10 text-primary"
              : "text-muted-foreground hover:bg-muted hover:text-foreground"
          }`}
        >
          <Building2 className="h-3 w-3" />
          Book a room
        </button>
      </div>

      {mode === "text" ? (
        <div className="relative">
          <MapPin className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            value={location}
            onChange={(e) => onChange({ location: e.target.value, room_resource_email: undefined })}
            placeholder="Café de Flore, Paris"
            aria-label="Location"
            data-testid="location-text-input"
            className={`${inputCls} pl-8`}
          />
        </div>
      ) : selected ? (
        <div
          className="flex items-center gap-2 rounded-lg border border-border bg-muted/30 px-3 py-2"
          data-testid="room-selected"
        >
          <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
          <p className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">{selected.name}</p>
          <button
            type="button"
            onClick={clearRoom}
            className="rounded-md p-1 text-muted-foreground transition hover:bg-muted hover:text-foreground"
            aria-label="Clear room"
            data-testid="room-clear"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search rooms by name or address…"
              aria-label="Search rooms"
              data-testid="room-search-input"
              className={`${inputCls} pl-8`}
              autoFocus
            />
            {loading && (
              <Loader2 className="absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 animate-spin text-muted-foreground" />
            )}
          </div>
          {failure ? (
            <div role="alert" className="space-y-1 rounded-lg border border-destructive/30 px-3 py-2" data-testid="room-list-error">
              <p className="text-xs text-destructive">{ROOM_LIST_FAILURE_TEXT[failure]}</p>
              {failure === "unavailable" && (
                <button
                  type="button"
                  onClick={() => setAttempt((n) => n + 1)}
                  className="text-xs font-medium text-foreground underline underline-offset-2"
                >
                  Try again
                </button>
              )}
            </div>
          ) : (
            <ul className="max-h-56 overflow-auto rounded-lg border border-border bg-card" data-testid="room-results">
              {results.length === 0 && !loading ? (
                <li className="p-3 text-center text-[11px] text-muted-foreground">
                  {query ? "No rooms matched." : "Start typing to search rooms."}
                </li>
              ) : (
                results.map((r) => (
                  <li key={r.id}>
                    <button
                      type="button"
                      onClick={() => pickRoom(r)}
                      data-testid="room-option"
                      data-room-id={r.id}
                      className="flex w-full items-center gap-2 px-3 py-2 text-left transition hover:bg-muted/50"
                    >
                      <Building2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">{r.name}</span>
                    </button>
                  </li>
                ))
              )}
            </ul>
          )}
        </div>
      )}

      {mode === "room" && (
        <p className="text-[11px] text-muted-foreground" data-testid="room-booking-notice">
          {ROOM_NOTICE_TEXT.booking}
        </p>
      )}
      {showLeftNotice && (
        <p className="text-[11px] text-muted-foreground" data-testid="room-left-notice">
          {ROOM_NOTICE_TEXT.left}
        </p>
      )}
    </div>
  );
}
