import { describe, expect, it } from "vitest";

import { AINotConfigured, AIStatus, LLMApiKeysSet, LLMTestRequest, LLMTestResult, Settings } from "@/api/generated/schemas";
import { mockLlmTest } from "@/api/client";
import type { Settings as AppSettings } from "@/api/types";
import {
  KEY_PROVIDERS,
  LLM_CHOICES,
  PROVIDER_LABELS,
  WHO_CAN_ENABLE,
  keyIsSetFor,
  noticeReason,
  providerOptions,
  providerSwitch,
} from "./aiProviders";

// NEW-llm-bring-your-own AC-33: every provider value the web code accepts or
// offers is exactly the contract's set for that use. No `ollama` anywhere.
describe("AI provider values follow the contract", () => {
  const settingsChoices = Settings.shape.llmProvider.options;
  const probeChoices = LLMTestRequest.shape.llmProvider.unwrap().options;
  const providers = AIStatus.shape.provider.unwrap().options;

  it("the hand-written choice list is the settings document's set, and the probe's", () => {
    expect([...LLM_CHOICES].sort()).toEqual([...settingsChoices].sort());
    expect([...LLM_CHOICES].sort()).toEqual([...probeChoices].sort());
  });

  it("the key-based providers are the provider enum of every response that names one", () => {
    for (const set of [
      providers,
      LLMTestResult.shape.provider.options,
      AINotConfigured.shape.provider.unwrap().options,
      Object.keys(LLMApiKeysSet.shape),
    ]) {
      expect([...KEY_PROVIDERS].sort()).toEqual([...set].sort());
    }
    expect(Object.keys(PROVIDER_LABELS).sort()).toEqual([...KEY_PROVIDERS].sort());
  });

  it("offers off and the five providers, never organisation, unsupported or ollama", () => {
    const values = (opts: ReturnType<typeof providerOptions>) => opts.filter((o) => !o.disabled).map((o) => o.value);
    for (const current of ["", "openai", "organization", "unsupported"] as const) {
      expect(values(providerOptions(current))).toEqual(["", "openai", "anthropic", "azure_openai", "bedrock", "vertex"]);
    }
    for (const current of ["unsupported", "organization", "openai"] as const) {
      const opts = providerOptions(current);
      expect(opts.map((o) => o.value)).not.toContain("ollama");
      // The stored choice is always representable in the select.
      expect(opts.map((o) => o.value)).toContain(current);
    }
    expect(providerOptions("unsupported").find((o) => o.value === "unsupported")?.label).toMatch(/no longer supported/i);
  });

  // Spec revision 2 (challenge of revision 1, Blocking 1) and D-21: until
  // Part 2 no organisation admin can set up AI, so no Part 1 user, in an
  // organisation or not, is offered an organisation option or organisation
  // copy. A stored "organization" (every new account) is shown, disabled, as
  // "No provider chosen".
  it("no Part 1 user sees organisation wording, whatever is stored", () => {
    for (const current of ["", "organization", "unsupported", "openai"] as const) {
      for (const label of providerOptions(current).map((o) => o.label)) expect(label).not.toMatch(/organi[sz]ation/i);
    }
    expect(providerOptions("organization").find((o) => o.value === "organization")).toEqual({
      value: "organization",
      label: "No provider chosen",
      disabled: true,
    });
  });

  // Contract challenge rev. 2, non-blocking 6: an unsaved provider switch must
  // not carry one provider's model to another.
  it("switching provider resets the model, and returning restores the saved one", () => {
    const saved = { llm_provider: "anthropic", llm_model: "claude-haiku-4-5-20251001" };
    expect(providerSwitch("openai", saved)).toMatchObject({ llm_provider: "openai", llm_model: "" });
    expect(providerSwitch("bedrock", saved)).toMatchObject({ llm_provider: "bedrock", llm_model: "" });
    expect(providerSwitch("anthropic", saved)).toMatchObject({ llm_provider: "anthropic", llm_model: "claude-haiku-4-5-20251001" });
    expect(providerSwitch("openai")).toMatchObject({ llm_provider: "openai", llm_model: "" });
  });

  // Contract challenge rev. 2.1, W-1: a switch drops the draft key and puts
  // the "key on file" flags back to what the server last reported.
  it("switching provider drops the draft key and restores the saved key flags", () => {
    const saved = {
      llm_provider: "openai",
      llm_model: "",
      llm_api_key_set: true,
      llm_api_keys_set: { openai: true, anthropic: true, azure_openai: false, bedrock: false, vertex: false },
    };
    const patch = providerSwitch("anthropic", saved);
    expect(patch).toEqual({
      llm_provider: "anthropic",
      llm_model: "",
      llm_api_key: undefined,
      llm_api_key_set: true,
      llm_api_keys_set: saved.llm_api_keys_set,
    });
    expect(patch).toHaveProperty("llm_api_key", undefined);
    expect(providerSwitch("openai")).toHaveProperty("llm_api_key", undefined);
  });

  it("the mock probe knows exactly the five providers", () => {
    const base = { llm_model: "", aws_region: "us-east-1", azure_endpoint: "https://x", azure_deployment: "d" } as AppSettings;
    for (const p of KEY_PROVIDERS) {
      expect(mockLlmTest({ ...base, llm_provider: p }).ok).toBe(true);
    }
    for (const p of ["", "organization", "unsupported", "ollama"]) {
      const res = mockLlmTest({ ...base, llm_provider: p });
      expect(res.ok).toBe(false);
      expect(res.message).not.toMatch(/ollama/i);
    }
    expect(mockLlmTest({ ...base, llm_provider: "azure_openai", azure_endpoint: "" }).ok).toBe(false);
  });
});

describe("who can turn AI on", () => {
  it("names only the user in Part 1, never an organisation admin", () => {
    expect(WHO_CAN_ENABLE).toBe("You can turn them on in Settings.");
    expect(WHO_CAN_ENABLE).not.toMatch(/admin|organi[sz]ation/i);
  });

  // Contract challenge rev. 2, non-blocking 6: the notice's heading already
  // says "AI features are off", so the reason line does not repeat it.
  it("the reason line drops the server's own 'AI features are off' lead", () => {
    expect(noticeReason({ reason: "needs_key", provider: "anthropic", enablers: ["user"], message: "AI features are off: Anthropic needs an API key. Add one in Settings." })).toBe(
      "Anthropic needs an API key. Add one in Settings.",
    );
    expect(noticeReason({ reason: "off", enablers: ["user"], message: "AI features are off: you turned them off in Settings." })).toBe(
      "You turned them off in Settings.",
    );
    expect(noticeReason({ reason: "needs_key", provider: "openai", enablers: ["user"], message: "OpenAI needs an API key. Enter one to test it." })).toBe(
      "OpenAI needs an API key. Enter one to test it.",
    );
  });
});

describe("key presence per provider", () => {
  it("reads the key bound to the chosen provider, not the saved one", () => {
    const s = {
      llm_provider: "openai",
      llm_api_key_set: true,
      llm_api_keys_set: { openai: true, anthropic: false, azure_openai: false, bedrock: false, vertex: false },
    } as AppSettings;
    expect(keyIsSetFor(s, "openai")).toBe(true);
    expect(keyIsSetFor(s, "anthropic")).toBe(false);
    expect(keyIsSetFor({ ...s, llm_api_keys_set: undefined }, "anthropic")).toBe(false);
    expect(keyIsSetFor({ ...s, llm_api_keys_set: undefined }, "openai")).toBe(true);
  });
});
