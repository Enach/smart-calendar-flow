import { useEffect, useMemo, useRef, useState } from "react";
import { Loader2, Minus, Plus, Sparkles, X } from "lucide-react";

export interface QuickCreatePopoverProps {
  /** Anchor position in viewport coordinates (px) */
  anchor: { x: number; y: number };
  start: Date;
  end: Date;
  saving?: boolean;
  onClose: () => void;
  /** Called with the chosen title and final end time (after duration adjustments) */
  onSave: (title: string, end: Date) => void;
  /** Called with the current title and final end time */
  onMoreOptions: (title: string, end: Date) => void;
}

const TITLE_SUGGESTIONS = [
  "Focus time",
  "1:1",
  "Team sync",
  "Coffee chat",
  "Design review",
  "Planning",
  "Interview",
  "Project check-in",
];

const DURATION_PRESETS_MIN = [15, 30, 45, 60, 90];
const MIN_DURATION = 15;
const MAX_DURATION = 8 * 60; // 8h

function formatDateLabel(d: Date) {
  return d.toLocaleDateString(undefined, {
    weekday: "long",
    month: "short",
    day: "numeric",
  });
}
function formatTime(d: Date) {
  return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}
function formatDuration(min: number) {
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

const POPOVER_WIDTH = 340;
const POPOVER_EST_HEIGHT = 280;

export function QuickCreatePopover({
  anchor,
  start,
  end,
  saving = false,
  onClose,
  onSave,
  onMoreOptions,
}: QuickCreatePopoverProps) {
  const initialDuration = useMemo(
    () => Math.max(MIN_DURATION, Math.round((end.getTime() - start.getTime()) / 60000)),
    [start, end],
  );
  const [title, setTitle] = useState("");
  const [duration, setDuration] = useState(initialDuration);
  const ref = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Filter suggestions based on what's typed
  const suggestions = useMemo(() => {
    const q = title.trim().toLowerCase();
    if (!q) return TITLE_SUGGESTIONS.slice(0, 4);
    const filtered = TITLE_SUGGESTIONS.filter(
      (s) => s.toLowerCase().includes(q) && s.toLowerCase() !== q,
    );
    return filtered.slice(0, 4);
  }, [title]);

  // Computed end based on duration
  const computedEnd = useMemo(
    () => new Date(start.getTime() + duration * 60_000),
    [start, duration],
  );

  // Autofocus title
  useEffect(() => {
    const t = window.setTimeout(() => inputRef.current?.focus(), 30);
    return () => window.clearTimeout(t);
  }, []);

  // Close on outside click / escape
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    const onDown = (e: MouseEvent) => {
      if (!ref.current) return;
      if (!ref.current.contains(e.target as Node)) onClose();
    };
    window.addEventListener("keydown", onKey);
    const t = window.setTimeout(() => window.addEventListener("mousedown", onDown), 0);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mousedown", onDown);
      window.clearTimeout(t);
    };
  }, [onClose]);

  // Clamp position within viewport
  const vw = typeof window !== "undefined" ? window.innerWidth : 1200;
  const vh = typeof window !== "undefined" ? window.innerHeight : 800;
  const left = Math.min(Math.max(8, anchor.x - POPOVER_WIDTH / 2), vw - POPOVER_WIDTH - 8);
  const top = Math.min(Math.max(8, anchor.y + 12), vh - POPOVER_EST_HEIGHT - 8);

  const adjust = (delta: number) =>
    setDuration((d) => Math.min(MAX_DURATION, Math.max(MIN_DURATION, d + delta)));

  const submit = () => {
    if (!title.trim() || saving) return;
    onSave(title.trim(), computedEnd);
  };

  return (
    <div
      ref={ref}
      role="dialog"
      aria-label="Quick create event"
      className="fixed z-50 w-[340px] rounded-xl border border-border bg-card shadow-xl ring-1 ring-black/5 animate-in fade-in zoom-in-95"
      style={{ left, top }}
    >
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          New event
        </p>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="rounded-md p-1 text-muted-foreground transition hover:bg-muted hover:text-foreground"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="space-y-3 p-3">
        {/* Title input */}
        <div>
          <input
            ref={inputRef}
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                submit();
              }
            }}
            placeholder="Add title"
            className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
          />
          {suggestions.length > 0 && (
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <Sparkles className="h-3 w-3 text-muted-foreground" aria-hidden="true" />
              {suggestions.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => {
                    setTitle(s);
                    inputRef.current?.focus();
                  }}
                  className="rounded-full border border-border bg-background px-2 py-0.5 text-[11px] font-medium text-muted-foreground transition hover:border-primary hover:bg-primary/5 hover:text-primary"
                >
                  {s}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Date + duration */}
        <div className="rounded-lg border border-border bg-muted/30 px-3 py-2">
          <p className="text-xs font-medium text-foreground">{formatDateLabel(start)}</p>
          <p className="text-[11px] text-muted-foreground">
            {formatTime(start)} – {formatTime(computedEnd)} · {formatDuration(duration)}
          </p>
        </div>

        {/* Duration adjuster */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              Duration
            </span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => adjust(-15)}
                disabled={saving || duration <= MIN_DURATION}
                aria-label="Decrease duration by 15 minutes"
                className="rounded-md border border-border bg-background p-1 text-muted-foreground transition hover:border-primary hover:text-primary disabled:opacity-40"
              >
                <Minus className="h-3 w-3" />
              </button>
              <span className="min-w-[52px] text-center text-xs font-semibold tabular-nums text-foreground">
                {formatDuration(duration)}
              </span>
              <button
                type="button"
                onClick={() => adjust(15)}
                disabled={saving || duration >= MAX_DURATION}
                aria-label="Increase duration by 15 minutes"
                className="rounded-md border border-border bg-background p-1 text-muted-foreground transition hover:border-primary hover:text-primary disabled:opacity-40"
              >
                <Plus className="h-3 w-3" />
              </button>
            </div>
          </div>
          <div className="flex flex-wrap gap-1">
            {DURATION_PRESETS_MIN.map((m) => {
              const active = duration === m;
              return (
                <button
                  key={m}
                  type="button"
                  onClick={() => setDuration(m)}
                  disabled={saving}
                  className={
                    "rounded-md px-2 py-1 text-[11px] font-medium transition disabled:opacity-50 " +
                    (active
                      ? "bg-primary text-primary-foreground"
                      : "border border-border bg-background text-muted-foreground hover:border-primary hover:text-primary")
                  }
                >
                  {formatDuration(m)}
                </button>
              );
            })}
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-between gap-2 pt-1">
          <button
            type="button"
            onClick={() => onMoreOptions(title.trim(), computedEnd)}
            disabled={saving}
            className="rounded-md px-2 py-1.5 text-xs font-medium text-muted-foreground transition hover:bg-muted hover:text-foreground disabled:opacity-50"
          >
            More options
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={!title.trim() || saving}
            className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground transition hover:bg-primary/90 disabled:opacity-50"
          >
            {saving && <Loader2 className="h-3 w-3 animate-spin" />}
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
