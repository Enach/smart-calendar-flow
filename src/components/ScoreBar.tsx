import { scoreBarPercent } from "@/lib/scoreBar";

/**
 * A suggested slot's score, drawn relative to the best slot in the same answer
 * (PAC-135; see `scoreBarPercent`).
 */
export function ScoreBar({ score, best }: { score: number; best: number }) {
  const pct = scoreBarPercent(score, best);
  return (
    <div
      role="meter"
      aria-label="Score relative to the best slot"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={pct}
      className="h-1.5 w-20 overflow-hidden rounded-full bg-muted"
    >
      <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
    </div>
  );
}
