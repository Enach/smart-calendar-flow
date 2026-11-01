import { describe, expect, it } from "vitest";

import { OrganizationAIConfigurationUpdate } from "@/api/generated/schemas";
import type { OrganizationAIConfiguration } from "@/api/types";
import { formFrom, isOrgAIStepupLanding, isSsoStepupLanding, orgAIChangeBody } from "./orgAI";

// PAC-73 Part 2 (spec §3.6, P2-AC-30, P2-AC-32): the organisation AI form's
// body and the two sections' step-up landings.

const openai: OrganizationAIConfiguration = {
  configured: true,
  provider: "openai",
  model: "gpt-4o-mini",
  baseUrl: "",
  keySet: true,
  personalKeysAllowed: true,
  configurationVersion: 3,
  updatedAt: "2026-10-28T09:00:00Z",
  changeableBy: "organization_admin",
};

describe("step-up landings", () => {
  const p = (q: string) => new URLSearchParams(q);
  it("an SSO landing is PAC-50's exactly; a purpose landing belongs to its own section", () => {
    expect(isSsoStepupLanding(p("stepup=granted"))).toBe(true);
    expect(isSsoStepupLanding(p("stepup=denied&reason=not_admin"))).toBe(true);
    expect(isSsoStepupLanding(p("stepup=granted&purpose=llm_org_key_write"))).toBe(false);
    expect(isSsoStepupLanding(p("stepup=denied&reason=not_admin&purpose=llm_org_key_write"))).toBe(false);
    expect(isOrgAIStepupLanding(p("stepup=granted&purpose=llm_org_key_write"))).toBe(true);
    expect(isOrgAIStepupLanding(p("stepup=denied&reason=not_admin&purpose=llm_org_key_write"))).toBe(true);
    expect(isOrgAIStepupLanding(p("stepup=granted"))).toBe(false);
    expect(isOrgAIStepupLanding(p("tab=ai"))).toBe(false);
  });
});

describe("the organisation AI change body", () => {
  const valid = (b: unknown) => expect(OrganizationAIConfigurationUpdate.safeParse(b).success).toBe(true);

  it("names the version shown and sends only what changed; the key only when typed", () => {
    const f = formFrom(openai);
    expect(f.apiKey).toBe("");
    expect(orgAIChangeBody(openai, f)).toBeNull();
    const b1 = orgAIChangeBody(openai, { ...f, model: "gpt-4o" });
    expect(b1).toEqual({ configurationVersion: 3, model: "gpt-4o" });
    valid(b1);
    const b2 = orgAIChangeBody(openai, { ...f, apiKey: "sk-new", personalKeysAllowed: false });
    expect(b2).toEqual({ configurationVersion: 3, apiKey: "sk-new", personalKeysAllowed: false });
    valid(b2);
  });

  it("a provider change carries the provider, its values and the key; removal is sent alone", () => {
    const b = orgAIChangeBody(openai, { ...formFrom(openai), provider: "azure_openai", apiKey: "k", azureEndpoint: "https://x.openai.azure.com", azureDeployment: "d" });
    expect(b).toEqual({ configurationVersion: 3, provider: "azure_openai", apiKey: "k", azureEndpoint: "https://x.openai.azure.com", azureDeployment: "d" });
    valid(b);
    expect(b).not.toHaveProperty("model");
    const rm = orgAIChangeBody(openai, { ...formFrom(openai), provider: "", apiKey: "ignored" });
    expect(rm).toEqual({ configurationVersion: 3, provider: "" });
    valid(rm);
  });

  it("a first setup names version 0", () => {
    const empty: OrganizationAIConfiguration = { configured: false, keySet: false, personalKeysAllowed: true, configurationVersion: 0, changeableBy: "organization_admin" };
    const b = orgAIChangeBody(empty, { ...formFrom(empty), provider: "vertex", apiKey: "k" });
    expect(b).toEqual({ configurationVersion: 0, provider: "vertex", apiKey: "k" });
    valid(b);
    expect(orgAIChangeBody(empty, { ...formFrom(empty), personalKeysAllowed: false })).toEqual({ configurationVersion: 0, personalKeysAllowed: false });
  });
});
