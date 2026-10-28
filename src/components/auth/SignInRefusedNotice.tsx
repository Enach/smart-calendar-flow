import { AlertCircle } from "lucide-react";

import { Button } from "@/components/ui/button";

/**
 * The sign-in refusal (PAC-71 spec §3 "Refusal", AC-19): shown on the landing
 * page when a sign-in callback sends the user to `/?error=signin_refused`.
 * One fixed message for every cause, so it never reveals whether an account
 * exists for an address; it names no address, provider or cause. It is not
 * the "did not complete" state (PAC-35): retrying the same way does not help.
 * Any session the browser already held is left as it was.
 */
export function SignInRefusedNotice({ onSignIn }: { onSignIn: () => void }) {
  return (
    <div className="mx-auto w-full max-w-6xl px-6 pt-6 lg:px-10">
      <div
        role="alert"
        className="flex flex-col gap-3 rounded-md border border-destructive/30 bg-destructive/10 p-4 text-sm text-foreground sm:flex-row sm:items-center sm:justify-between"
      >
        <div className="flex items-start gap-2.5">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" aria-hidden="true" />
          <div>
            <p className="font-medium">Paceday could not sign you in with this account.</p>
            <p className="mt-0.5 text-foreground/80">
              If you already use Paceday, sign in the way you did before. Otherwise, contact your workspace
              administrator or the Paceday operator.
            </p>
          </div>
        </div>
        <Button
          type="button"
          onClick={onSignIn}
          size="sm"
          className="h-11 shrink-0 rounded-md bg-primary px-4 text-primary-foreground hover:bg-primary/90"
        >
          Sign in
        </Button>
      </div>
    </div>
  );
}
