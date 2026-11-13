import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Mail, ArrowRight, ArrowLeft, AlertCircle } from "lucide-react";
import { z } from "zod";

import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import {
  ProviderButton,
  GoogleGlyph,
  MicrosoftGlyph,
  SsoGlyph,
} from "@/components/auth/ProviderButton";
import { PacedayMark } from "@/components/auth/AuthLayout";
import { PersonalAddressStep } from "@/components/auth/PersonalAddressStep";
import {
  readRememberedSignInEmail,
  readRememberedSignInEmailKind,
  rememberSignInEmail,
  rememberSignInEmailKind,
  type SignInEmailKind,
} from "@/components/auth/rememberedEmail";

import { apiFetch, apiUrl, checkApiAvailability } from "@/lib/api";
import { ApiUnreachableError, apiErrorMessage, isAnswerLost } from "@/api/client";
import { ApiErrorNotice } from "@/components/ApiErrorNotice";
import type { AuthUser } from "@/contexts/AuthContext";
import type { SsoDetectResponse } from "@/api/generated/schemas";
import { useAuth } from "@/contexts/useAuth";
import { useIntegrationAvailability } from "@/hooks/useIntegrationAvailability";

interface AuthDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** "signin" or "signup" — only changes copy, not behaviour. */
  mode?: "signin" | "signup";
  /**
   * PAC-97 AC-25: opened from a sign-in failure notice. When this tab
   * remembers the email typed earlier, the dialog starts at the provider step
   * that fits it (PAC-98 AC-15: the personal-address step for a personal
   * address, the PAC-97 choice for a company one); otherwise it opens as usual.
   */
  offerSwitch?: boolean;
}

type Provider = "google" | "microsoft";

/**
 * - discover: the email form and the top provider buttons;
 * - choose: the PAC-97 provider choice (a company address);
 * - personal: the PAC-98 personal-address step;
 * - resolving: opened from a failure notice with an email whose kind this tab
 *   does not know: one detection request finds it (PAC-98 AC-15).
 *
 * There is no password step: Paceday has no password sign-in (PAC-98).
 */
type Step = "discover" | "choose" | "personal" | "resolving";

function stepForKind(kind: SignInEmailKind): Step {
  return kind === "personal" ? "personal" : "choose";
}

/** PAC-98 D-7: `generic` is a personal address; every other answer is not. */
function kindOfAnswer(type: unknown): SignInEmailKind {
  return type === "generic" ? "personal" : "company";
}

/**
 * PAC-83 (owner OQ-1 (c), contract §4.4): the one demo entry, in a
 * non-production build only, on the initial view only — never after an error.
 */
const DemoEntry = __PACEDAY_DEMO_BUILD__ ? lazy(() => import("@/demo/DemoEntry")) : null;

/** A sign-in step that could not reach Paceday, and how to try it again. */
type SignInFailure = { error: unknown; retry: () => void };

const emailSchema = z.string().trim().email("Enter a valid email address.").max(255);

