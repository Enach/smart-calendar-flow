import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation } from "@tanstack/react-query";
import { Sparkles, CalendarPlus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { teamsApi, type FormalTeam, type AvailabilitySlot } from "@/api/teams";

interface Props {
  team: FormalTeam;
}

const DURATIONS = [15, 30, 45, 60, 90];

function todayISO() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString().slice(0, 10);
}

function fmtSlot(iso: string, endIso: string) {
  const start = new Date(iso);
  const end = new Date(endIso);
  const dayLabel = start.toLocaleDateString(undefined, { weekday: "long" });
  const startTime = start.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  const endTime = end.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  return `${dayLabel} ${startTime} – ${endTime}`;
}

export function FindATimeTab({ team }: Props) {
  const navigate = useNavigate();
  const [date, setDate] = useState(todayISO());
  const [duration, setDuration] = useState(30);
  const [slots, setSlots] = useState<AvailabilitySlot[] | null>(null);

  const findMut = useMutation({
    mutationFn: () => teamsApi.remote.findSlots(team.id, date, duration),
    onSuccess: (s) => setSlots(s),
  });

  const onSchedule = (slot: AvailabilitySlot) => {
    const attendees = team.members
      .filter((m) => m.status === "active" && m.email !== teamsApi.currentUserEmail())
      .map((m) => m.email)
      .join(",");
    const params = new URLSearchParams({
      title: `${team.name} sync`,
      attendees,
      duration: String(duration),
      start: slot.start,
    });
    navigate(`/app?${params.toString()}`);
  };

  return (
    <div className="space-y-5">
      <div>
        <h2 className="font-serif text-xl tracking-tight text-foreground">When can the team meet?</h2>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Find times that work for everyone, ranked by quality.
        </p>
      </div>

      {/* Controls */}
      <div className="flex flex-wrap items-end gap-3 rounded-2xl border border-border bg-card p-5">
        <label className="block text-xs font-medium text-foreground">
          Date
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="mt-1 h-10 rounded-lg border border-input bg-background px-3 text-sm focus:border-[#5B7FFF] focus:outline-none focus:ring-2 focus:ring-[#5B7FFF]/20"
          />
        </label>
        <label className="block text-xs font-medium text-foreground">
          Duration
          <select
            value={duration}
            onChange={(e) => setDuration(Number(e.target.value))}
            className="mt-1 h-10 rounded-lg border border-input bg-background px-3 text-sm focus:border-[#5B7FFF] focus:outline-none focus:ring-2 focus:ring-[#5B7FFF]/20"
          >
            {DURATIONS.map((d) => (
              <option key={d} value={d}>
                {d} min
              </option>
            ))}
          </select>
        </label>
        <Button
          onClick={() => findMut.mutate()}
          disabled={findMut.isPending}
          className="bg-[#5B7FFF] text-white hover:bg-[#5B7FFF]/90"
        >
          {findMut.isPending ? "Finding…" : "Find slots"}
        </Button>
      </div>

      {/* Results */}
      {findMut.isPending && (
        <div className="space-y-2">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-16 animate-pulse rounded-xl border border-border bg-card" />
          ))}
        </div>
      )}

      {!findMut.isPending && slots && slots.length === 0 && (
        <div className="rounded-2xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">
          No time available for all members on this day. Try another date or a shorter duration.
        </div>
      )}

      {!findMut.isPending && slots && slots.length > 0 && (
        <ul className="space-y-2">
          {slots.map((s, i) => {
            const dot = s.score >= 70 ? "#22C55E" : s.score >= 40 ? "#E9B949" : "#9CA3AF";
            return (
              <li
                key={s.start}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-3"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: dot }} />
                  <div>
                    <div className="text-sm font-medium text-foreground">{fmtSlot(s.start, s.end)}</div>
                    <div className="text-[11px] text-muted-foreground">
                      {s.free_count} of {s.total_count} free
                    </div>
                  </div>
                  {i === 0 && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-[#5B7FFF]/12 px-2 py-0.5 text-[10px] font-semibold text-[#5B7FFF]">
                      <Sparkles className="h-3 w-3" /> Recommended
                    </span>
                  )}
                </div>
                <Button
                  size="sm"
                  onClick={() => onSchedule(s)}
                  className="gap-1.5 bg-[#5B7FFF] text-white hover:bg-[#5B7FFF]/90"
                >
                  <CalendarPlus className="h-3.5 w-3.5" />
                  Schedule meeting
                </Button>
              </li>
            );
          })}
        </ul>
      )}

      {!findMut.isPending && slots === null && (
        <div className="rounded-2xl border border-dashed border-border bg-card/60 p-8 text-center text-sm text-muted-foreground">
          Pick a date and duration, then click <span className="font-medium text-foreground">Find slots</span>.
        </div>
      )}

      <p className="text-[11px] text-muted-foreground">
        Slots respect your team's Protected Hours from the previous tab.
      </p>
    </div>
  );
}
