import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowRight, ChevronDown, ChevronUp, Loader2, Minus, TrendingDown, TrendingUp } from "lucide-react";
import { api } from "@/api/client";
import { toast } from "@/hooks/useToast";
import type { CalendarEvent } from "@/api/types";

interface Props {
  event: CalendarEvent;
  events: CalendarEvent[];
  workStart: string; // "HH:MM"
  workEnd: string;   // "HH:MM"
  onMoved: () => void;
}

interface Slot {
  start: Date;
  end: Date;
  focusDelta: number;       // candidate − current focus minutes
  splitsLargeBlock: boolean;
  splitBlockMinutes: number;
}

const FOCUS_MIN_MINUTES = 60;
const LARGE_BLOCK_MINUTES = 120;
const STEP_MINUTES = 15;

function parseHM(hm: string): { h: number; m: number } {
  const [h, m] = hm.split(":").map(Number);
  return { h: h || 0, m: m || 0 };
}
function setHM(d: Date, h: number, m: number) {
  const x = new Date(d);
  x.setHours(h, m, 0, 0);
  return x;
}
function isBusinessDay(d: Date) {
  const day = d.getDay();
  return day >= 1 && day <= 5;
}
function startOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}
function addDays(d: Date, n: number) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}
function overlaps(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date) {
  return aStart < bEnd && bStart < aEnd;
}

/**
 * Sum of focus minutes for a single business day:
 * Each maximal contiguous gap inside [workStart, workEnd] with no meetings
 * counts as focus if its length >= FOCUS_MIN_MINUTES. Sum those gap lengths.
 */
function focusMinutesForDay(
  day: Date,
  blocking: { start: Date; end: Date }[],
  workStart: string,
  workEnd: string,
): number {
  if (!isBusinessDay(day)) return 0;
  const { h: ws, m: wsm } = parseHM(workStart);
  const { h: we, m: wem } = parseHM(workEnd);
  const dayStart = setHM(day, ws, wsm);
  const dayEnd = setHM(day, we, wem);

  // Clip and sort blocks within the work window
  const blocks = blocking
    .map((b) => ({
      start: b.start < dayStart ? dayStart : b.start,
      end: b.end > dayEnd ? dayEnd : b.end,
    }))
    .filter((b) => b.start < b.end && b.end > dayStart && b.start < dayEnd)
    .sort((a, b) => a.start.getTime() - b.start.getTime());

  // Merge overlapping
  const merged: { start: Date; end: Date }[] = [];
  for (const b of blocks) {
    const last = merged[merged.length - 1];
    if (last && b.start <= last.end) {
      if (b.end > last.end) last.end = b.end;
    } else {
      merged.push({ ...b });
    }
  }

  let total = 0;
  let cursor = dayStart;
  for (const b of merged) {
    const gap = (b.start.getTime() - cursor.getTime()) / 60000;
    if (gap >= FOCUS_MIN_MINUTES) total += gap;
    cursor = b.end > cursor ? b.end : cursor;
  }
  const trailingGap = (dayEnd.getTime() - cursor.getTime()) / 60000;
  if (trailingGap >= FOCUS_MIN_MINUTES) total += trailingGap;
  return total;
}

function fmtDeltaMinutes(min: number): string {
  const abs = Math.abs(Math.round(min));
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  if (h && m) return `${h}h ${m}m`;
  if (h) return `${h}h`;
  return `${m}m`;
}

function fmtSlotLabel(d: Date) {
  const day = d.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
  const time = d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  return `${day} · ${time}`;
}

