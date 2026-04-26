import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Check, ChevronRight, User, Users, Calendar, Mail, Link as LinkIcon, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { managerApi } from "@/api/manager";
import { api } from "@/api/client";
import { toast } from "@/hooks/useToast";
import type { CalendarProvider } from "@/api/types";

type Step = "connect" | "profile";

const PROVIDERS: Array<{
  value: CalendarProvider;
  label: string;
  hint: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  { value: "google", label: "Google Calendar", hint: "Most common — recommended", icon: Calendar },
  { value: "outlook", label: "Microsoft Outlook", hint: "Office 365 / Exchange", icon: Mail },
  { value: "webcal", label: "WebCal / iCal feed", hint: "Read-only — paste a URL", icon: LinkIcon },
];

export default function Onboarding() {
  const navigate = useNavigate();
  const { isDemo } = useAuth();

  // If already done, skip immediately.
  useEffect(() => {
    const profile = managerApi.getProfile();
    if (profile.onboarding_profile_selected) navigate("/app", { replace: true });
  }, [navigate]);

  const [step, setStep] = useState<Step>("connect");
  const [provider, setProvider] = useState<CalendarProvider>("google");
  const [role, setRole] = useState<"ic" | "manager" | null>(null);
  const [busy, setBusy] = useState(false);

  // Pre-check connection — if the user already connected via Settings,
  // skip the connect step entirely.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const s = await api.authStatus();
        if (!cancelled && s.connected) setStep("profile");
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const continueFromConnect = async () => {
    if (isDemo) {
      // Demo: pretend the calendar is connected and move on.
      setStep("profile");
      return;
    }
    setBusy(true);
    try {
      const url = api.authConnectUrl(provider);
      // For mock mode, just pretend it succeeded and advance.
      // For a real backend, this redirects to the OAuth flow that returns
      // back to /auth/callback → which lands on /app/onboarding again.
      const status = await api.authStatus().catch(() => ({ connected: false }));
      if (status.connected || provider === "webcal") {
        setStep("profile");
      } else {
        window.location.href = url;
      }
    } finally {
      setBusy(false);
    }
  };

  const finish = async () => {
    if (!role) return;
    setBusy(true);
    try {
      managerApi.setProfile({
        is_manager: role === "manager",
        onboarding_profile_selected: true,
      });
      if (role === "manager") {
        // Fire-and-forget detection so the dashboard is populated when arrived.
        managerApi.detect().then((r) => {
          if (r.added > 0) toast.success(`${r.added} team member${r.added === 1 ? "" : "s"} detected from your 1:1s.`);
        }).catch(() => undefined);
        navigate("/app/team", { replace: true });
      } else {
        navigate("/app", { replace: true });
      }
    } finally {
      setBusy(false);
    }
  };

  const stepIndex = step === "connect" ? 0 : 1;

  return (
    <div className="min-h-screen bg-[#F7F8F4]">
      <header className="border-b border-border/60 bg-background/80 backdrop-blur">
        <div className="mx-auto flex h-14 w-full max-w-3xl items-center justify-between px-4 sm:px-6">
          <span className="font-serif text-lg tracking-tight text-foreground">Paceday</span>
          <span className="text-xs text-muted-foreground">Step {stepIndex + 1} of 2</span>
        </div>
      </header>

      <main className="mx-auto w-full max-w-2xl px-4 py-10 sm:px-6 sm:py-16">
        {step === "connect" ? (
          <section>
            <h1 className="font-serif text-[28px] leading-tight text-foreground">
              Connect your calendar
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Paceday reads your calendar to suggest focus blocks and protect your time.
              We never share your data.
            </p>

            <div className="mt-8 space-y-2">
              {PROVIDERS.map((p) => {
                const selected = provider === p.value;
                return (
                  <button
                    key={p.value}
                    type="button"
                    onClick={() => setProvider(p.value)}
                    className={
                      "flex w-full items-center gap-3 rounded-xl border bg-card p-4 text-left transition " +
                      (selected
                        ? "border-[#5B7FFF] ring-2 ring-[#5B7FFF]/20"
                        : "border-border hover:border-muted-foreground/30")
                    }
                  >
                    <span
                      className={
                        "flex h-9 w-9 items-center justify-center rounded-lg " +
                        (selected ? "bg-[#5B7FFF]/10 text-[#5B7FFF]" : "bg-muted text-muted-foreground")
                      }
                    >
                      <p.icon className="h-4 w-4" />
                    </span>
                    <span className="flex-1">
                      <span className="block text-sm font-medium text-foreground">{p.label}</span>
                      <span className="block text-xs text-muted-foreground">{p.hint}</span>
                    </span>
                    {selected && <Check className="h-4 w-4 text-[#5B7FFF]" />}
                  </button>
                );
              })}
            </div>

            <div className="mt-8 flex items-center justify-end gap-3">
              <button
                onClick={() => setStep("profile")}
                className="text-xs text-muted-foreground hover:text-foreground"
              >
                Skip for now
              </button>
              <Button
                onClick={continueFromConnect}
                disabled={busy}
                className="bg-[#5B7FFF] text-white hover:bg-[#5B7FFF]/90"
              >
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <>Continue<ChevronRight className="ml-1 h-4 w-4" /></>}
              </Button>
            </div>
          </section>
        ) : (
          <section>
            <h1 className="font-serif text-[28px] leading-tight text-foreground">
              How do you use your calendar?
            </h1>
            <p className="mt-2 text-sm text-[#6B7280]">
              We will tailor Paceday to your role. You can change this anytime in Settings.
            </p>

            <div className="mt-8 grid gap-4 sm:grid-cols-2">
              <RoleCard
                selected={role === "ic"}
                accent="#5B7FFF"
                icon={<User className="h-6 w-6" />}
                title="Individual contributor"
                description="I focus on deep work and want to protect focus time, track my habits, and avoid meeting overload."
                onClick={() => setRole("ic")}
              />
              <RoleCard
                selected={role === "manager"}
                accent="#9B7AE0"
                icon={<Users className="h-6 w-6" />}
                title="Manager"
                description="I manage a team, run 1:1s, and want to track my team's focus time alongside my own."
                onClick={() => setRole("manager")}
              />
            </div>

            <div className="mt-8 flex justify-end">
              <Button
                onClick={finish}
                disabled={!role || busy}
                className="w-full bg-[#5B7FFF] text-white hover:bg-[#5B7FFF]/90 sm:w-auto"
              >
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Continue"}
              </Button>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}

function RoleCard({
  selected,
  accent,
  icon,
  title,
  description,
  onClick,
}: {
  selected: boolean;
  accent: string;
  icon: React.ReactNode;
  title: string;
  description: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        "relative flex flex-col items-start gap-3 rounded-2xl border bg-card p-5 text-left transition " +
        (selected
          ? "ring-2"
          : "border-border hover:border-muted-foreground/30")
      }
      style={selected ? { borderColor: accent, ["--tw-ring-color" as string]: `${accent}33` } : undefined}
    >
      <span
        className="flex h-12 w-12 items-center justify-center rounded-xl"
        style={{ backgroundColor: `${accent}1A`, color: accent }}
      >
        {icon}
      </span>
      <span className="font-serif text-lg leading-tight text-foreground">{title}</span>
      <span className="text-sm text-muted-foreground">{description}</span>
      {selected && (
        <span
          className="absolute right-4 top-4 flex h-6 w-6 items-center justify-center rounded-full text-white"
          style={{ backgroundColor: accent }}
        >
          <Check className="h-3.5 w-3.5" />
        </span>
      )}
    </button>
  );
}
