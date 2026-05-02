import { useFocusBlocks } from "@/hooks/useFocusBlocks";
import { Target } from "lucide-react";
import { SkeletonLine } from "@/components/ui/spinner";
import { InlineError } from "@/components/ui/inline-error";
import { useDebouncedFlag } from "@/hooks/useDebouncedFlag";

interface FocusStatsProps {
  weekISO: string;
  dailyTargetMinutes: number;
  focusColor: string;
}

function fmtHM(min: number) {
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h === 0) return `${m} min`;
  if (m === 0) return `${h} h`;
  return `${h} h ${m} min`;
}

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri"];

export function FocusStats({ weekISO, dailyTargetMinutes, focusColor }: FocusStatsProps) {
  const { data, isLoading, isError, isFetching, refetch } = useFocusBlocks(weekISO);
  const blocks = Array.isArray(data) ? data : [];
  const showSkeleton = useDebouncedFlag(isLoading && blocks.length === 0 && !isError);

  const weeklyTarget = dailyTargetMinutes * 5;
  const totalMin = blocks.reduce(
    (acc, b) => acc + Math.max(0, (new Date(b.end_time).getTime() - new Date(b.start_time).getTime()) / 60_000),
    0,
  );
  const pct = Math.min(100, Math.round((totalMin / Math.max(1, weeklyTarget)) * 100));

  // per-weekday minutes
  const weekStart = new Date(weekISO);
  const perDay = new Array(5).fill(0);
  blocks.forEach((b) => {
    const d = new Date(b.start_time);
    const offset = Math.floor((d.getTime() - weekStart.getTime()) / (24 * 3600_000));
    if (offset >= 0 && offset < 5) {
      perDay[offset] += (new Date(b.end_time).getTime() - new Date(b.start_time).getTime()) / 60_000;
    }
  });
  const dayMax = Math.max(dailyTargetMinutes, ...perDay, 1);

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Target className="h-3.5 w-3.5" style={{ color: focusColor }} />
          <h3 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            Focus this week
          </h3>
        </div>
        <span
          className="rounded-full px-2 py-0.5 text-[10px] font-semibold tabular-nums"
          style={{ backgroundColor: `${focusColor}1A`, color: focusColor }}
        >
          {pct}%
        </span>
      </div>

      {isError && blocks.length === 0 ? (
        <InlineError
          compact
          title="Couldn't load focus data"
          message="Check your connection and try again."
          onRetry={() => refetch()}
          retrying={isFetching}
        />
      ) : isLoading && blocks.length === 0 ? (
        showSkeleton ? (
          <div aria-busy="true" aria-live="polite" className="space-y-3">
            <SkeletonLine className="h-7 w-1/2" />
            <SkeletonLine className="h-3 w-1/3" />
            <SkeletonLine className="mt-3 h-2 w-full" />
            <div className="mt-4 flex items-end justify-between gap-1.5">
              {DAYS.map((d) => (
                <div key={d} className="flex flex-1 flex-col items-center gap-1">
                  <SkeletonLine className="h-12 w-full" />
                  <span className="text-[10px] font-medium text-muted-foreground">{d}</span>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="h-[140px]" aria-busy="true" aria-live="polite" />
        )
      ) : (
        <>
          <p className="font-serif text-[28px] leading-none tracking-tight text-foreground">{fmtHM(totalMin)}</p>
          <p className="mt-1.5 text-xs text-muted-foreground">
            of {fmtHM(weeklyTarget)} weekly target
          </p>

          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full transition-all"
              style={{ width: `${pct}%`, backgroundColor: focusColor }}
            />
          </div>

          <div className="mt-4 flex items-end justify-between gap-1.5">
            {DAYS.map((d, i) => {
              const h = Math.max(6, Math.round((perDay[i] / dayMax) * 48));
              return (
                <div key={d} className="flex flex-1 flex-col items-center gap-1">
                  <div className="flex h-12 w-full items-end">
                    <div
                      className="w-full rounded-md transition-all"
                      style={{ height: `${h}px`, backgroundColor: perDay[i] > 0 ? focusColor : "hsl(var(--muted))" }}
                    />
                  </div>
                  <span className="text-[10px] font-medium text-muted-foreground">{d}</span>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
