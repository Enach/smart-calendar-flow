import { Check, Clock, HelpCircle, Loader2, UserCheck } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
/**
 * "On Paceday" and "Invite pending" come only from the link's own host record.
 * "synced" and "unknown" are the two free/busy statuses the server sends; the
 * answer does not say which calendar provider supplied the data, so the chip
 * names none (PAC-41, API-046, D-2).
 */
export type ChipState =
  | { kind: "loading" }
  | { kind: "paceday-accepted" }
  | { kind: "paceday-pending" }
  | { kind: "synced" }
  | { kind: "unknown" };

interface CoverageBadgeProps {
  state: ChipState;
}

/**
 * Real-time availability/status badge shown next to a co-host chip
 * in the scheduling-link drawer.
 */
export function CoverageBadge({ state }: CoverageBadgeProps) {
  if (state.kind === "loading") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
        <Loader2 className="h-2.5 w-2.5 animate-spin" />
        Checking…
      </span>
    );
  }

  if (state.kind === "paceday-accepted") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-primary/12 px-2 py-0.5 text-[10px] font-semibold text-primary">
        <UserCheck className="h-2.5 w-2.5" />
        On Paceday
      </span>
    );
  }

  if (state.kind === "paceday-pending") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        <Clock className="h-2.5 w-2.5" />
        Invite pending
      </span>
    );
  }

  if (state.kind === "synced") {
    return (
      <TooltipProvider delayDuration={150}>
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="inline-flex items-center gap-1 rounded-full bg-success/15 px-2 py-0.5 text-[10px] font-semibold text-[#2F8B70]">
              <Check className="h-2.5 w-2.5" />
              Availability synced
            </span>
          </TooltipTrigger>
          <TooltipContent side="top" className="max-w-xs text-xs">
            We can read this person&apos;s calendar.
            Slots will already exclude their busy time — no need to invite them to Paceday.
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  // unknown
  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-flex items-center gap-1 rounded-full bg-[#E9B949]/15 px-2 py-0.5 text-[10px] font-semibold text-[#8A6A14]">
            <HelpCircle className="h-2.5 w-2.5" />
            Availability unknown
          </span>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-xs text-xs">
          We could not read their calendar. Slots will not account for their schedule.
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
