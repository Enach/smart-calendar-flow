import type { AINotConfigured, KeyProvider, LLMProvider, Settings } from "@/api/types";

/**
 * NEW-llm-bring-your-own: Paceday runs AI only on a key the user (or, later,
 * their organisation) brings. These lists mirror the contract's enums and are
 * pinned to them by aiProviders.test.ts (AC-33).
 */

/** Every value of Settings.llmProvider / LLMTestRequest.llmProvider. */
export const LLM_CHOICES: readonly LLMProvider[] = [
  "",
  "organization",
  "unsupported",
  "openai",
  "anthropic",
  "azure_openai",
  "bedrock",
  "vertex",
];

/** The five key-based providers, in the order Settings offers them. */
export const KEY_PROVIDERS: readonly KeyProvider[] = ["openai", "anthropic", "azure_openai", "bedrock", "vertex"];

export const PROVIDER_LABELS: Record<KeyProvider, string> = {
  openai: "OpenAI",
  anthropic: "Anthropic",
  azure_openai: "Azure OpenAI",
  bedrock: "AWS Bedrock",
  vertex: "Google Vertex AI",
};

/** What each provider's key is called, so the user pastes the right one. */
export const KEY_HINTS: Record<KeyProvider, string> = {
  openai: "An OpenAI API key.",
  anthropic: "An Anthropic API key.",
  azure_openai: "An Azure OpenAI resource key, sent in the api-key header.",
  bedrock: "An Amazon Bedrock API key for the region below.",
  vertex: "A Vertex AI express-mode API key.",
};

export function isKeyProvider(v: string): v is KeyProvider {
  return (KEY_PROVIDERS as readonly string[]).includes(v);
}

export interface ProviderOption {
  value: LLMProvider;
  label: string;
  disabled?: boolean;
}

/**
 * The provider select's options: off and the five providers; "use my
 * organisation's AI" only for a member of an organisation (spec AC-21). A
 * stored value that cannot be chosen (unsupported, or organization for a user
 * with none) is shown, disabled, so the select can display it.
 */
export function providerOptions(current: LLMProvider | string, inOrganization: boolean): ProviderOption[] {
  const opts: ProviderOption[] = [{ value: "", label: "Off (AI features off)" }];
  if (inOrganization) {
    opts.push({ value: "organization", label: "Use my organisation's AI" });
  } else if (current === "organization") {
    opts.push({ value: "organization", label: "Not set up yet", disabled: true });
  }
  for (const p of KEY_PROVIDERS) opts.push({ value: p, label: PROVIDER_LABELS[p] });
  if (current === "unsupported") {
    opts.push({ value: "unsupported", label: "Previous provider (no longer supported)", disabled: true });
  }
  return opts;
}

/** Who can turn AI on, from the server's enablers. */
export function whoCanEnable(nc: AINotConfigured): string {
  return nc.enablers.includes("organization_admin")
    ? "You can turn them on in Settings, or your organisation's admin can."
    : "You can turn them on in Settings.";
}

/** Whether a key bound to `provider` is on file, as the server last reported. */
export function keyIsSetFor(s: Settings, provider: KeyProvider): boolean {
  if (s.llm_api_keys_set) return !!s.llm_api_keys_set[provider];
  return s.llm_provider === provider && !!s.llm_api_key_set;
}
