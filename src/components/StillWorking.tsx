import { useStillWorking } from "@/hooks/useStillWorking";
import { cn } from "@/lib/utils";

export const STILL_WORKING_MESSAGE = "Still working — this can take up to about a minute and a half.";

/** PAC-83 (spec AC-4): shown on a user-started call still running after 8 s. */
export function StillWorking({ active, className }: { active: boolean; className?: string }) {
  const late = useStillWorking(active);
  if (!late) return null;
  return (
    <p role="status" aria-live="polite" data-testid="still-working" className={cn("text-sm text-muted-foreground", className)}>
      {STILL_WORKING_MESSAGE}
    </p>
  );
}