export function AuthDialog({ open, onOpenChange, mode = "signin", offerSwitch = false }: AuthDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[440px] gap-0 border-border bg-background p-0">
        <AuthDialogBody mode={mode} offerSwitch={offerSwitch} onClose={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}

function AuthDialogBody({
  mode,
  offerSwitch,
  onClose,
}: {
  mode: "signin" | "signup";
  offerSwitch: boolean;
  onClose: () => void;
}) {
  const { enterDemo } = useAuth();
  const availabilityQuery = useIntegrationAvailability();
  const availability = availabilityQuery.data;
  const navigate = useNavigate();

  /** Where to land after a successful login. Honours ?redirect= on the URL. */
  const resolveRedirect = (): string => {
    try {
      const params = new URLSearchParams(window.location.search);
      const r = params.get("redirect");
      if (r && r.startsWith("/") && !r.startsWith("//")) return r;
    } catch {
      /* ignore */
    }
    return "/app";
  };

  // Read once, when the dialog opens (its body mounts on every open).
  const [remembered] = useState<{ email: string; kind: SignInEmailKind | null } | null>(() => {
    if (!offerSwitch) return null;
    const rememberedEmail = readRememberedSignInEmail();
    return rememberedEmail ? { email: rememberedEmail, kind: readRememberedSignInEmailKind() } : null;
  });
  const [step, setStep] = useState<Step>(() =>
    !remembered ? "discover" : remembered.kind ? stepForKind(remembered.kind) : "resolving",
  );
  const [email, setEmail] = useState(remembered?.email ?? "");
  const [emailError, setEmailError] = useState<string | null>(null);
  const [pending, setPending] = useState<null | "google" | "microsoft" | "email">(null);
  /**
   * PAC-83 §3.4: Paceday could not be reached. The dialog says so with a
   * retry; nothing starts or offers the demo from here.
   */
  const [failure, setFailure] = useState<SignInFailure | null>(null);
  // The step that held focus is hidden while the failure shows: move focus to
  // the failure heading so keyboard and screen-reader users land on it.
  const failureHeading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (failure) failureHeading.current?.focus();
  }, [failure]);

  const onDemoStarted = (demoUser: AuthUser) => {
    enterDemo(demoUser);
    onClose();
    navigate(resolveRedirect(), { replace: true });
  };

  /**
   * Starts the public sign-in with a provider. The top buttons send no hint
   * (PAC-71 AC-32); the provider steps (PAC-97, PAC-98) send the typed email.
   */
  const onSocial = async (provider: Provider, loginHint?: string) => {
    setFailure(null);
    setPending(provider);
    const ok = await checkApiAvailability();
    if (!ok) {
      setPending(null);
      setFailure({
        error: new ApiUnreachableError("network"),
        retry: () => void onSocial(provider, loginHint),
      });
      return;
    }
    const query = loginHint ? `?login_hint=${encodeURIComponent(loginHint)}` : "";
    window.location.href = apiUrl(`/api/auth/${provider}${query}`);
  };

  /**
   * PAC-98 AC-15: opened from a failure notice with an email remembered
   * without its kind (an older build wrote it, or the detection after it
   * failed). Exactly one detection request finds the kind. It never navigates
   * on the answer; it only picks the step. An unreachable API shows the
   * PAC-83 failure view with a retry.
   */
  const resolveRememberedKind = async () => {
    if (!remembered) return;
    setFailure(null);
    try {
      const res = await apiFetch<SsoDetectResponse>("/api/auth/detect", {
        method: "POST",
        json: { email: remembered.email },
      });
      const kind = kindOfAnswer(res?.type);
      rememberSignInEmailKind(kind);
      setStep(stepForKind(kind));
    } catch (err) {
      if (isAnswerLost(err)) {
        setFailure({ error: err, retry: () => void resolveRememberedKind() });
      } else {
        // Detection answered with an error: the PAC-97 choice, as before PAC-98.
        setStep("choose");
      }
    }
  };
  // One detection request per open, never one per render (AC-15).
  const resolveStarted = useRef(false);
  const resolveRef = useRef(resolveRememberedKind);
  resolveRef.current = resolveRememberedKind;
  useEffect(() => {
    if (step !== "resolving" || resolveStarted.current) return;
    resolveStarted.current = true;
    void resolveRef.current();
  }, [step]);

  const onEmailContinue = async (e?: React.FormEvent) => {
    e?.preventDefault();
    setFailure(null);
    const parsed = emailSchema.safeParse(email);
    if (!parsed.success) {
      setEmailError(parsed.error.issues[0]?.message ?? "Invalid email");
      return;
    }
    setEmailError(null);
    setPending("email");
    // PAC-97 D-10: kept for this tab only, so a failed provider sign-in can
    // offer the other provider with the same hint.
    rememberSignInEmail(parsed.data);

    try {
      const res = await apiFetch<SsoDetectResponse>("/api/auth/detect", {
        method: "POST",
        json: { email: parsed.data },
      });
      const type = res?.type;
      // PAC-98 D-7: the kind is kept with the remembered email, so a failure
      // return needs no new detection request.
      rememberSignInEmailKind(kindOfAnswer(type));
      // PAC-98 D-6: once availability has loaded, a direct answer for a
      // provider this deployment does not offer gets the provider step for
      // the address instead of a start that cannot work. While availability
      // is loading, or its read failed, the dialog navigates as before.
      const loaded = availabilityQuery.isSuccess ? availability : undefined;
      if (type === "google") {
        if (loaded && loaded.google.available !== true) {
          // gmail.com and googlemail.com are answered google (PAC-98 D-2):
          // the personal-address step, in its "not available" state.
          setPending(null);
          setStep("personal");
          return;
        }
        window.location.href = apiUrl(`/api/auth/google?login_hint=${encodeURIComponent(parsed.data)}`);
        return;
      }
      if (type === "microsoft") {
        if (loaded && loaded.microsoft.available !== true) {
          setPending(null);
          setStep("choose");
          return;
        }
        window.location.href = apiUrl(`/api/auth/microsoft?login_hint=${encodeURIComponent(parsed.data)}`);
        return;
      }
      if (type === "sso" && res.redirect_url) {
        // redirect_url is a path on the API origin, not this app's (PAC-35,
        // API-010); the typed email goes with it as the IdP's login hint.
        window.location.href = apiUrl(`${res.redirect_url}?login_hint=${encodeURIComponent(parsed.data)}`);
        return;
      }
      setPending(null);
      if (type === "generic") {
        // PAC-98: a personal address → the personal-address step.
        setStep("personal");
        return;
      }
      // PAC-97: "choose", an sso answer without its path (PAC-98 AC-12), or
      // any value this web does not know (AC-22): the user picks the
      // provider. No step shows a password field (PAC-98).
      setStep("choose");
    } catch (err) {
      setPending(null);
      if (isAnswerLost(err)) {
        setFailure({ error: err, retry: () => void onEmailContinue() });
      } else {
        setEmailError(apiErrorMessage(err));
      }
    }
  };

  return (
    <div className="px-7 py-8">
      <div className="flex items-center gap-2.5 text-foreground">
        <PacedayMark className="h-5 w-5 text-foreground" />
        <span className="font-serif text-base leading-none tracking-tight">Paceday</span>
      </div>

      {failure && (
        <div className="mt-6 space-y-3">
          <h2
            ref={failureHeading}
            tabIndex={-1}
            data-testid="sign-in-failure-heading"
            className="font-serif text-2xl leading-tight tracking-tight text-foreground focus:outline-none"
          >
            Can't sign in right now
          </h2>
          <ApiErrorNotice error={failure.error} effect="read" onRetry={failure.retry} />
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              setFailure(null);
              // While the remembered email's kind is unknown there is no
              // provider step to go back to: the email step, email kept.
              if (step === "resolving") setStep("discover");
            }}
          >
            <ArrowLeft className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
            Back
          </Button>
        </div>
      )}

      <div hidden={failure !== null}>
      {step === "discover" ? (
        <DiscoverStep
          showDemoEntry={failure === null}
          onDemoStarted={onDemoStarted}
          mode={mode}
          email={email}
          setEmail={(v) => {
            setEmail(v);
            if (emailError) setEmailError(null);
          }}
          emailError={emailError}
          googleAvailable={availability?.google.available === true}
          microsoftAvailable={availability?.microsoft.available === true}
          pending={pending}
          onSocial={onSocial}
          onEmailContinue={onEmailContinue}
        />
      ) : step === "choose" ? (
        <ChooseStep
          mode={mode}
          email={email}
          availabilityLoading={availabilityQuery.isPending}
          availabilityError={availabilityQuery.isError ? availabilityQuery.error : null}
          onRetryAvailability={() => void availabilityQuery.refetch()}
          googleAvailable={availability?.google.available === true}
          microsoftAvailable={availability?.microsoft.available === true}
          pending={pending}
          onPick={(provider) => void onSocial(provider, email.trim())}
          onBack={() => setStep("discover")}
        />
      ) : step === "personal" ? (
        <PersonalAddressStep
          mode={mode}
          email={email}
          availabilityLoading={availabilityQuery.isPending}
          availabilityError={availabilityQuery.isError ? availabilityQuery.error : null}
          onRetryAvailability={() => void availabilityQuery.refetch()}
          googleAvailable={availability?.google.available === true}
          pending={pending}
          onPickGoogle={() => void onSocial("google", email.trim())}
          onBack={() => setStep("discover")}
        />
      ) : (
        <div data-testid="auth-resolving-step" className="mt-6">
          {/* The sentence is the spinner's label, so the status region announces it. */}
          <Spinner size="xs" label={`Checking how ${email} signs in…`} />
        </div>
      )}
      </div>
    </div>
  );
}

