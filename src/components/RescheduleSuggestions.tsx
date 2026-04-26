import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, Loader2, Minus } from "lucide-react";
import { api } from "@/api/client";
import { toast } from "@/hooks/useToast";
import type { CalendarEvent } from "@/api/types";

interface RescheduleSuggestionsProps {
  event: CalendarEvent;
  events: CalendarEvent[];
  workStart: string; // "HH:MM"
  workEnd: string; // "HH:MM"
  onMoved: () => void;
}

interface Slot {
  start: Date;
  end: Date;
  delta: number; // minutes of focus delta vs current
  splitsBlock: number | null; // minutes of block being split, or null
}

const STEP_MIN = 15;
const FOCUS_MIN = 60;

function parseHM(s: string): { h: number; m: number } {
  const [h, m] = s.split(":").map(Number);
  return { h: h || 0, m: m || 0 };
}
function setHM(d: Date, h: number, m: number) {
  const x = new Date(d);
  x.setHours(h, m, 0, 0);
  return x;
}
function addMin(d: Date, mins: number) {
  return new Date(d.getTime() + mins * 60_000);
}
function isWeekend(d: Date) {
  const day = d.getDay();
  return day === 0 || day === 6;
}
function sameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}
function fmtDateLabel(d: Date) {
  return d.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
}
function fmtTime(d: Date) {
  return d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", hour12: false });
}
function fmtDuration(mins: number) {
  const a = Math.abs(Math.round(mins));
  const h = Math.floor(a / 60);
  const m = a % 60;
  if (h && m) return `${h}h ${m}m`;
  if (h) return `${h}h`;
  return `${m}m`;
}

interface Busy {
  start: number;
  end: number;
}

/** Compute total focusable minutes (contiguous free spans ≥ FOCUS_MIN) within [winS, winE] given busy intervals (epoch ms). */
function focusMinutes(winS: number, winE: number, busy: Busy[]): number {
  if (winE <= winS) return 0;
  // Clamp & merge busy
  const clipped: Busy[] = [];
  for (const b of busy) {
    const s = Math.max(b.start, winS);
    const e = Math.min(b.end, winE);
    if (e > s) clipped.push({ start: s, end: e });
  }
  clipped.sort((a, b) => a.start - b.start);
  const merged: Busy[] = [];
  for (const b of clipped) {
    const last = merged[merged.length - 1];
    if (last && b.start <= last.end) {
      last.end = Math.max(last.end, b.end);
    } else {
      merged.push({ ...b });
    }
  }
  let total = 0;
  let cursor = winS;
  for (const b of merged) {
    const free = b.start - cursor;
    if (free >= FOCUS_MIN * 60_000) total += free;
    cursor = Math.max(cursor, b.end);
  }
  const tail = winE - cursor;
  if (tail >= FOCUS_MIN * 60_000) total += tail;
  return Math.round(total / 60_000);
}

