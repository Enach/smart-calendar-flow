import { Check, Clock, HelpCircle, Loader2, UserCheck } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import type { CoverageProvider, CoverageStatus } from "@/api/types";

/**
 * Small status logo for the "Availability synced" badges.
 * Renders the providerʼs initial in a coloured pill — keeps the bundle tiny
 * (no SVG asset import) and matches the calm, minimal aesthetic.
 */
function ProviderLogo({ provider }: { provider?: CoverageProvider }) {
  if (!provider || provider === "paceday") return null;
  const isGoogle = provider === "google";
  return (
    <span
      className={
        "ml-1 inline-flex h-3.5 w-3.5 items-center justify-center rounded-sm text-[8px] font-bold leading-none " +
        (isGoogle
          ? "bg-white text-[#4285F4] ring-1 ring-[#4285F4]/40"
          : "bg-white text-[#0078D4] ring-1 ring-[#0078D4]/40")
      }
      aria-label={isGoogle ? "Google" : "Microsoft"}
      title={isGoogle ? "Google Calendar" : "Microsoft Outlook"}
    >
      {isGoogle ? "G" : "M"}
    </span>
  );
}

export type ChipState =
  | { kind: "loading" }
  | { kind: "paceday-accepted" }
  | { kind: "paceday-pending" }
  | { kind: "synced"; provider?: CoverageProvider }
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
      <span className="inline-flex items-center gap-1 rounded-full bg-[#5B7FFF]/12 px-2 py-0.5 text-[10px] font-semibold text-[#5B7FFF]">
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
            <span className="inline-flex items-center gap-1 rounded-full bg-[#5FC9A6]/15 px-2 py-0.5 text-[10px] font-semibold text-[#2F8B70]">
              <Check className="h-2.5 w-2.5" />
              Availability synced
              <ProviderLogo provider={state.provider} />
            </span>
          </TooltipTrigger>
          <TooltipContent side="top" className="max-w-xs text-xs">
            We can read this person&apos;s calendar via{" "}
            {state.provider === "outlook" ? "Microsoft Outlook" : "Google Calendar"}.
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