/* ---------- step 1: discover ---------- */

function DiscoverStep({
  showDemoEntry,
  onDemoStarted,
  mode,
  email,
  setEmail,
  emailError,
  pending,
  onSocial,
  onEmailContinue,
  googleAvailable,
  microsoftAvailable,
}: {
  showDemoEntry: boolean;
  onDemoStarted: (user: AuthUser) => void;
  mode: "signin" | "signup";
  email: string;
  setEmail: (v: string) => void;
  emailError: string | null;
  pending: null | "google" | "microsoft" | "email";
  onSocial: (p: Provider) => void;
  onEmailContinue: (e?: React.FormEvent) => void;
  googleAvailable: boolean;
  microsoftAvailable: boolean;
}) {
  return (
    <>
      <h2 className="mt-6 font-serif text-2xl leading-tight tracking-tight text-foreground">
        {mode === "signup" ? "Own your day." : "Welcome back."}
      </h2>
      <p className="mt-2 text-sm text-muted-foreground">
        {mode === "signup"
          ? "Connect your work calendar in under a minute."
          : "Pick up where Paceday left your day."}
      </p>

      <div className="mt-6 space-y-2.5">
        {googleAvailable && (
          <ProviderButton
            icon={<GoogleGlyph />}
            label={mode === "signup" ? "Sign up with Google" : "Continue with Google"}
            onClick={() => onSocial("google")}
            disabled={pending !== null}
          />
        )}
        {microsoftAvailable && (
          <ProviderButton
            icon={<MicrosoftGlyph />}
            label={mode === "signup" ? "Sign up with Microsoft" : "Continue with Microsoft"}
            onClick={() => onSocial("microsoft")}
            disabled={pending !== null}
          />
        )}
      </div>

      {(googleAvailable || microsoftAvailable) && (
        <div className="my-6 flex items-center gap-3 text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
        <span className="h-px flex-1 bg-border" />
        or with email
        <span className="h-px flex-1 bg-border" />
        </div>
      )}

      <form onSubmit={onEmailContinue} className="space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor="auth-email" className="text-xs font-medium text-muted-foreground">
            Work email
          </Label>
          <div className="relative">
            <Mail className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="auth-email"
              type="email"
              autoFocus
              placeholder="you@company.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="h-11 rounded-md border-border bg-background pl-9 text-sm"
              aria-invalid={!!emailError}
              aria-describedby={emailError ? "auth-email-error" : undefined}
              disabled={pending !== null}
            />
          </div>
          {emailError && (
            <p id="auth-email-error" className="text-xs text-destructive">
              {emailError}
            </p>
          )}
        </div>
        <Button
          type="submit"
          disabled={pending !== null}
          className="h-11 w-full rounded-md bg-primary text-sm text-primary-foreground hover:bg-primary/90"
        >
          {pending === "email" ? (
            <Spinner size="xs" className="text-primary-foreground" />
          ) : (
            <>
              Continue
              <ArrowRight className="ml-1 h-3.5 w-3.5" />
            </>
          )}
        </Button>
      </form>

      <p className="mt-6 flex items-center gap-2 rounded-md border border-border bg-card/60 p-3 text-[11px] leading-relaxed text-muted-foreground">
        <SsoGlyph />
        Single sign-on (SSO) is detected automatically from your email domain.
      </p>

      {__PACEDAY_DEMO_BUILD__ && showDemoEntry && DemoEntry && (
        <Suspense fallback={null}>
          <DemoEntry onStarted={onDemoStarted} />
        </Suspense>
      )}
    </>
  );
}