export function RescheduleSuggestions({ event, events, workStart, workEnd, onMoved }: Props) {
  const qc = useQueryClient();
  const [expanded, setExpanded] = useState(true);
  const [movingKey, setMovingKey] = useState<string | null>(null);

  const slots = useMemo<Slot[]>(() => {
    const evStart = new Date(event.start);
    const evEnd = new Date(event.end);
    const durationMs = evEnd.getTime() - evStart.getTime();
    const durationMin = durationMs / 60000;
    if (durationMin <= 0) return [];

    // Blocking events = everything that occupies time on the calendar.
    // Personal blocks block focus too. We exclude the event being rescheduled.
    const others = events.filter((e) => e.id !== event.id);
    const allBlocks = others.map((e) => ({ start: new Date(e.start), end: new Date(e.end) }));

    // Today (origin day) + 5 business days forward
    const today = startOfDay(new Date());

    const businessDays: Date[] = [];
    let d = today;
    while (businessDays.length < 5) {
      if (isBusinessDay(d)) businessDays.push(d);
      d = addDays(d, 1);
      if (businessDays.length === 0 && d.getTime() - today.getTime() > 14 * 86400000) break;
    }

    // Current focus baseline = sum of focus across the days that include the *current* event.
    // We compare per-candidate-day to that same day's focus; for the candidate slot day,
    // recompute focus excluding current event slot (already excluded) and including the candidate.
    const currentFocusByDay = new Map<string, number>();
    for (const day of businessDays) {
      currentFocusByDay.set(day.toDateString(), focusMinutesForDay(day, allBlocks, workStart, workEnd));
    }

    const candidates: Slot[] = [];

    for (const day of businessDays) {
      const { h: ws, m: wsm } = parseHM(workStart);
      const { h: we, m: wem } = parseHM(workEnd);
      const dayStart = setHM(day, ws, wsm);
      const dayEnd = setHM(day, we, wem);

      // Skip past times if it's today
      const now = new Date();
      const minStart = day.toDateString() === now.toDateString() && now > dayStart ? now : dayStart;

      // Step over the day in 15-min increments
      for (let t = new Date(minStart); t.getTime() + durationMs <= dayEnd.getTime(); t = new Date(t.getTime() + STEP_MINUTES * 60000)) {
        const candStart = new Date(t);
        const candEnd = new Date(t.getTime() + durationMs);

        // Exclude the current slot itself
        if (candStart.getTime() === evStart.getTime()) continue;

        // Must be free of all other events
        const conflict = allBlocks.some((b) => overlaps(candStart, candEnd, b.start, b.end));
        if (conflict) continue;

        // Compute focus for this candidate day with the candidate inserted
        const candDayFocus = focusMinutesForDay(
          day,
          [...allBlocks, { start: candStart, end: candEnd }],
          workStart,
          workEnd,
        );
        const baseline = currentFocusByDay.get(day.toDateString()) ?? 0;
        const focusDelta = candDayFocus - baseline;

        // Detect if this candidate splits a contiguous free block ≥ 2h
        let splitsLargeBlock = false;
        let splitBlockMinutes = 0;
        // Find the gap containing this candidate
        const blocksOnDay = allBlocks
          .map((b) => ({
            start: b.start < dayStart ? dayStart : b.start,
            end: b.end > dayEnd ? dayEnd : b.end,
          }))
          .filter((b) => b.start < b.end && b.end > dayStart && b.start < dayEnd)
          .sort((a, b) => a.start.getTime() - b.start.getTime());

        let gapStart = dayStart;
        for (const b of blocksOnDay) {
          if (candStart >= gapStart && candEnd <= b.start) {
            const gapMin = (b.start.getTime() - gapStart.getTime()) / 60000;
            const candMin = durationMin;
            if (gapMin >= LARGE_BLOCK_MINUTES && gapMin - candMin < FOCUS_MIN_MINUTES * 2 ? false : (gapMin >= LARGE_BLOCK_MINUTES && (candStart.getTime() - gapStart.getTime()) / 60000 > 0 && (b.start.getTime() - candEnd.getTime()) / 60000 > 0)) {
              splitsLargeBlock = true;
              splitBlockMinutes = gapMin;
            }
            break;
          }
          gapStart = b.end > gapStart ? b.end : gapStart;
        }
        if (!splitsLargeBlock && candEnd <= dayEnd && candStart >= gapStart) {
          const gapMin = (dayEnd.getTime() - gapStart.getTime()) / 60000;
          if (gapMin >= LARGE_BLOCK_MINUTES && (candStart.getTime() - gapStart.getTime()) / 60000 > 0 && (dayEnd.getTime() - candEnd.getTime()) / 60000 > 0) {
            splitsLargeBlock = true;
            splitBlockMinutes = gapMin;
          }
        }

        candidates.push({ start: candStart, end: candEnd, focusDelta, splitsLargeBlock, splitBlockMinutes });
      }
    }

    candidates.sort((a, b) => b.focusDelta - a.focusDelta || a.start.getTime() - b.start.getTime());
    return candidates.slice(0, 4);
  }, [event, events, workStart, workEnd]);

  const move = async (slot: Slot) => {
    const key = slot.start.toISOString();
    setMovingKey(key);
    try {
      await api.updateEvent(
        event.id,
        { start: slot.start.toISOString(), end: slot.end.toISOString() },
        "none",
      );
      toast.success("Event moved");
      qc.invalidateQueries({ queryKey: ["events"] });
      qc.invalidateQueries({ queryKey: ["focusBlocks"] });
      onMoved();
    } catch {
      toast.error("Failed to move event");
    } finally {
      setMovingKey(null);
    }
  };

  return (
    <div className="rounded-xl border border-border bg-muted/30">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left"
      >
        <div>
          <h3 className="text-sm font-semibold text-foreground">Reschedule</h3>
          <p className="text-[11px] text-muted-foreground">Smart suggestions to protect your focus time.</p>
        </div>
        {expanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
      </button>
      {expanded && (
        <div className="space-y-2 border-t border-border px-3 pb-3 pt-3">
          {slots.length === 0 ? (
            <p className="px-2 py-6 text-center text-xs text-muted-foreground">
              No open slots in the next 5 days — try compressing your schedule.
            </p>
          ) : (
            slots.map((s) => {
              const key = s.start.toISOString();
              const isMoving = movingKey === key;
              const positive = s.focusDelta >= FOCUS_MIN_MINUTES;
              const negative = s.focusDelta <= -FOCUS_MIN_MINUTES;
              const neutral = !positive && !negative;
              return (
                <div
                  key={key}
                  className="flex items-center gap-3 rounded-lg border border-border bg-card px-3 py-2 transition hover:border-primary/40 hover:shadow-sm"
                >
                  <div className="min-w-[120px] text-xs font-medium text-foreground">
                    {fmtSlotLabel(s.start)}
                  </div>
                  <div className="flex flex-1 flex-wrap items-center gap-2">
                    {positive && (
                      <span className="inline-flex items-center gap-1 rounded-md bg-success/10 px-1.5 py-0.5 text-[11px] font-medium text-success">
                        <TrendingUp className="h-3 w-3" />
                        +{fmtDeltaMinutes(s.focusDelta)} focus
                      </span>
                    )}
                    {neutral && (
                      <span className="inline-flex items-center gap-1 rounded-md bg-muted px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground">
                        <Minus className="h-3 w-3" />
                        No focus change
                      </span>
                    )}
                    {negative && (
                      <span className="inline-flex items-center gap-1 rounded-md bg-warning/10 px-1.5 py-0.5 text-[11px] font-medium text-warning">
                        <TrendingDown className="h-3 w-3" />
                        −{fmtDeltaMinutes(s.focusDelta)} focus
                      </span>
                    )}
                    {s.splitsLargeBlock && (
                      <span className="inline-flex items-center rounded-md border border-border bg-background px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground">
                        Splits {Math.round(s.splitBlockMinutes / 60)}h block
                      </span>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => move(s)}
                    disabled={isMoving}
                    className="flex shrink-0 items-center gap-1 rounded-md bg-primary px-2 py-1 text-[11px] font-semibold text-primary-foreground transition hover:bg-primary/90 disabled:opacity-50"
                  >
                    {isMoving ? <Loader2 className="h-3 w-3 animate-spin" /> : <ArrowRight className="h-3 w-3" />}
                    Move here
                  </button>
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
