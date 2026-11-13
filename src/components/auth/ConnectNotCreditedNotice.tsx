import { Info } from "lucide-react";

import { Button } from "@/components/ui/button";

/**
 * A calendar connect that was credited to nobody (PAC-71 contract §4): the
 * callback sends the user to `/?connect=not_credited` when the provider step
 * was cancelled, or when the browser's session is no longer the one that
 * started the connect. Nothing was stored and no session changed, so the
 * message says only that, and offers the way back into the app, where the
 * connect can be started again.
 */
export function ConnectNotCreditedNotice({ onContinue }: { onContinue: () => void }) {
  return (
    <div className="mx-auto w-full max-w-6xl px-6 pt-6 lg:px-10">
      <div
        role="status"
        className="flex flex-col gap-3 rounded-md border border-border bg-muted p-4 text-sm text-foreground sm:flex-row sm:items-center sm:justify-between"
      >
        <div className="flex items-start gap-2.5">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <div>
            <p className="font-medium">Your calendar was not connected.</p>
            <p className="mt-0.5 text-foreground/80">
              Nothing was changed. To try again, open Paceday and connect your calendar from there.
            </p>
          </div>
        </div>
        <Button
          type="button"
          onClick={onContinue}
          size="sm"
          className="h-11 shrink-0 rounded-md bg-primary px-4 text-primary-foreground hover:bg-primary/90"
        >
          Open Paceday
        </Button>
      </div>
    </div>
  );
}
