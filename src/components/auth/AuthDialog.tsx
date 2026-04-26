import { useState } from "react";
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

import { apiFetch, apiUrl, checkApiAvailability, type ApiError } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";

interface AuthDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** "signin" or "signup" — only changes copy, not behaviour. */
  mode?: "signin" | "signup";
}

type DetectType = "google" | "microsoft" | "sso" | "generic";

interface DetectResponse {
  type: DetectType;
  domain?: string;
}

const emailSchema = z.string().trim().email("Enter a valid email address.").max(255);

export function AuthDialog({ open, onOpenChange, mode = "signin" }: AuthDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[440px] gap-0 border-border bg-background p-0">
        <AuthDialogBody mode={mode} onClose={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}

function AuthDialogBody({ mode, onClose }: { mode: "signin" | "signup"; onClose: () => void }) {
  const { loginDemo, refresh } = useAuth();
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

  const [step, setStep] = useState<"discover" | "generic">("discover");
  const [email, setEmail] = useState("");
  const [emailError, setEmailError] = useState<string | null>(null);
  const [pending, setPending] = useState<null | "google" | "microsoft" | "email">(null);

  /** Drop into demo mode and close — used when the API is unreachable. */
  const fallbackDemo = () => {
    loginDemo();
    onClose();
    navigate(resolveRedirect(), { replace: true });
  };

  const onSocial = async (provider: "google" | "microsoft") => {
    setPending(provider);
    const ok = await checkApiAvailability();
    if (!ok) {
      fallbackDemo();
      return;
    }
    window.location.href = apiUrl(`/api/auth/${provider}`);
  };

  const onEmailContinue = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = emailSchema.safeParse(email);
    if (!parsed.success) {
      setEmailError(parsed.error.issues[0]?.message ?? "Invalid email");
      return;
    }
    setEmailError(null);
    setPending("email");

    try {
      const res = await apiFetch<DetectResponse>("/api/auth/detect", {
        method: "POST",
        json: { email: parsed.data },
      });
      if (res.type === "google") {
        window.location.href = apiUrl(`/api/auth/google?login_hint=${encodeURIComponent(parsed.data)}`);
        return;
      }
      if (res.type === "microsoft") {
        window.location.href = apiUrl(`/api/auth/microsoft?login_hint=${encodeURIComponent(parsed.data)}`);
        return;
      }
      if (res.type === "sso" && res.domain) {
        window.location.href = apiUrl(`/api/auth/sso/${encodeURIComponent(res.domain)}`);
        return;
      }
      // generic → go to password step
      setStep("generic");
      setPending(null);
    } catch {
      // Network error or backend down → silent demo fallback per T-26.
      fallbackDemo();
    }
  };

  return (
    <div className="px-7 py-8">
      <div className="flex items-center gap-2.5 text-foreground">
        <PacedayMark className="h-5 w-5 text-foreground" />
        <span className="font-serif text-base leading-none tracking-tight">Paceday</span>
      </div>

      {step === "discover" ? (
        <DiscoverStep
          mode={mode}
          email={email}
          setEmail={(v) => {
            setEmail(v);
            if (emailError) setEmailError(null);
          }}
          emailError={emailError}
          pending={pending}
          onSocial={onSocial}
          onEmailContinue={onEmailContinue}
        />
      ) : (
        <GenericStep
          email={email}
          onBack={() => setStep("discover")}
          onSuccess={async () => {
            await refresh();
            onClose();
            navigate(resolveRedirect(), { replace: true });
          }}
          onApiDown={fallbackDemo}
        />
      )}
    </div>
  );
}

/* ---------- step 1: discover ---------- */

