import type { CoverageSummary } from "@/api/types";

interface SlotCoverageNoteProps {
  coverage?: CoverageSummary;
  className?: string;
}

/**
 * Small inline summary shown beneath an AI-suggested slot card.
 * - Full coverage (no missing): grey italic "Availability checked for N of N participants"
 * - Partial:                    yellow "M participant calendar(s) unavailable — slot may conflict."
 * - Missing or 0 total:         renders nothing (we don't claim what we didn't check)
 */
export function SlotCoverageNote({ coverage, className = "" }: SlotCoverageNoteProps) {
  if (!coverage || coverage.total <= 0) return null;
  const missing = Math.max(0, coverage.total - coverage.checked);
  if (missing === 0) {
    return (
      <p className={`text-[11px] italic text-muted-foreground ${className}`}>
        Availability checked for {coverage.checked} of {coverage.total} participants
      </p>
    );
  }
  return (
    <p className={`text-[11px] font-medium text-[#8A6A14] ${className}`}>
      {missing} participant calendar{missing === 1 ? "" : "s"} unavailable — slot may conflict.
    </p>
  );
}
