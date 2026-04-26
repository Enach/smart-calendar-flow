import { useState } from "react";
import { Link } from "react-router-dom";

import { AuthLayout } from "@/components/auth/AuthLayout";
import {
  ProviderButton,
  GoogleGlyph,
  MicrosoftGlyph,
  SsoGlyph,
} from "@/components/auth/ProviderButton";
import { SsoEmailForm } from "@/components/auth/SsoEmailForm";
import { toast } from "@/hooks/useToast";

export default function SignIn() {
  const [ssoOpen, setSsoOpen] = useState(false);
  const [pending, setPending] = useState<null | "google" | "microsoft" | "sso">(null);

  // UI-only handlers — auth wiring will plug into Lovable Cloud later.
  const stub = (provider: "google" | "microsoft" | "sso", workEmail?: string) => {
    setPending(provider);
    setTimeout(() => {
      setPending(null);
      toast.info(
        provider === "sso"
          ? `SSO discovery for ${workEmail} — auth not connected yet.`
          : `${provider === "google" ? "Google" : "Microsoft"} sign-in — auth not connected yet.`,
      );
    }, 600);
  };

  return (
    <AuthLayout
      eyebrow="Sign in"
      title={
        <>
          Welcome back<span className="text-primary">.</span>
        </>
      }
      subtitle="Pick up where Paceday left your day."
      footer={
        <>
          New to Paceday?{" "}
          <Link to="/signup" className="font-medium text-foreground underline-offset-4 hover:underline">
            Create an account
          </Link>
        </>
      }
    >
      <div className="space-y-2.5">
        <ProviderButton
          icon={<GoogleGlyph />}
          label="Continue with Google"
          onClick={() => stub("google")}
          disabled={pending !== null}
        />
        <ProviderButton
          icon={<MicrosoftGlyph />}
          label="Continue with Microsoft"
          onClick={() => stub("microsoft")}
          disabled={pending !== null}
        />
        <ProviderButton
          icon={<SsoGlyph />}
          label="Continue with SSO"
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

      <p className="mt-8 text-center text-xs leading-relaxed text-muted-foreground">
        By continuing you agree to our{" "}
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
