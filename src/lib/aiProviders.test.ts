import { describe, expect, it } from "vitest";

import { AINotConfigured, AIStatus, LLMApiKeysSet, LLMTestRequest, LLMTestResult, Settings } from "@/api/generated/schemas";
import { mockLlmTest } from "@/api/client";
import type { Settings as AppSettings } from "@/api/types";
import { KEY_PROVIDERS, LLM_CHOICES, PROVIDER_LABELS, keyIsSetFor, providerOptions, whoCanEnable } from "./aiProviders";

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

  it("offers off and the five providers, organisation only to a member, never unsupported or ollama", () => {
    const values = (opts: ReturnType<typeof providerOptions>) => opts.filter((o) => !o.disabled).map((o) => o.value);
    expect(values(providerOptions("openai", false))).toEqual(["", "openai", "anthropic", "azure_openai", "bedrock", "vertex"]);
    expect(values(providerOptions("openai", true))).toEqual(["", "organization", "openai", "anthropic", "azure_openai", "bedrock", "vertex"]);
    for (const current of ["unsupported", "organization", "openai"] as const) {
      for (const inOrg of [false, true]) {
        const opts = providerOptions(current, inOrg);
        expect(opts.map((o) => o.value)).not.toContain("ollama");
        expect(values(opts)).not.toContain("unsupported");
        // The stored choice is always representable in the select.
        expect(opts.map((o) => o.value)).toContain(current);
      }
    }
    expect(providerOptions("unsupported", false).find((o) => o.value === "unsupported")?.label).toMatch(/no longer supported/i);
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
  it("names the user, and the organisation's admin only when the server says so", () => {
    expect(whoCanEnable({ reason: "needs_key", provider: "anthropic", enablers: ["user"], message: "m" })).toBe(
      "You can turn them on in Settings.",
    );
    expect(whoCanEnable({ reason: "nothing_configured", enablers: ["user", "organization_admin"], message: "m" })).toBe(
      "You can turn them on in Settings, or your organisation's admin can.",
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
