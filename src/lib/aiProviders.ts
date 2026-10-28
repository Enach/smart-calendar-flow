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
 * The provider select's options: off and the five providers. Part 1 of the
 * spec has no organisation AI (no admin can set one up before Part 2), so
 * "use my organisation's AI" is offered to nobody yet (spec AC-21, revision 2).
 * A stored value that cannot be chosen is shown, disabled, so the select can
 * display it: unsupported as a former provider, and organization (the default
 * of every new account, in an organisation or not) under the neutral label
 * "No provider chosen" (D-21), so no Part 1 user sees an organisation option.
 */
export function providerOptions(current: LLMProvider | string): ProviderOption[] {
  const opts: ProviderOption[] = [{ value: "", label: "Off (AI features off)" }];
  if (current === "organization") {
    opts.push({ value: "organization", label: "No provider chosen", disabled: true });
  }
  for (const p of KEY_PROVIDERS) opts.push({ value: p, label: PROVIDER_LABELS[p] });
  if (current === "unsupported") {
    opts.push({ value: "unsupported", label: "Previous provider (no longer supported)", disabled: true });
  }
  return opts;
}

/**
 * Who can turn AI on. Until Part 2 of the spec is deployed only the user can
 * (spec §3, revision 2): no organisation admin has a way to configure AI, so
 * the page never sends the user to one.
 */
export const WHO_CAN_ENABLE = "You can turn them on in Settings.";

const OFF_PREFIX = "AI features are off: ";

/**
 * The reason line under the notice's "AI features are off" heading: the
 * server's sentence without its own "AI features are off: " lead, so the
 * notice does not say it twice. Any other sentence is shown as sent.
 */
export function noticeReason(nc: AINotConfigured): string {
  const m = nc.message;
  if (!m.startsWith(OFF_PREFIX) || m.length === OFF_PREFIX.length) return m;
  const rest = m.slice(OFF_PREFIX.length);
  return rest.charAt(0).toUpperCase() + rest.slice(1);
}

/** The saved settings a provider switch restores from. */
export type SavedProviderSettings = Pick<Settings, "llm_provider" | "llm_model" | "llm_api_key_set" | "llm_api_keys_set">;

/** What a provider switch changes in the draft. */
export type ProviderSwitchPatch = Pick<Settings, "llm_provider" | "llm_model" | "llm_api_key" | "llm_api_key_set" | "llm_api_keys_set">;

/**
 * The draft change when the user picks another provider. The general model
 * (OpenAI / Anthropic) is per provider in meaning, so it is not carried over:
 * it goes back to the saved model when the user returns to the saved
 * provider, and is otherwise emptied, which means the provider's default.
 * This keeps an unsaved switch from probing or saving one provider's model on
 * another (contract challenge rev. 2, non-blocking 6).
 *
 * The draft key goes too (contract challenge rev. 2.1, W-1). A key is bound to
 * the provider it was typed or removed for, so a switch drops the draft key
 * (`llm_api_key: undefined`, nothing sent) and puts the "key on file" flags
 * back to what the server last reported. Otherwise a key typed for OpenAI
 * would be tested against and saved for Anthropic, and "Remove saved key"
 * followed by a switch would send `llmApiKey: ""` for the new provider and
 * delete its key while keeping the one the user removed.
 */
export function providerSwitch(next: LLMProvider | string, saved?: SavedProviderSettings): ProviderSwitchPatch {
  const llm_model = saved && saved.llm_provider === next ? saved.llm_model : "";
  return {
    llm_provider: next,
    llm_model,
    llm_api_key: undefined,
    llm_api_key_set: saved?.llm_api_key_set,
    llm_api_keys_set: saved?.llm_api_keys_set,
  };
}

/** Whether a key bound to `provider` is on file, as the server last reported. */
export function keyIsSetFor(s: Settings, provider: KeyProvider): boolean {
  if (s.llm_api_keys_set) return !!s.llm_api_keys_set[provider];
  return s.llm_provider === provider && !!s.llm_api_key_set;
}

/**
 * The draft after "Remove saved key": the key bound to the chosen provider is
 * to be deleted on Save (`llm_api_key: ""`), and the page stops showing it as
 * on file. Only the chosen provider's key is affected; a switch afterwards
 * undoes this (see providerSwitch).
 */
export function removeSavedKey(d: Settings): Settings {
  if (!isKeyProvider(d.llm_provider)) return d;
  const keys = d.llm_api_keys_set ? { ...d.llm_api_keys_set, [d.llm_provider]: false } : d.llm_api_keys_set;
  return { ...d, llm_api_key: "", llm_api_key_set: false, llm_api_keys_set: keys };
}
