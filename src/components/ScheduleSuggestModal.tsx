import { useCallback, useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Calendar, Clock, Loader2, Search, Sparkles, Users, X } from "lucide-react";
import { api, apiErrorMessage } from "@/api/client";
import { toast } from "@/hooks/useToast";
import { useAuth } from "@/contexts/useAuth";
import { SlotCoverageNote } from "@/components/SlotCoverageNote";
import type { SuggestedSlot } from "@/api/types";

interface Props {
  defaultRangeStart: string; // ISO
  defaultRangeEnd: string;   // ISO
  onClose: () => void;
}

const DURATIONS = [15, 30, 45, 60, 90];

function pad(n: number) {
  return n < 10 ? `0${n}` : `${n}`;
}
function toLocalInput(d: Date) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function fromLocalInput(s: string) {
  // s like "2025-04-26T09:00"
  return new Date(s);
}
function fmtDay(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, {
    weekday: "long",
    month: "short",
    day: "numeric",
  });
}
function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

export function ScheduleSuggestModal({ defaultRangeStart, defaultRangeEnd, onClose }: Props) {
  const qc = useQueryClient();
  const { isDemo } = useAuth();

  const [title, setTitle] = useState("");
  const [duration, setDuration] = useState<number>(30);
  const [attendeesInput, setAttendeesInput] = useState("");
  const [rangeStart, setRangeStart] = useState<string>(() =>
    toLocalInput(new Date(defaultRangeStart)),
  );
  const [rangeEnd, setRangeEnd] = useState<string>(() =>
    toLocalInput(new Date(defaultRangeEnd)),
  );

  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);
  const [slots, setSlots] = useState<SuggestedSlot[]>([]);
  const [selected, setSelected] = useState<number>(0);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const attendees = useMemo(
    () =>
      attendeesInput
        .split(/[,\s]+/)
        .map((s) => s.trim())
        .filter(Boolean),
    [attendeesInput],
  );

  // Close on Escape
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !applying) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [applying, onClose]);

  const findSlots = useCallback(async () => {
    setError(null);
    if (!title.trim()) {
      setError("Add a meeting title.");
      return;
    }
    const start = fromLocalInput(rangeStart);
    const end = fromLocalInput(rangeEnd);
    if (!(start < end)) {
      setError("Range end must be after start.");
      return;
    }
    setSearching(true);
    try {
      const res = await api.scheduleSuggest({
        title: title.trim(),
        duration_minutes: duration,
        attendees,
        range_start: start.toISOString(),
        range_end: end.toISOString(),
      });
      setSlots(res.slots);
      setSelected(0);
      setSearched(true);
    } catch (e) {
      setError(apiErrorMessage(e));
    } finally {
      setSearching(false);
    }
  }, [attendees, duration, rangeEnd, rangeStart, title]);

  const apply = useCallback(async () => {
    const slot = slots[selected];
    if (!slot) return;
    setApplying(true);
    try {
      const ev = await api.scheduleCreate({
        title: title.trim(),
        start: slot.start,
        end: slot.end,
        attendees,
      });
      toast.success(`Scheduled "${ev.title}"`);
      if (isDemo) toast.info("Changes are local — connect the backend to save them.");
      qc.invalidateQueries({ queryKey: ["events"] });
      onClose();
    } catch (e) {
      toast.error(apiErrorMessage(e));
    } finally {
      setApplying(false);
    }
  }, [attendees, isDemo, onClose, qc, selected, slots, title]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={() => !applying && onClose()}
    >
      <div
        className="w-full max-w-2xl overflow-hidden rounded-2xl bg-card shadow-xl ring-1 ring-border"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between border-b border-border p-5">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            <div>
              <h2 className="text-base font-semibold tracking-tight">Schedule meeting</h2>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Preview AI-suggested slots, then pick one to apply.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-md p-1 text-muted-foreground transition hover:bg-muted hover:text-foreground"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Form */}
        <div className="space-y-3 border-b border-border p-5">
          <div>
            <label className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              Title
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Design review with Sarah"
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                Duration
              </label>
              <div className="flex flex-wrap gap-1.5">
                {DURATIONS.map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => setDuration(d)}
                    className={`rounded-md border px-2.5 py-1 text-xs font-medium transition ${
                      duration === d
                        ? "border-primary bg-primary-muted text-primary"
                        : "border-border bg-background text-foreground hover:border-primary/40"
                    }`}
                  >
                    {d}m
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                Attendees
              </label>
              <input
                type="text"
                value={attendeesInput}
                onChange={(e) => setAttendeesInput(e.target.value)}
                placeholder="sarah@acme.com, alex@acme.com"
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                Search from
              </label>
              <input
                type="datetime-local"
                value={rangeStart}
                onChange={(e) => setRangeStart(e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
              />
            </div>
            <div>
              <label className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                Search until
              </label>
              <input
                type="datetime-local"
                value={rangeEnd}
                onChange={(e) => setRangeEnd(e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
              />
            </div>
          </div>

          {error && (
            <p className="rounded-md bg-destructive/10 px-3 py-2 text-xs font-medium text-destructive">
              {error}
            </p>
          )}

          <div>
            <button
              onClick={findSlots}
              disabled={searching}
              className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90 disabled:opacity-50"
            >
              {searching ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Search className="h-3.5 w-3.5" />
              )}
              {searched ? "Refresh suggestions" : "Find slots"}
            </button>
          </div>
        </div>

        {/* Results */}
        <div className="max-h-[40vh] space-y-2 overflow-y-auto p-5">
          {!searched && !searching && (
            <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
              Set a title and duration, then find slots to preview suggestions.
            </p>
          )}
          {searching && (
            <div className="flex items-center justify-center gap-2 p-8 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Finding the best times…
            </div>
          )}
          {searched && !searching && slots.length === 0 && (
            <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
              No slots found in this range. Try widening the window or shortening the meeting.
            </p>
          )}
          {!searching &&
            slots.map((s, i) => {
              const active = selected === i;
              return (
                <button
                  key={`${s.start}-${i}`}
                  onClick={() => setSelected(i)}
                  className={`w-full rounded-xl border p-3 text-left transition ${
                    active
                      ? "border-primary bg-primary-muted ring-2 ring-primary/20"
                      : "border-border bg-background hover:border-primary/40"
                  }`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
                        <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                        {fmtDay(s.start)}
                      </p>
                      <p className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                        <Clock className="h-3 w-3" />
                        {fmtTime(s.start)} – {fmtTime(s.end)}
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                        Score
                      </span>
                      <div className="h-1.5 w-20 overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full rounded-full bg-primary"
                          style={{ width: `${Math.round(s.score * 100)}%` }}
                        />
                      </div>
                    </div>
                  </div>
                  {!!s.reasons?.length && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {s.reasons.map((r) => (
                        <span
                          key={r}
                          className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground"
                        >
                          {r}
                        </span>
                      ))}
                    </div>
                  )}
                  <SlotCoverageNote coverage={s.coverage} className="mt-2" />
                </button>
              );
            })}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-2 border-t border-border p-4">
          <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
            {!!attendees.length && (
              <>
                <Users className="h-3 w-3" />
                <span className="truncate">{attendees.join(", ")}</span>
              </>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              disabled={applying}
              className="rounded-lg px-3 py-1.5 text-sm font-medium text-muted-foreground transition hover:bg-muted hover:text-foreground disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              onClick={apply}
              disabled={applying || slots.length === 0 || !searched}
              className="flex items-center gap-1.5 rounded-lg bg-primary px-4 py-1.5 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90 disabled:opacity-50"
            >
              {applying && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Apply slot
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
