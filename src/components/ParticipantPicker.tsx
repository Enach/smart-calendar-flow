import { useEffect, useRef, useState } from "react";
import { Loader2, X, UserPlus, Check, Clock as ClockIcon, AlertCircle } from "lucide-react";
import { api } from "@/api/client";
import type { Attendee, RsvpStatus } from "@/api/types";

const inputCls =
  "h-9 w-full rounded-lg border border-input bg-background px-3 text-sm text-foreground transition placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20";

const EMAIL_RE = /^[\w.+-]+@[\w-]+\.[\w.-]+$/;

function initials(input: string) {
  const parts = input
    .replace(/@.*/, "")
    .split(/[.\s_-]+/)
    .filter(Boolean);
  return ((parts[0]?.[0] ?? "?") + (parts[1]?.[0] ?? "")).toUpperCase();
}

const RSVP_META: Record<RsvpStatus, { label: string; cls: string; icon?: React.ComponentType<{ className?: string }> }> = {
  accepted: { label: "Accepted", cls: "bg-success/10 text-success", icon: Check },
  declined: { label: "Declined", cls: "bg-destructive/10 text-destructive", icon: X },
  tentative: { label: "Tentative", cls: "bg-warning/10 text-warning", icon: AlertCircle },
  pending: { label: "Pending", cls: "bg-muted text-muted-foreground", icon: ClockIcon },
};

interface ParticipantPickerProps {
  participants: Attendee[];
  onChange: (next: Attendee[]) => void;
}

export function ParticipantPicker({ participants, onChange }: ParticipantPickerProps) {
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<Attendee[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef<number | null>(null);

  useEffect(() => {
    if (!open) return;
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(async () => {
      setLoading(true);
      try {
        const rs = await api.suggestAttendees(query);
        const existing = new Set(participants.map((p) => p.email.toLowerCase()));
        setSuggestions(rs.filter((s) => !existing.has(s.email.toLowerCase())));
      } finally {
        setLoading(false);
      }
    }, 300);
    return () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
    };
  }, [query, open, participants]);

  const add = (a: Attendee) => {
    if (participants.some((p) => p.email.toLowerCase() === a.email.toLowerCase())) return;
    onChange([...participants, { rsvp: "pending", ...a }]);
    setQuery("");
  };

  const remove = (email: string) => {
    onChange(participants.filter((p) => p.email.toLowerCase() !== email.toLowerCase()));
  };

  const handleKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      const v = query.trim();
      if (EMAIL_RE.test(v)) {
        add({ email: v, rsvp: "pending" });
      }
    } else if (e.key === "Backspace" && !query && participants.length) {
      remove(participants[participants.length - 1].email);
    }
  };

  return (
    <div className="space-y-2">
      {participants.length > 0 && (
        <ul className="flex flex-wrap gap-1.5">
          {participants.map((p) => {
            const meta = RSVP_META[p.rsvp ?? "pending"];
            const Icon = meta.icon;
            return (
              <li
                key={p.email}
                className="flex items-center gap-1.5 rounded-full border border-border bg-card py-1 pl-1 pr-1.5 text-xs"
              >
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary/10 text-[10px] font-semibold text-primary">
                  {initials(p.name || p.email)}
                </span>
                <span className="font-medium text-foreground">{p.name || p.email.split("@")[0]}</span>
                <span className="text-muted-foreground">·</span>
                <span className="truncate text-muted-foreground" title={p.email}>
                  {p.email}
                </span>
                <span className={`flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${meta.cls}`}>
                  {Icon && <Icon className="h-2.5 w-2.5" />}
                  {meta.label}
                </span>
                <button
                  type="button"
                  onClick={() => remove(p.email)}
                  className="ml-0.5 rounded-full p-0.5 text-muted-foreground transition hover:bg-muted hover:text-foreground"
                  aria-label={`Remove ${p.email}`}
                >
                  <X className="h-3 w-3" />
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <div className="relative">
        <UserPlus className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => setOpen(true)}
          onBlur={() => window.setTimeout(() => setOpen(false), 150)}
          onKeyDown={handleKey}
          placeholder="Add participant by name or email…"
          className={`${inputCls} pl-8`}
        />
        {loading && (
          <Loader2 className="absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 animate-spin text-muted-foreground" />
        )}

        {open && (suggestions.length > 0 || query) && (
          <ul className="absolute z-10 mt-1 max-h-56 w-full overflow-auto rounded-lg border border-border bg-card shadow-lg">
            {suggestions.map((s) => (
              <li key={s.email}>
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => add(s)}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left transition hover:bg-muted/50"
                >
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-[10px] font-semibold text-primary">
                    {initials(s.name || s.email)}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-foreground">{s.name || s.email.split("@")[0]}</p>
                    <p className="truncate text-[11px] text-muted-foreground">{s.email}</p>
                  </div>
                </button>
              </li>
            ))}
            {suggestions.length === 0 && query && (
              <li className="px-3 py-2 text-[11px] text-muted-foreground">
                {EMAIL_RE.test(query.trim())
                  ? "Press Enter to add this email"
                  : "No matches. Type a full email to add manually."}
              </li>
            )}
          </ul>
        )}
      </div>
    </div>
  );
}
