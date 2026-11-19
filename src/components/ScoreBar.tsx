import { scoreBarPercent, type ScoreRange } from "@/lib/scoreBar";

/**
 * A suggested slot's score, drawn within the answer's own range: the best slot
 * full, the worst empty (PAC-135; see `scoreBarPercent`).
 */
export function ScoreBar({ score, range }: { score: number; range: ScoreRange }) {
  const pct = scoreBarPercent(score, range);
  return (
    <div
      role="meter"
      aria-label="Score compared with the other suggested slots"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={pct}
      aria-valuetext={`${pct}% (best suggested slot 100%, lowest 0%)`}
      className="h-1.5 w-20 overflow-hidden rounded-full bg-muted"
    >
      <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
    </div>
  );
}
