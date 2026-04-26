import { useState } from "react";
import { z } from "zod";
import { Mail, ArrowRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface SsoFormProps {
  open: boolean;
  onCancel: () => void;
  onContinue: (workEmail: string) => void;
  loading?: boolean;
}

const ssoSchema = z.object({
  email: z
    .string()
    .trim()
    .min(1, { message: "Enter your work email." })
    .email({ message: "That doesn't look like a valid email." })
    .max(255),
});

/**
 * Inline SSO prompt: rendered as an expandable strip beneath the social
 * buttons so the page never feels modal-heavy.
 */
export function SsoEmailForm({ open, onCancel, onContinue, loading }: SsoFormProps) {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = ssoSchema.safeParse({ email });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Invalid email");
      return;
    }
    setError(null);
    onContinue(parsed.data.email);
  };

  return (
    <form
      onSubmit={submit}
      className="mt-3 space-y-2.5 rounded-lg border border-border bg-card/60 p-3.5"
    >
      <Label htmlFor="sso-email" className="text-xs font-medium text-muted-foreground">
        Work email
      </Label>
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Mail className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            id="sso-email"
            type="email"
            autoFocus
            placeholder="you@company.com"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              if (error) setError(null);
            }}
            className="h-10 rounded-md border-border bg-background pl-9 text-sm"
            aria-invalid={!!error}
            aria-describedby={error ? "sso-email-error" : undefined}
          />
        </div>
        <Button
          type="submit"
          disabled={loading}
          className="h-10 rounded-md bg-primary px-4 text-sm text-primary-foreground hover:bg-primary/90"
        >
          Continue
          <ArrowRight className="ml-1 h-3.5 w-3.5" />
        </Button>
      </div>
      {error && (
        <p id="sso-email-error" className="text-xs text-destructive">
          {error}
        </p>
      )}
      <button
        type="button"
        onClick={onCancel}
        className="text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
      >
        Cancel
      </button>
    </form>
  );
}