export function RescheduleSuggestions({
  event,
  events,
  workStart,
  workEnd,
  onMoved,
}: RescheduleSuggestionsProps) {
  const qc = useQueryClient();
  const [movingIdx, setMovingIdx] = useState<number | null>(null);

  const { suggestions, currentDuration } = useMemo(() => {
    const evStart = new Date(event.start);
    const evEnd = new Date(event.end);
    const duration = Math.max(STEP_MIN, Math.round((evEnd.getTime() - evStart.getTime()) / 60_000));

    const ws = parseHM(workStart);
    const we = parseHM(workEnd);

    // Build busy list from all events EXCEPT the one being moved
    const allBusy: Busy[] = events
      .filter((e) => e.id !== event.id)
      .map((e) => ({ start: new Date(e.start).getTime(), end: new Date(e.end).getTime() }));

    // Compute current focus minutes across the next 5 business days (with the event in place)
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const businessDays: Date[] = [];
    const cursor = new Date(today);
    while (businessDays.length < 5) {
      if (!isWeekend(cursor)) businessDays.push(new Date(cursor));
      cursor.setDate(cursor.getDate() + 1);
    }

    const currentBusy: Busy[] = [...allBusy, { start: evStart.getTime(), end: evEnd.getTime() }];
    let currentFocus = 0;
    for (const day of businessDays) {
      const winS = setHM(day, ws.h, ws.m).getTime();
      const winE = setHM(day, we.h, we.m).getTime();
      currentFocus += focusMinutes(winS, winE, currentBusy);
    }

    const candidates: Slot[] = [];
    const now = new Date();
    for (const day of businessDays) {
      const winS = setHM(day, ws.h, ws.m);
      const winE = setHM(day, we.h, we.m);
      // Step in STEP_MIN increments
      for (let t = new Date(winS); addMin(t, duration) <= winE; t = addMin(t, STEP_MIN)) {
        const candStart = new Date(t);
        const candEnd = addMin(candStart, duration);
        if (candStart < now) continue;
        // Skip the current slot
        if (sameDay(candStart, evStart) && candStart.getTime() === evStart.getTime()) continue;

        // Check no overlap with busy
        const cS = candStart.getTime();
        const cE = candEnd.getTime();
        let overlaps = false;
        let splitsBlock: number | null = null;
        for (const b of allBusy) {
          if (b.start < cE && b.end > cS) {
            overlaps = true;
            break;
          }
        }
        if (overlaps) continue;

        // Detect "splits a block": a contiguous free span on this day >= 2*FOCUS_MIN that would be split by this candidate
        const dayBusySorted = allBusy
          .filter((b) => b.end > winS.getTime() && b.start < winE.getTime())
          .sort((a, b) => a.start - b.start);
        // Find the free span containing candidate
        let spanStart = winS.getTime();
        let spanEnd = winE.getTime();
        for (const b of dayBusySorted) {
          if (b.end <= cS) spanStart = Math.max(spanStart, b.end);
          else if (b.start >= cE) {
            spanEnd = Math.min(spanEnd, b.start);
            break;
          }
        }
        const spanLen = Math.round((spanEnd - spanStart) / 60_000);
        // Splits: leftover left & right both still ≥ FOCUS_MIN, and the original span was ≥ 2 * FOCUS_MIN
        const leftLen = Math.round((cS - spanStart) / 60_000);
        const rightLen = Math.round((spanEnd - cE) / 60_000);
        if (spanLen >= 2 * FOCUS_MIN && leftLen >= FOCUS_MIN && rightLen >= FOCUS_MIN) {
          splitsBlock = spanLen;
        }

        // Compute candidate focus across all 5 days with this move applied
        const candBusy: Busy[] = [...allBusy, { start: cS, end: cE }];
        let candFocus = 0;
        for (const day2 of businessDays) {
          const wS = setHM(day2, ws.h, ws.m).getTime();
          const wE = setHM(day2, we.h, we.m).getTime();
          candFocus += focusMinutes(wS, wE, candBusy);
        }

        candidates.push({
          start: candStart,
          end: candEnd,
          delta: candFocus - currentFocus,
          splitsBlock,
        });
      }
    }

    candidates.sort((a, b) => b.delta - a.delta);
    return { suggestions: candidates.slice(0, 4), currentDuration: duration };
  }, [event, events, workStart, workEnd]);

  const move = async (slot: Slot, idx: number) => {
    setMovingIdx(idx);
    try {
      await api.updateEvent(
        event.id,
        { start: slot.start.toISOString(), end: slot.end.toISOString() },
        "none",
      );
      toast.success("Event rescheduled");
      qc.invalidateQueries({ queryKey: ["events"] });
      onMoved();
    } catch {
      toast.error("Failed to reschedule");
    } finally {
      setMovingIdx(null);
    }
  };

  if (suggestions.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-border bg-muted/20 px-3 py-3 text-xs text-muted-foreground">
        No open slots in the next 5 days — try compressing your schedule.
      </p>
    );
  }

  return (
    <ul className="space-y-2">
      {suggestions.map((slot, i) => {
        const positive = slot.delta > 0;
        const negative = slot.delta < 0;
        const Icon = positive ? ArrowUp : negative ? ArrowDown : Minus;
        const colorCls = positive
          ? "text-success"
          : negative
            ? "text-warning"
            : "text-muted-foreground";
        const label = positive
          ? `+${fmtDuration(slot.delta)} more focus`
          : negative
            ? `−${fmtDuration(slot.delta)} focus lost`
            : "No focus change";
        return (
          <li
            key={`${slot.start.toISOString()}-${i}`}
            className="flex items-center justify-between gap-3 rounded-lg border border-border bg-background px-3 py-2"
          >
            <div className="min-w-0 flex-shrink-0">
              <p className="text-xs font-semibold text-foreground">
                {fmtDateLabel(slot.start)} · {fmtTime(slot.start)}
              </p>
              <p className="text-[11px] text-muted-foreground">{currentDuration} min</p>
            </div>
            <div className="flex min-w-0 flex-1 items-center gap-2">
              <span className={`flex items-center gap-1 text-xs font-medium ${colorCls}`}>
                <Icon className="h-3 w-3" />
                <span className="truncate">{label}</span>
              </span>
              {slot.splitsBlock != null && (
                <span className="rounded-full bg-warning/10 px-2 py-0.5 text-[10px] font-medium text-warning">
                  Splits {fmtDuration(slot.splitsBlock)} block
                </span>
              )}
            </div>
            <button
              type="button"
              onClick={() => move(slot, i)}
              disabled={movingIdx !== null}
              className="flex flex-shrink-0 items-center gap-1 rounded-md bg-primary px-2.5 py-1 text-xs font-semibold text-primary-foreground transition hover:bg-primary/90 disabled:opacity-50"
            >
              {movingIdx === i ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
              Move here
            </button>
          </li>
        );
      })}
    </ul>
  );
}
