import { useEffect, useRef, useState } from "react";
import { Loader2, X } from "lucide-react";

export interface QuickCreatePopoverProps {
  /** Anchor position in viewport coordinates (px) */
  anchor: { x: number; y: number };
  start: Date;
  end: Date;
  saving?: boolean;
  onClose: () => void;
  onSave: (title: string) => void;
  onMoreOptions: (title: string) => void;
}

function formatRange(start: Date, end: Date) {
  const sameDay = start.toDateString() === end.toDateString();
  const dayLabel = start.toLocaleDateString(undefined, {
    weekday: "long",
    month: "short",
    day: "numeric",
  });
  const timeOpts: Intl.DateTimeFormatOptions = { hour: "numeric", minute: "2-digit" };
  const startTime = start.toLocaleTimeString(undefined, timeOpts);
  const endTime = end.toLocaleTimeString(undefined, timeOpts);
  if (sameDay) return `${dayLabel} · ${startTime} – ${endTime}`;
  return `${dayLabel} ${startTime} – ${end.toLocaleDateString(undefined, { month: "short", day: "numeric" })} ${endTime}`;
}

const POPOVER_WIDTH = 320;
const POPOVER_EST_HEIGHT = 200;

export function QuickCreatePopover({
  anchor,
  start,
  end,
  saving = false,
  onClose,
  onSave,
  onMoreOptions,
}: QuickCreatePopoverProps) {
  const [title, setTitle] = useState("");
  const ref = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

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
    // Defer to avoid catching the originating click
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

  const submit = () => {
    if (!title.trim() || saving) return;
    onSave(title.trim());
  };

  return (
    <div
      ref={ref}
      role="dialog"
      aria-label="Quick create event"
      className="fixed z-50 w-80 rounded-xl border border-border bg-card shadow-xl ring-1 ring-black/5 animate-in fade-in zoom-in-95"
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
        <p className="text-xs text-muted-foreground">{formatRange(start, end)}</p>

        <div className="flex items-center justify-between gap-2 pt-1">
          <button
            type="button"
            onClick={() => onMoreOptions(title.trim())}
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
