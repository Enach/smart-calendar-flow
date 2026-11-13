import { useEffect, useRef } from "react";
import { AlertCircle, ArrowLeft } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { ProviderButton, GoogleGlyph } from "@/components/auth/ProviderButton";
import { ApiErrorNotice } from "@/components/ApiErrorNotice";

/**
 * PAC-98 D-5: the provider step for a personal address (detection answered
 * `generic`). Paceday has no password sign-in, so a personal address signs in
 * with a provider account: Google, with the typed email as the login hint.
 *
 * Built on the PAC-97 choose step's parts (hint, back link, availability
 * states, focus on the heading). It differs from it in three ways:
 * - its copy is about a personal address, not "your company";
 * - it offers no Microsoft button: personal Microsoft accounts are refused at
 *   the callback until PAC-77, so it says they can't sign in yet (no date);
 * - its unavailable state depends on Google alone.
 *
 * Never shows a password field.
 */
export function PersonalAddressStep({
  mode,
  email,
  availabilityLoading,
  availabilityError,
  onRetryAvailability,
  googleAvailable,
  pending,
  onPickGoogle,
  onBack,
}: {
  mode: "signin" | "signup";
  email: string;
  availabilityLoading: boolean;
  availabilityError: unknown;
  onRetryAvailability: () => void;
  googleAvailable: boolean;
  pending: null | "google" | "microsoft" | "email";
  onPickGoogle: () => void;
  onBack: () => void;
}) {
  // The step replaces the one that held focus: land keyboard and
  // screen-reader users on its heading.
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    heading.current?.focus();
  }, []);
  const unavailable = !availabilityLoading && availabilityError === null && !googleAvailable;

  return (
    <div data-testid="auth-personal-step">
      <h2
        ref={heading}
        tabIndex={-1}
        className="mt-6 font-serif text-2xl leading-tight tracking-tight text-foreground focus:outline-none"
      >
        {mode === "signup" ? "Sign up with your personal email" : "Sign in with your personal email"}
      </h2>
      <p className="mt-2 text-sm text-muted-foreground">
        <span data-testid="auth-personal-email" className="font-medium text-foreground">
          {email}
        </span>{" "}
        is a personal address. Paceday signs you in with the provider account that uses it.
      </p>

      <div className="mt-6 space-y-2.5">
        {availabilityLoading && (
          <div className="flex justify-center py-2">
            <Spinner size="xs" />
          </div>
        )}
        {availabilityError !== null && (
          <ApiErrorNotice error={availabilityError} effect="read" onRetry={onRetryAvailability} />
        )}
        {googleAvailable && (
          <ProviderButton
            icon={<GoogleGlyph />}
            label={mode === "signup" ? "Sign up with Google" : "Continue with Google"}
            onClick={onPickGoogle}
            disabled={pending !== null}
            testId="auth-personal-google"
          />
        )}
        {unavailable && (
          <p
            data-testid="auth-personal-unavailable"
            className="flex items-start gap-2 rounded-md border border-border bg-card/60 p-3 text-sm text-foreground"
          >
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            Sign-in for personal addresses is not available on this deployment.
          </p>
        )}
      </div>

      <p data-testid="auth-personal-microsoft-note" className="mt-4 text-xs leading-relaxed text-muted-foreground">
        Personal Microsoft accounts (Outlook.com, Hotmail, Live) can't sign in to Paceday yet.
      </p>

      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="mt-6"
        onClick={onBack}
        disabled={pending !== null}
        data-testid="auth-personal-back"
      >
        <ArrowLeft className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
        Use a different email
      </Button>
    </div>
  );
}
