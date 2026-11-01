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

