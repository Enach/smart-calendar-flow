import type { KeyProvider, OrganizationAIConfiguration, OrganizationAIConfigurationUpdate } from "@/api/types";
import { ORG_AI_STEPUP_PURPOSE } from "@/api/client";

// PAC-73 Part 2: pure helpers of the organisation AI section and the SSO
// section's landing (spec §3.6, P2-AC-30, P2-AC-32).

/**
 * Whether the landing is an SSO step-up outcome. A step-up started for
 * another purpose lands with `&purpose=...` and is shown by the section of
 * that purpose, never by the SSO section (P2-AC-32).
 */
export function isSsoStepupLanding(params: URLSearchParams): boolean {
  const stepup = params.get("stepup");
  return (stepup === "granted" || stepup === "denied") && !params.has("purpose");
}

/** The landing of a step-up started for this purpose (P2-AC-32). */
export function isOrgAIStepupLanding(params: URLSearchParams): boolean {
  const stepup = params.get("stepup");
  return (stepup === "granted" || stepup === "denied") && params.get("purpose") === ORG_AI_STEPUP_PURPOSE;
}

/** The form's values; `apiKey` is only ever what the admin typed. */
export interface OrgAIForm {
  provider: KeyProvider | "";
  model: string;
  apiKey: string;
  baseUrl: string;
  azureEndpoint: string;
  azureDeployment: string;
  azureApiVersion: string;
  awsRegion: string;
  personalKeysAllowed: boolean;
}

export function formFrom(c: OrganizationAIConfiguration): OrgAIForm {
  return {
    provider: c.provider ?? "",
    model: c.model ?? "",
    apiKey: "",
    baseUrl: c.baseUrl ?? "",
    azureEndpoint: c.azureEndpoint ?? "",
    azureDeployment: c.azureDeployment ?? "",
    azureApiVersion: c.azureApiVersion ?? "",
    awsRegion: c.awsRegion ?? "",
    personalKeysAllowed: c.personalKeysAllowed,
  };
}

/**
 * The patchOrganizationAI body for the form against the configuration shown:
 * the version shown, and only what changed (merge semantics). A provider
 * change sends every value the new provider takes, and the key; removing the
 * provider sends it alone. The key is sent only when typed.
 */
export function orgAIChangeBody(shown: OrganizationAIConfiguration, f: OrgAIForm): OrganizationAIConfigurationUpdate | null {
  const body: OrganizationAIConfigurationUpdate = { configurationVersion: shown.configurationVersion };
  const was = formFrom(shown);
  if (f.provider === "" && was.provider !== "") {
    return { configurationVersion: shown.configurationVersion, provider: "" };
  }
  const providerChanged = f.provider !== was.provider;
  if (providerChanged) body.provider = f.provider;
  const p = f.provider;
  const changed = (k: keyof OrgAIForm) => providerChanged || f[k] !== was[k];
  if (p && p !== "azure_openai" && changed("model") && (f.model !== "" || !providerChanged)) body.model = f.model;
  if ((p === "openai" || p === "anthropic") && changed("baseUrl") && (f.baseUrl !== "" || !providerChanged)) body.baseUrl = f.baseUrl;
  if (p === "azure_openai") {
    for (const k of ["azureEndpoint", "azureDeployment", "azureApiVersion"] as const) {
      if (changed(k) && (f[k] !== "" || !providerChanged)) body[k] = f[k];
    }
  }
  if (p === "bedrock" && changed("awsRegion") && (f.awsRegion !== "" || !providerChanged)) body.awsRegion = f.awsRegion;
  if (f.apiKey !== "") body.apiKey = f.apiKey;
  if (f.personalKeysAllowed !== was.personalKeysAllowed) body.personalKeysAllowed = f.personalKeysAllowed;
  return Object.keys(body).length > 1 ? body : null;
}


/**
 * Forbidding personal keys while the organisation's AI is not set up
 * completely (owner OQ-P2-3: allowed, with the existing warning).
 */
export function forbidsWhileIncomplete(shown: OrganizationAIConfiguration, f: OrgAIForm): boolean {
  return !f.personalKeysAllowed && shown.personalKeysAllowed && !(f.provider && (shown.configured || f.apiKey));
}

/** What the administrator is told before saving (PAC-87 §3.6, P87-D6). */
export type PreSaveNotice = "provider_changed" | "provider_removed" | "key_or_destination" | "forbid_complete";

const DESTINATION_FIELDS = ["apiKey", "baseUrl", "azureEndpoint", "azureDeployment", "azureApiVersion", "awsRegion"] as const;

/**
 * PAC-87 (spec §3.6, PAC87-AC-17): which of the pre-save sentences the form
 * shows for the change it would send. Members' confirmations cover the
 * provider (owner OQ-P2-1), so a provider change or a removal re-asks them,
 * and a key or destination change does not. Forbidding personal keys on a
 * complete configuration moves members on their own key after one
 * confirmation (OQ-P2-2); on an incomplete one the existing warning
 * (`forbidsWhileIncomplete`) is shown instead, unchanged.
 */
export function preSaveNotices(shown: OrganizationAIConfiguration, f: OrgAIForm): PreSaveNotice[] {
  const body = orgAIChangeBody(shown, f);
  if (!body) return [];
  const out: PreSaveNotice[] = [];
  if (body.provider === "") out.push("provider_removed");
  else if (body.provider !== undefined) out.push("provider_changed");
  else if (DESTINATION_FIELDS.some((k) => body[k] !== undefined)) out.push("key_or_destination");
  if (body.personalKeysAllowed === false && !forbidsWhileIncomplete(shown, f)) out.push("forbid_complete");
  return out;
}

/**
 * The sentence for each pre-save notice. None says "read", "reads" or "see"
 * (PAC87-AC-15). `providerLabel` names the provider kept by a key or
 * destination change.
 */
export function preSaveNoticeText(n: PreSaveNotice, providerLabel: string): string {
  switch (n) {
    case "provider_changed":
      return "Every member who uses your organisation's AI will be asked to confirm again before anything is sent to the new provider.";
    case "provider_removed":
      return "Every member who uses your organisation's AI will be asked to confirm again before anything is sent, even if the same provider is set up again later.";
    case "key_or_destination":
      return (
        `Members are not asked to confirm again: they agreed to ${providerLabel}, and this change keeps it. ` +
        `If this key or address belongs to another ${providerLabel} account or to a gateway run by someone else, ` +
        `your members' text and meeting details are sent there from the next request on without asking them again, ` +
        `and its administrators can access them.`
      );
    case "forbid_complete":
      return "Members who use their own key will be asked once to confirm, then use your organisation's AI. Their own settings are kept and used again if you allow personal keys.";
  }
}
