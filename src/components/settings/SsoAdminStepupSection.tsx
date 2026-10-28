import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { CheckCircle2, ShieldCheck, XCircle } from "lucide-react";
import { fetchSsoStepupOptions, ssoStepupStartUrl, type SsoStepupOffer } from "@/api/client";
import type { SsoStepupProvider } from "@/api/generated/schemas";

// PAC-50 AC-25 (owner, 2026-10-27; spec §9 D-11, D-13): the optional SSO
// administrator step-up can be started from Settings at any time. The values
// come from GET /api/admin/sso/stepup/options, never from a write. Nothing
// here navigates until the user has read the explanation, chosen a provider
// and confirmed; declining changes nothing. PAC-50 serves no suspend or
// resume, so neither is named or offered here (contract revision 8.1, N6).

const PROVIDER_NAMES: Record<SsoStepupProvider, string> = {
  google: "Google Workspace",
  microsoft: "Microsoft 365",
};

/** What each known `without_stepup` code means. Unknown codes are not shown. */
const WITHOUT_STEPUP_TEXT: Record<string, string> = {
  sso_configuration_writes:
    "Without it, nobody in your organisation can create, replace or delete its single sign-on (SSO) configuration in Paceday, except a deployment operator on the break-glass list.",
};

/** The callback's denial reasons (contract ssoAdminStepupCallback), in plain words. */
const DENIAL_TEXT: Record<string, string> = {
  state_mismatch: "the confirmation could not be matched to your session. Start it again from this page.",
  token_invalid: "the sign-in was cancelled, or the provider's answer could not be verified.",
  no_hd: "the Google account you used is not a Google Workspace account.",
  hd_mismatch: "the Google account you used belongs to a different Google Workspace domain than your organisation.",
  tid_mismatch: "the Microsoft 365 organisation you used does not have your organisation's domain verified.",
  tid_changed: "your organisation is already linked to a different Microsoft 365 organisation.",
  email_mismatch: "the administrator account you used is not the account you are signed in to Paceday with.",
  not_admin: "the account you used is not an administrator of your organisation.",
};

function StepupOutcome() {
  const [params] = useSearchParams();
  const stepup = params.get("stepup");
  if (stepup === "granted") {
    return (
      <div role="status" className="mb-4 flex gap-2 rounded-lg border border-border bg-background p-3 text-sm text-foreground">
        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
        <p>
          Administrator confirmation granted. It stays valid for 10 minutes from the confirmation and is used by your next
          SSO configuration change (create, replace or delete), so make that change now. Nothing has been changed yet.
        </p>
      </div>
    );
  }
  if (stepup === "denied") {
    const reason = DENIAL_TEXT[params.get("reason") ?? ""];
    return (
      <div role="status" className="mb-4 flex gap-2 rounded-lg border border-border bg-background p-3 text-sm text-foreground">
        <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" aria-hidden="true" />
        <p>{reason ? `Administrator confirmation was denied: ${reason}` : "Administrator confirmation was denied."}</p>
      </div>
    );
  }
  return null;
}

function StepupEntry({ offer }: { offer: SsoStepupOffer }) {
  const [chosen, setChosen] = useState<SsoStepupProvider | null>(null);
  const losses = offer.withoutStepup.map((code) => WITHOUT_STEPUP_TEXT[code]).filter((t): t is string => !!t);

  return (
    <div className="space-y-3 text-sm text-foreground">
      <p>
        Changing your organisation's SSO configuration needs a fresh confirmation with an administrator account of your
        organisation. This is optional: Paceday keeps working without it.
      </p>
      {losses.map((t) => (
        <p key={t}>{t}</p>
      ))}
      <p>A confirmation lasts 10 minutes and covers one SSO configuration change.</p>

      {offer.providers.length === 0 ? (
        <p data-testid="sso-stepup-unavailable">
          No administrator confirmation can be started on this deployment: neither Google nor Microsoft sign-in is set up
          for it.
        </p>
      ) : (
        <ul className="space-y-3">
          {offer.providers.map((p) => (
            <li key={p} className="rounded-lg border border-border bg-background p-3">
              <p className="font-medium">{PROVIDER_NAMES[p]}</p>
              <p className="mt-1">
                {PROVIDER_NAMES[p]} will ask you to allow Paceday to read, once, these permissions beyond your sign-in:
              </p>
              <ul className="mt-1 list-disc pl-5">
                {(offer.stepupScopes[p] ?? []).map((scope) => (
                  <li key={scope}>
                    <code className="break-all text-xs">{scope}</code>
                  </li>
                ))}
              </ul>
              <p className="mt-1">
                Paceday uses them only to check that you are an administrator, then discards them. Your calendar access
                does not change.
              </p>
              {chosen === p ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => window.location.assign(ssoStepupStartUrl(offer, p))}
                    className="h-10 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90"
                  >
                    Continue to {PROVIDER_NAMES[p]}
                  </button>
                  <button
                    type="button"
                    onClick={() => setChosen(null)}
                    className="h-10 rounded-lg border border-border bg-background px-4 text-sm font-medium text-foreground transition hover:bg-muted"
                  >
                    Not now
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setChosen(p)}
                  className="mt-3 h-10 rounded-lg border border-border bg-background px-4 text-sm font-medium text-foreground transition hover:bg-muted"
                >
                  Confirm with {PROVIDER_NAMES[p]}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * The Settings section for the SSO administrator step-up. Rendered for every
 * signed-in user; it shows the step-up outcome on return from the callback,
 * and offers the entry point only when the options endpoint answers 200 (a
 * user with no organisation gets 403 and is offered nothing).
 */
export function SsoAdminStepupSection() {
  const options = useQuery({ queryKey: ["sso-stepup-options"], queryFn: fetchSsoStepupOptions, retry: false });
  const [params] = useSearchParams();
  const hasOutcome = params.get("stepup") === "granted" || params.get("stepup") === "denied";
  if (!options.data && !hasOutcome) return null;

  return (
    <section
      id="sso-admin"
      aria-labelledby="sso-admin-title"
      className="scroll-mt-20 rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-6"
    >
      <div className="mb-4 flex items-center gap-2">
        <ShieldCheck className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
        <h2 id="sso-admin-title" className="text-base font-semibold tracking-tight text-foreground">
          SSO administrator confirmation
        </h2>
      </div>
      <StepupOutcome />
      {options.data && <StepupEntry offer={options.data} />}
    </section>
  );
}
