import { useState } from "react";
import { Link } from "react-router-dom";
import { CheckCircle2 } from "lucide-react";

import { AuthLayout } from "@/components/auth/AuthLayout";
import {
  ProviderButton,
  GoogleGlyph,
  MicrosoftGlyph,
  SsoGlyph,
} from "@/components/auth/ProviderButton";
import { SsoEmailForm } from "@/components/auth/SsoEmailForm";
import { toast } from "@/hooks/useToast";

const HIGHLIGHTS = [
  "Focus blocks defended automatically",
  "Meetings trimmed to the right length",
  "Conflicts resolved before you notice",
];

export default function SignUp() {
  const [ssoOpen, setSsoOpen] = useState(false);
  const [pending, setPending] = useState<null | "google" | "microsoft" | "sso">(null);

  const stub = (provider: "google" | "microsoft" | "sso", workEmail?: string) => {
    setPending(provider);
    setTimeout(() => {
      setPending(null);
      toast.info(
        provider === "sso"
          ? `SSO discovery for ${workEmail} — auth not connected yet.`
          : `${provider === "google" ? "Google" : "Microsoft"} sign-up — auth not connected yet.`,
      );
    }, 600);
  };

  return (
    <AuthLayout
      eyebrow="Create your account"
      title={
        <>
          Own your day<span className="text-primary">.</span>
        </>
      }
      subtitle="Connect your calendar in under a minute. Paceday handles the rest."
      footer={
        <>
          Already have an account?{" "}
          <Link to="/signin" className="font-medium text-foreground underline-offset-4 hover:underline">
            Sign in
          </Link>
        </>
      }
    >
      <div className="space-y-2.5">
        <ProviderButton
          icon={<GoogleGlyph />}
          label="Sign up with Google"
          onClick={() => stub("google")}
          disabled={pending !== null}
        />
        <ProviderButton
          icon={<MicrosoftGlyph />}
          label="Sign up with Microsoft"
          onClick={() => stub("microsoft")}
          disabled={pending !== null}
        />
        <ProviderButton
          icon={<SsoGlyph />}
          label="Sign up with SSO"
          onClick={() => setSsoOpen((v) => !v)}
          disabled={pending !== null}
        />
      </div>

      <SsoEmailForm
        open={ssoOpen}
        onCancel={() => setSsoOpen(false)}
        onContinue={(email) => stub("sso", email)}
        loading={pending === "sso"}
      />

      <ul className="mt-8 space-y-2.5 rounded-lg border border-border bg-card/60 p-4">
        {HIGHLIGHTS.map((h) => (
          <li key={h} className="flex items-start gap-2.5 text-sm text-foreground/85">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" />
            <span>{h}</span>
          </li>
        ))}
      </ul>

      <p className="mt-6 text-center text-xs leading-relaxed text-muted-foreground">
        By creating an account you agree to our{" "}
        <a href="#" className="underline-offset-4 hover:text-foreground hover:underline">
          Terms
        </a>{" "}
        and{" "}
        <a href="#" className="underline-offset-4 hover:text-foreground hover:underline">
          Privacy Policy
        </a>
        .
      </p>
    </AuthLayout>
  );
}
