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
 * A bar therefore shows a slot relative to the best slot in the same answer:
 * the best slot draws full, another draws `score / best` of it, clamped to
 * 0–100 %. When no slot scored above zero there is nothing positive to
 * compare against, and every bar draws empty.
 */
export function scoreBarPercent(score: number, best: number): number {
  if (!(best > 0) || !Number.isFinite(score)) return 0;
  const pct = Math.round((score / best) * 100);
  return Math.min(100, Math.max(0, pct));
}

/** The best score in an answer, the reference every bar is drawn against. */
export function bestScore(slots: ReadonlyArray<{ score: number }>): number {
  return slots.reduce((best, s) => Math.max(best, s.score), -Infinity);
}
