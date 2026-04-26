import { CheckCircle2, Info } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import type { CoverageSummary } from "@/api/types";

interface CoveragePillProps {
  coverage: CoverageSummary;
  /** When true, hides participant counts (privacy on the public booking page). */
  compactPrivate?: boolean;
}

/**
 * Displays the collective scheduling coverage for a link or meeting:
 *   - all checked    → green "All participants checked"
 *   - partial        → yellow "Partial availability" (+ tooltip explaining)
 *   - none / 0 total → renders nothing
 *
 * Privacy: the public booking page passes compactPrivate so the booker
 * never sees how many internal employees couldn't be checked.
 */
export function CoveragePill({ coverage, compactPrivate }: CoveragePillProps) {
  const { total, checked } = coverage;
  if (total <= 0) return null;
  const allChecked = checked >= total;
  const missing = Math.max(0, total - checked);

  if (allChecked) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-[#5FC9A6]/15 px-2.5 py-1 text-[11px] font-semibold text-[#2F8B70]">
        <CheckCircle2 className="h-3 w-3" />
        All participants checked
      </span>
    );
  }

  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-[#E9B949]/18 px-2.5 py-1 text-[11px] font-semibold text-[#8A6A14]">
            <Info className="h-3 w-3" />
            Partial availability
          </span>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-xs text-xs">
          {compactPrivate
            ? `Availability for ${missing} participant${missing === 1 ? "" : "s"} could not be verified. Shown slots may overlap with their schedule.`
            : `Availability checked for ${checked} of ${total} participants. Slots may overlap with the others' schedule.`}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
