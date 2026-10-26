import { AlertCircle } from "lucide-react";

import { Button } from "@/components/ui/button";

/**
 * The sign-in failure state (PAC-35, spec D-2): shown on the landing page when
 * the server, or the sign-in completion page, sends the user to
 * `/?error=auth_failed`. It says sign-in did not complete and offers a retry.
 * It never shows a provider, an error code or any server detail: those stay in
 * the server log.
 */
export function SignInFailedNotice({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="mx-auto w-full max-w-6xl px-6 pt-6 lg:px-10">
      <div
        role="alert"
        className="flex flex-col gap-3 rounded-md border border-destructive/30 bg-destructive/10 p-4 text-sm text-foreground sm:flex-row sm:items-center sm:justify-between"
      >
        <div className="flex items-start gap-2.5">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" aria-hidden="true" />
          <div>
            <p className="font-medium">Sign-in did not complete.</p>
            <p className="mt-0.5 text-foreground/80">You are not signed in. Please try again.</p>
          </div>
        </div>
        <Button
          type="button"
          onClick={onRetry}
          size="sm"
          className="h-11 shrink-0 rounded-md bg-primary px-4 text-primary-foreground hover:bg-primary/90"
        >
          Try again
        </Button>
      </div>
    </div>
  );
}