/* ---------- step 1b: choose a provider (PAC-97) ---------- */

/**
 * Detection could not tell which provider the domain uses (`choose`, an `sso`
 * answer without its path, or a value this web does not know), or answered a
 * provider this deployment does not offer (PAC-98 D-6). Offers the providers
 * this deployment has, each carrying the typed email as the login hint;
 * nothing navigates until one is picked. Never shows a password field.
 */
function ChooseStep({
  mode,
  email,
  availabilityLoading,
  availabilityError,
  onRetryAvailability,
  googleAvailable,
  microsoftAvailable,
  pending,
  onPick,
  onBack,
}: {
  mode: "signin" | "signup";
  email: string;
  availabilityLoading: boolean;
  availabilityError: unknown;
  onRetryAvailability: () => void;
  googleAvailable: boolean;
  microsoftAvailable: boolean;
  pending: null | "google" | "microsoft" | "email";
  onPick: (p: Provider) => void;
  onBack: () => void;
}) {
  // The step replaces the one that held focus: land keyboard and
  // screen-reader users on its heading.
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    heading.current?.focus();
  }, []);
  const noneAvailable = !availabilityLoading && availabilityError === null && !googleAvailable && !microsoftAvailable;

  return (
    <div data-testid="auth-choose-step">
      <h2
        ref={heading}
        tabIndex={-1}
        className="mt-6 font-serif text-2xl leading-tight tracking-tight text-foreground focus:outline-none"
      >
        {mode === "signup" ? "Choose how to sign up" : "Choose how to sign in"}
      </h2>
      <p className="mt-2 text-sm text-muted-foreground">
        Paceday can't tell which provider{" "}
        <span data-testid="auth-choose-email" className="font-medium text-foreground">
          {email}
        </span>{" "}
        uses. Pick the one your company signs in with.
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
            onClick={() => onPick("google")}
            disabled={pending !== null}
            testId="auth-choose-google"
          />
        )}
        {microsoftAvailable && (
          <ProviderButton
            icon={<MicrosoftGlyph />}
            label={mode === "signup" ? "Sign up with Microsoft" : "Continue with Microsoft"}
            onClick={() => onPick("microsoft")}
            disabled={pending !== null}
            testId="auth-choose-microsoft"
          />
        )}
        {noneAvailable && (
          <p
            data-testid="auth-choose-unavailable"
            className="flex items-start gap-2 rounded-md border border-border bg-card/60 p-3 text-sm text-foreground"
          >
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            Sign-in with Google or Microsoft is not available on this deployment.
          </p>
        )}
      </div>

      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="mt-6"
        onClick={onBack}
        disabled={pending !== null}
        data-testid="auth-choose-back"
      >
        <ArrowLeft className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
        Use a different email
      </Button>
    </div>
  );
}
