import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { Building2, CheckCircle2, Loader2, XCircle } from "lucide-react";

import {
  ORG_AI_STEPUP_PURPOSE,
  apiErrorMessage,
  fetchSsoStepupOptions,
  ssoStepupStartUrl,
  type SsoStepupOffer,
} from "@/api/client";
import type { SsoStepupProvider } from "@/api/generated/schemas";
import type { OrganizationAIConfiguration } from "@/api/types";
import { useOrganizationAI, usePatchOrganizationAI } from "@/hooks/useOrganizationAI";
import { KEY_PROVIDERS, PROVIDER_LABELS } from "@/lib/aiProviders";
import { formFrom, isOrgAIStepupLanding, orgAIChangeBody, type OrgAIForm } from "@/lib/orgAI";

// PAC-73 Part 2 (spec §3.6, P2-AC-30, P2-AC-32): the organisation's AI
// configuration in Settings. Every member sees the same values (never the
// key) and that an administrator of the organisation can change them. A
// change needs PAC-50's administrator confirmation for this purpose, once per
// change; the page explains it before navigating, and a break-glass operator
// with a fresh sign-in can save directly.

const STEPUP_PROVIDER_NAMES: Record<SsoStepupProvider, string> = {
  google: "Google Workspace",
  microsoft: "Microsoft 365",
};

/** What a known `without_stepup` code of this purpose means. */
const WITHOUT_STEPUP_TEXT: Record<string, string> = {
  organization_ai_configuration_writes:
    "Without it, nobody in your organisation can change its AI provider, model, key, destination or personal-keys setting in Paceday, except a deployment operator on the break-glass list.",
};

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

function destinationText(c: OrganizationAIConfiguration): string {
  switch (c.provider) {
    case "openai":
    case "anthropic":
      return c.baseUrl ? c.baseUrl : `${c.provider === "openai" ? "api.openai.com" : "api.anthropic.com"} (the provider's public host)`;
    case "azure_openai":
      return [c.azureEndpoint, c.azureDeployment && `deployment ${c.azureDeployment}`, c.azureApiVersion && `API version ${c.azureApiVersion}`]
        .filter(Boolean)
        .join(", ");
    case "bedrock":
      return `AWS region ${c.awsRegion || "us-east-1"}`;
    case "vertex":
      return "aiplatform.googleapis.com";
    default:
      return "None";
  }
}

