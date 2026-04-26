import { useEffect, useRef, useState } from "react";
import { Loader2, MapPin, Building2, Search, X, Pencil } from "lucide-react";
import { api } from "@/api/client";
import type { Room } from "@/api/types";

const inputCls =
  "h-9 w-full rounded-lg border border-input bg-background px-3 text-sm text-foreground transition placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20";

interface LocationPickerProps {
  location: string;
  roomEmail?: string;
  start: string; // ISO
  end: string; // ISO
  onChange: (next: { location: string; room_resource_email?: string }) => void;
}

type Mode = "text" | "room";

export function LocationPicker({ location, roomEmail, start, end, onChange }: LocationPickerProps) {
  const [mode, setMode] = useState<Mode>(roomEmail ? "room" : "text");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Room[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<Room | null>(null);
  const debounceRef = useRef<number | null>(null);

  // Sync external selected room (e.g. when drawer opens with an existing roomEmail)
  useEffect(() => {
    if (mode !== "room") return;
    if (!roomEmail) {
      setSelected(null);
      return;
    }
    // Best-effort lookup: search by email substring
    api.searchRooms(roomEmail.split("@")[0], start, end).then((rs) => {
      const match = rs.find((r) => r.email === roomEmail);
      if (match) setSelected(match);
    });
  }, [roomEmail, mode, start, end]);

  // Debounced search
  useEffect(() => {
    if (mode !== "room") return;
    if (selected) return; // don't keep searching after a pick
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(async () => {
      setLoading(true);
      try {
        const rs = await api.searchRooms(query, start, end);
        setResults(rs);
      } finally {
        setLoading(false);
      }
    }, 400);
    return () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
    };
  }, [query, mode, start, end, selected]);

  const switchMode = (next: Mode) => {
    setMode(next);
    if (next === "text") {
      setSelected(null);
      onChange({ location, room_resource_email: undefined });
    } else {
      onChange({ location: "", room_resource_email: roomEmail });
    }
  };

  const pickRoom = (room: Room) => {
    setSelected(room);
    setResults([]);
    setQuery("");
    onChange({ location: room.name, room_resource_email: room.email });
  };

  const clearRoom = () => {
    setSelected(null);
    onChange({ location: "", room_resource_email: undefined });
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => switchMode("text")}
          aria-pressed={mode === "text"}
          title="Free text"
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
            className={`${inputCls} pl-8`}
          />
        </div>
      ) : selected ? (
        <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/30 px-3 py-2">
          <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-foreground">{selected.name}</p>
            <p className="truncate text-[11px] text-muted-foreground">
              {[selected.building, selected.floor && `Floor ${selected.floor}`, selected.capacity && `${selected.capacity} seats`]
                .filter(Boolean)
                .join(" · ")}
            </p>
          </div>
          <button
            type="button"
            onClick={clearRoom}
            className="rounded-md p-1 text-muted-foreground transition hover:bg-muted hover:text-foreground"
            aria-label="Clear room"
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
              placeholder="Search rooms by name or building…"
              className={`${inputCls} pl-8`}
              autoFocus
            />
            {loading && (
              <Loader2 className="absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 animate-spin text-muted-foreground" />
            )}
          </div>
          <ul className="max-h-56 overflow-auto rounded-lg border border-border bg-card">
            {results.length === 0 && !loading ? (
              <li className="p-3 text-center text-[11px] text-muted-foreground">
                {query ? "No rooms matched." : "Start typing to search rooms."}
              </li>
            ) : (
              results.map((r) => (
                <li key={r.id}>
                  <button
                    type="button"
                    onClick={() => r.available !== false && pickRoom(r)}
                    disabled={r.available === false}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left transition hover:bg-muted/50 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <Building2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-foreground">{r.name}</p>
                      <p className="truncate text-[11px] text-muted-foreground">
                        {[r.building, r.floor && `Floor ${r.floor}`, r.capacity && `${r.capacity} seats`]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                    </div>
                    {r.available === false ? (
                      <span className="shrink-0 rounded-full bg-destructive/10 px-1.5 py-0.5 text-[10px] font-semibold text-destructive">
                        ✗ Busy
                      </span>
                    ) : (
                      <span className="shrink-0 rounded-full bg-success/10 px-1.5 py-0.5 text-[10px] font-semibold text-success">
                        ✓ Available
                      </span>
                    )}
                  </button>
                </li>
              ))
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