function DiscoverStep({
  mode,
  email,
  setEmail,
  emailError,
  pending,
  onSocial,
  onEmailContinue,
}: {
  mode: "signin" | "signup";
  email: string;
  setEmail: (v: string) => void;
  emailError: string | null;
  pending: null | "google" | "microsoft" | "email";
  onSocial: (p: "google" | "microsoft") => void;
  onEmailContinue: (e: React.FormEvent) => void;
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
        <ProviderButton
          icon={<GoogleGlyph />}
          label={mode === "signup" ? "Sign up with Google" : "Continue with Google"}
          onClick={() => onSocial("google")}
          disabled={pending !== null}
        />
        <ProviderButton
          icon={<MicrosoftGlyph />}
          label={mode === "signup" ? "Sign up with Microsoft" : "Continue with Microsoft"}
          onClick={() => onSocial("microsoft")}
          disabled={pending !== null}
        />
      </div>

      <div className="my-6 flex items-center gap-3 text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
        <span className="h-px flex-1 bg-border" />
        or with email
        <span className="h-px flex-1 bg-border" />
      </div>

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
    </>
  );
}

/* ---------- step 2: generic password (sign in / register) ---------- */

function GenericStep({
  email,
  onBack,
  onSuccess,
  onApiDown,
}: {
  email: string;
  onBack: () => void;
  onSuccess: () => void;
  onApiDown: () => void;
}) {
  const [tab, setTab] = useState<"signin" | "signup">("signin");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      if (tab === "signin") {
        await apiFetch("/api/auth/login", {
          method: "POST",
          json: { email, password },
        });
      } else {
        await apiFetch("/api/auth/register", {
          method: "POST",
          json: { email, password, name: name.trim() || undefined },
        });
      }
      onSuccess();
    } catch (e) {
      const err = e as ApiError;
      if (err?.status === 401) {
        setError("Incorrect email or password.");
      } else if (err?.status === 404) {
        setError("No account found — try creating one.");
      } else if (err?.status == null) {
        // No status → network failure → silent demo fallback.
        onApiDown();
        return;
      } else {
        setError("Something went wrong. Please try again.");
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={onBack}
        className="mt-6 inline-flex items-center gap-1 text-xs font-medium text-muted-foreground transition hover:text-foreground"
      >
        <ArrowLeft className="h-3 w-3" />
        Back
      </button>
      <h2 className="mt-3 font-serif text-2xl leading-tight tracking-tight text-foreground">
        Continue with email
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">{email}</p>

      <div className="mt-6 inline-flex w-full rounded-md border border-border bg-card p-0.5">
        <button
          type="button"
          onClick={() => {
            setTab("signin");
            setError(null);
          }}
          className={`flex-1 rounded-[5px] px-3 py-1.5 text-xs font-medium transition ${
            tab === "signin"
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          Sign in
        </button>
        <button
          type="button"
          onClick={() => {
            setTab("signup");
            setError(null);
          }}
          className={`flex-1 rounded-[5px] px-3 py-1.5 text-xs font-medium transition ${
            tab === "signup"
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          Create account
        </button>
      </div>

      <form onSubmit={submit} className="mt-5 space-y-3">
        {tab === "signup" && (
          <div className="space-y-1.5">
            <Label htmlFor="auth-name" className="text-xs font-medium text-muted-foreground">
              Full name
            </Label>
            <Input
              id="auth-name"
              type="text"
              autoFocus
              placeholder="Alex Morgan"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="h-11 rounded-md border-border bg-background text-sm"
              disabled={submitting}
            />
          </div>
        )}
        <div className="space-y-1.5">
          <Label htmlFor="auth-password" className="text-xs font-medium text-muted-foreground">
            Password
          </Label>
          <Input
            id="auth-password"
            type="password"
            autoFocus={tab === "signin"}
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="h-11 rounded-md border-border bg-background text-sm"
            aria-invalid={!!error}
            disabled={submitting}
          />
        </div>

        {error && (
          <div
            role="alert"
            className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 p-2.5 text-xs text-destructive"
          >
            <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <Button
          type="submit"
          disabled={submitting}
          className="h-11 w-full rounded-md bg-primary text-sm text-primary-foreground hover:bg-primary/90"
        >
          {submitting ? (
            <Spinner size="xs" className="text-primary-foreground" />
          ) : tab === "signin" ? (
            "Sign in"
          ) : (
            "Create account"
          )}
        </Button>
      </form>
    </>
  );
}
