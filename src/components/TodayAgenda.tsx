import type { CalendarEvent } from "@/api/types";
import { CalendarCheck2, Sparkles, Users } from "lucide-react";
import { SkeletonLine } from "@/components/ui/spinner";
import { InlineError } from "@/components/ui/inline-error";
import { useDebouncedFlag } from "@/hooks/useDebouncedFlag";
import { useAuth } from "@/contexts/useAuth";
import { getEventOwnership } from "@/lib/eventOwnership";

interface TodayAgendaProps {
  events: CalendarEvent[];
  loading?: boolean;
  error?: boolean;
  errorMessage?: string;
  onRetry?: () => void;
  retrying?: boolean;
}

function fmt(iso: string) {
  return new Date(iso).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

export function TodayAgenda({ events, loading, error, errorMessage, onRetry, retrying }: TodayAgendaProps) {
  const { user } = useAuth();
  const today = new Date();
  const now = today.getTime();
  const todays = events
    .filter((e) => {
      const d = new Date(e.start);
      return (
        d.getFullYear() === today.getFullYear() &&
        d.getMonth() === today.getMonth() &&
        d.getDate() === today.getDate()
      );
    })
    .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());
  const showSkeleton = useDebouncedFlag(!!loading && events.length === 0 && !error);

  const nextUp = todays.find((e) => new Date(e.end).getTime() > now);

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <CalendarCheck2 className="h-3.5 w-3.5 text-muted-foreground" />
          <h3 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            Today
          </h3>
        </div>
        <span className="text-[11px] font-medium text-muted-foreground/80">
          {today.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}
        </span>
      </div>

      {error && events.length === 0 ? (
        <InlineError
          compact
          title="Couldn't load today's agenda"
          message={errorMessage ?? "Check your connection and try again."}
          onRetry={onRetry}
          retrying={retrying}
        />
      ) : loading && events.length === 0 ? (
        showSkeleton ? (
          <ul className="space-y-2" aria-busy="true" aria-live="polite">
            {[0, 1, 2].map((i) => (
              <li key={i} className="flex items-start gap-3 p-2">
                <SkeletonLine className="mt-1.5 h-2 w-2 rounded-full" />
                <div className="flex-1 space-y-1.5">
                  <SkeletonLine className="h-3 w-3/4" />
                  <SkeletonLine className="h-2.5 w-1/3" />
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <div className="h-[88px]" aria-busy="true" aria-live="polite" />
        )
      ) : todays.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border bg-background/50 px-4 py-6 text-center">
          <Sparkles className="mx-auto mb-2 h-4 w-4 text-primary/70" aria-hidden="true" />
          <p className="text-sm font-medium text-foreground">No meetings today</p>
          <p className="mt-0.5 text-xs text-muted-foreground">A clear runway for focus.</p>
        </div>
      ) : (
        <ul className="space-y-1">
          {todays.map((e) => {
            const isNext = e.id === nextUp?.id;
            const isPast = new Date(e.end).getTime() <= now;
            const isGuest = getEventOwnership(e, user?.email) === "participant";
            return (
              <li
                key={e.id}
                className={`group relative flex items-start gap-3 rounded-lg px-2 py-1.5 transition hover:bg-muted/60 ${
                  isPast ? "opacity-55" : ""
                }`}
              >
                <span
                  className="mt-1.5 h-2 w-2 shrink-0 rounded-full ring-2 ring-card"
                  style={{ backgroundColor: e.color || "hsl(var(--primary))" }}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-2">
                    <p className="flex min-w-0 items-center gap-1.5 truncate text-sm font-medium text-foreground">
                      {e.is_focus_block && <span className="mr-0.5">🎯</span>}
                      <span className="truncate">{e.title}</span>
                      {isGuest && (
                        <Users
                          className="h-3 w-3 shrink-0 text-[#9B7AE0]"
                          aria-label="You're a guest on this meeting"
                        />
                      )}
                    </p>
                    {isNext && (
                      <span className="ml-auto shrink-0 rounded-full bg-primary/10 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-primary">
                        Next
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {fmt(e.start)} – {fmt(e.end)}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