function ReadView({ c }: { c: OrganizationAIConfiguration }) {
  const rows: Array<[string, string]> = [
    ["Provider", c.provider ? PROVIDER_LABELS[c.provider] : "Not set up"],
    ["Model", c.provider === "azure_openai" ? "Named by the deployment" : c.provider ? c.model || "The provider's default" : "None"],
    ["Destination", destinationText(c)],
    ["API key", c.keySet ? "A key is set" : "No key is set"],
    ["Personal API keys", c.personalKeysAllowed ? "Allowed: a member's own key is used for them" : "Not allowed: members use the organisation's AI"],
  ];
  return (
    <dl className="grid grid-cols-1 gap-x-4 gap-y-2 text-sm sm:grid-cols-[10rem_1fr]" data-testid="org-ai-read">
      {rows.map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="text-muted-foreground">{k}</dt>
          <dd className="break-words text-foreground">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

const inputCls =
  "h-10 w-full rounded-lg border border-input bg-background px-3 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20";

function Labeled({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1 text-sm">
      <span className="font-medium text-foreground">{label}</span>
      {children}
      {hint && <span className="block text-xs text-muted-foreground">{hint}</span>}
    </label>
  );
}

function StepupExplanation({ offer }: { offer: SsoStepupOffer }) {
  const losses = offer.withoutStepup.map((code) => WITHOUT_STEPUP_TEXT[code]).filter((t): t is string => !!t);
  return (
    <div className="space-y-3 rounded-lg border border-border bg-background p-3 text-sm text-foreground" data-testid="org-ai-stepup">
      <p>
        Changing your organisation's AI configuration needs a fresh confirmation with an administrator account of your
        organisation, for each change. It lasts 10 minutes.
      </p>
      {losses.map((t) => (
        <p key={t}>{t}</p>
      ))}
      {offer.providers.length === 0 ? (
        <p>No administrator confirmation can be started on this deployment: neither Google nor Microsoft sign-in is set up for it.</p>
      ) : (
        <ul className="space-y-3">
          {offer.providers.map((p) => (
            <li key={p}>
              <p className="font-medium">{STEPUP_PROVIDER_NAMES[p]}</p>
              <p className="mt-1">{STEPUP_PROVIDER_NAMES[p]} will ask you to allow Paceday these permissions, once, beyond your sign-in:</p>
              <ul className="mt-1 list-disc pl-5">
                {(offer.stepupScopes[p] ?? []).map((scope) => (
                  <li key={scope}>
                    <code className="break-all text-xs">{scope}</code>
                  </li>
                ))}
              </ul>
              <button
                type="button"
                onClick={() => window.location.assign(ssoStepupStartUrl(offer, p, ORG_AI_STEPUP_PURPOSE))}
                className="mt-2 h-10 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90"
              >
                Continue to {STEPUP_PROVIDER_NAMES[p]}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function StepupLanding() {
  const [params] = useSearchParams();
  if (!isOrgAIStepupLanding(params)) return null;
  if (params.get("stepup") === "granted") {
    return (
      <div role="status" data-testid="org-ai-stepup-outcome" className="mb-4 flex gap-2 rounded-lg border border-border bg-background p-3 text-sm">
        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
        <p>
          Administrator confirmation granted. It stays valid for 10 minutes and covers one change of your organisation's AI
          configuration. Nothing has been changed yet: make the change below.
        </p>
      </div>
    );
  }
  const reason = DENIAL_TEXT[params.get("reason") ?? ""];
  return (
    <div role="status" data-testid="org-ai-stepup-outcome" className="mb-4 flex gap-2 rounded-lg border border-border bg-background p-3 text-sm">
      <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" aria-hidden="true" />
      <p>{reason ? `Administrator confirmation was denied: ${reason}` : "Administrator confirmation was denied."}</p>
    </div>
  );
}

function EditForm({ shown, onDone }: { shown: OrganizationAIConfiguration; onDone: () => void }) {
  const [form, setForm] = useState<OrgAIForm>(() => formFrom(shown));
  const [base, setBase] = useState(shown);
  const [message, setMessage] = useState<{ kind: "error" | "info"; text: string } | null>(null);
  const [offer, setOffer] = useState<SsoStepupOffer | null>(null);
  const save = usePatchOrganizationAI();
  const set = <K extends keyof OrgAIForm>(k: K, v: OrgAIForm[K]) => setForm((f) => ({ ...f, [k]: v }));
  const p = form.provider;
  const providerChanged = p !== (base.provider ?? "");
  const forbiddingIncomplete = !form.personalKeysAllowed && base.personalKeysAllowed && !(p && (base.configured || form.apiKey));

  const submit = async () => {
    setMessage(null);
    setOffer(null);
    const body = orgAIChangeBody(base, form);
    if (!body) {
      setMessage({ kind: "info", text: "Nothing to save: nothing was changed." });
      return;
    }
    try {
      const res = await save.mutateAsync(body);
      switch (res.kind) {
        case "saved":
          onDone();
          return;
        case "conflict":
          setBase(res.configuration);
          setForm(formFrom(res.configuration));
          setMessage({
            kind: "info",
            text: "Another administrator changed the configuration first. It is shown below as it is now; your confirmation is kept for your next save.",
          });
          return;
        case "stepup_required":
          setOffer(res.offer);
          return;
        case "fresh_login_required":
          setMessage({ kind: "error", text: "Sign in again: a deployment operator's sign-in covers one change, made within 10 minutes of signing in." });
          return;
        default:
          setMessage({ kind: "error", text: "You are not in an organisation." });
      }
    } catch (e) {
      setMessage({ kind: "error", text: apiErrorMessage(e) });
    }
  };

  return (
    <div className="space-y-4" data-testid="org-ai-form">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Labeled label="Organisation AI provider">
          <select value={p} onChange={(e) => set("provider", e.target.value as OrgAIForm["provider"])} className={inputCls}>
            <option value="">{base.provider ? "Remove the configuration" : "Not set up"}</option>
            {KEY_PROVIDERS.map((k) => (
              <option key={k} value={k}>
                {PROVIDER_LABELS[k]}
              </option>
            ))}
          </select>
        </Labeled>
        {p && p !== "azure_openai" && (
          <Labeled label="Organisation model" hint="Leave empty for the provider's default model.">
            <input type="text" value={form.model} onChange={(e) => set("model", e.target.value)} className={inputCls} />
          </Labeled>
        )}
        {(p === "openai" || p === "anthropic") && (
          <Labeled
            label="Organisation base URL"
            hint="Optional: a gateway the deployment operator approved. Every member of your organisation can read this value."
          >
            <input type="text" value={form.baseUrl} onChange={(e) => set("baseUrl", e.target.value)} className={inputCls} />
          </Labeled>
        )}
        {p === "azure_openai" && (
          <>
            <Labeled label="Organisation Azure endpoint" hint="https://<host> only. Every member of your organisation can read this value.">
              <input type="text" value={form.azureEndpoint} onChange={(e) => set("azureEndpoint", e.target.value)} className={inputCls} />
            </Labeled>
            <Labeled label="Organisation deployment" hint="Every member of your organisation can read this value.">
              <input type="text" value={form.azureDeployment} onChange={(e) => set("azureDeployment", e.target.value)} className={inputCls} />
            </Labeled>
            <Labeled label="Organisation API version" hint="Leave empty for the default. Every member of your organisation can read this value.">
              <input type="text" value={form.azureApiVersion} onChange={(e) => set("azureApiVersion", e.target.value)} className={inputCls} />
            </Labeled>
          </>
        )}
        {p === "bedrock" && (
          <Labeled label="Organisation AWS region" hint="Every member of your organisation can read this value.">
            <input type="text" value={form.awsRegion} onChange={(e) => set("awsRegion", e.target.value)} className={inputCls} />
          </Labeled>
        )}
        {p && (
          <Labeled
            label="Organisation API key"
            hint={providerChanged ? "Required for a new provider. It is never shown again." : "Type a key to replace the saved one. It is never shown again."}
          >
            <input
              type="password"
              autoComplete="off"
              value={form.apiKey}
              onChange={(e) => set("apiKey", e.target.value)}
              className={inputCls}
              placeholder={!providerChanged && base.keySet ? "A key is set. Type to replace it" : "Paste an API key"}
            />
          </Labeled>
        )}
      </div>
      <label className="flex items-start gap-2 text-sm text-foreground">
        <input
          type="checkbox"
          checked={form.personalKeysAllowed}
          onChange={(e) => set("personalKeysAllowed", e.target.checked)}
          className="mt-0.5 h-4 w-4"
        />
        <span>Allow members to use their own API keys</span>
      </label>
      {forbiddingIncomplete && (
        <p role="alert" data-testid="org-ai-forbid-warning" className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-foreground">
          Your organisation's AI is not set up completely. If you turn personal keys off now, every member except those who
          turned AI off will have no AI until it is set up.
        </p>
      )}
      {message && (
        <p role={message.kind === "error" ? "alert" : "status"} className={message.kind === "error" ? "text-sm text-destructive" : "text-sm text-foreground"}>
          {message.text}
        </p>
      )}
      {offer && <StepupExplanation offer={offer} />}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={submit}
          disabled={save.isPending}
          className="flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90 disabled:opacity-50"
        >
          {save.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
          Save organisation AI
        </button>
        <button
          type="button"
          onClick={onDone}
          className="h-10 rounded-lg border border-border bg-background px-4 text-sm font-medium text-foreground transition hover:bg-muted"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

/**
 * The organisation AI section, for members only (a user with no organisation
 * sees nothing). Edit first explains the administrator confirmation for this
 * purpose and offers it; the form is available on a granted return, and to a
 * deployment operator who saves directly.
 */
export function OrganizationAISection({ inOrganization }: { inOrganization: boolean }) {
  const org = useOrganizationAI(inOrganization);
  const [params] = useSearchParams();
  const landed = isOrgAIStepupLanding(params);
  const [mode, setMode] = useState<"read" | "explain" | "edit">(landed && params.get("stepup") === "granted" ? "edit" : "read");
  const options = useQuery({
    queryKey: ["sso-stepup-options", ORG_AI_STEPUP_PURPOSE],
    queryFn: () => fetchSsoStepupOptions(ORG_AI_STEPUP_PURPOSE),
    enabled: inOrganization && mode === "explain",
    retry: false,
  });

  useEffect(() => {
    const el = landed ? document.getElementById("org-ai") : null;
    if (el && typeof el.scrollIntoView === "function") el.scrollIntoView({ block: "start" });
  }, [landed]);

  const shown = org.data;
  if (!inOrganization || (!shown && !org.isLoading)) return null;

  return (
    <section
      id="org-ai"
      data-testid="org-ai-section"
      aria-labelledby="org-ai-title"
      className="scroll-mt-20 rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-6"
    >
      <div className="mb-4 flex items-center gap-2">
        <Building2 className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
        <h2 id="org-ai-title" className="text-base font-semibold tracking-tight text-foreground">
          Your organisation's AI
        </h2>
      </div>
      <StepupLanding />
      {!shown ? (
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" aria-label="Loading" />
      ) : (
        <div className="space-y-4">
          <ReadView c={shown} />
          <p className="text-sm text-muted-foreground">An administrator of your organisation can change this.</p>
          {mode === "read" && (
            <button
              type="button"
              onClick={() => setMode("explain")}
              className="h-10 rounded-lg border border-border bg-background px-4 text-sm font-medium text-foreground transition hover:bg-muted"
            >
              Edit
            </button>
          )}
          {mode === "explain" && (
            <div className="space-y-3">
              {options.data && <StepupExplanation offer={options.data} />}
              {options.error && <p className="text-sm text-destructive">{apiErrorMessage(options.error)}</p>}
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setMode("edit")}
                  className="h-10 rounded-lg border border-border bg-background px-4 text-sm font-medium text-foreground transition hover:bg-muted"
                >
                  Edit without starting a confirmation
                </button>
                <button
                  type="button"
                  onClick={() => setMode("read")}
                  className="h-10 rounded-lg border border-border bg-background px-4 text-sm font-medium text-foreground transition hover:bg-muted"
                >
                  Not now
                </button>
              </div>
            </div>
          )}
          {mode === "edit" && <EditForm shown={shown} onDone={() => setMode("read")} />}
        </div>
      )}
    </section>
  );
}

