/**
 * PAC-135: how wide to draw a suggested slot's score bar.
 *
 * `SuggestedSlot.score` is the backend's integer sum of fixed points
 * (scoreCandidate + adjustScoreForPreferences), not a 0–1 fraction or a
 * percentage. Without preferences it lies between -30 and +50; each
 * `preferred_times` / `avoid_times` range adds +25 / -40, so it has no fixed
 * range and can be negative. The contract documents this on
 * `SuggestedSlot.score`.
 *
 * A bar therefore shows a slot within the answer's own range:
 * `(score - worst) / (best - worst)`, clamped to 0–100 %. The best slot draws
 * full and the worst empty; when every slot scored the same, every bar draws
 * full (each is the best).
 */
export interface ScoreRange {
  best: number;
  worst: number;
}

export function scoreBarPercent(score: number, { best, worst }: ScoreRange): number {
  if (!Number.isFinite(score) || !Number.isFinite(best) || !Number.isFinite(worst)) return 0;
  if (best <= worst) return 100;
  const pct = Math.round(((score - worst) / (best - worst)) * 100);
  return Math.min(100, Math.max(0, pct));
}

/** The best and worst score in an answer, the range every bar is drawn over. */
export function scoreRange(slots: ReadonlyArray<{ score: number }>): ScoreRange {
  let best = -Infinity;
  let worst = Infinity;
  for (const s of slots) {
    best = Math.max(best, s.score);
    worst = Math.min(worst, s.score);
  }
  return { best, worst };
}
