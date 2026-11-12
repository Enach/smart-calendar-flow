import { describe, expect, it } from "vitest";

import { OrganizationAIConfigurationUpdate } from "@/api/generated/schemas";
import type { OrganizationAIConfiguration } from "@/api/types";
import {
  forbidsWhileIncomplete,
  formFrom,
  isOrgAIStepupLanding,
  isSsoStepupLanding,
  orgAIChangeBody,
  preSaveNoticeText,
  preSaveNotices,
  type PreSaveNotice,
} from "./orgAI";

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

// PAC-87 (spec §3.6, P87-D6, PAC87-AC-17): what the administrator is told
// before saving. Members' confirmations cover the provider (owner OQ-P2-1).
describe("the organisation AI form's pre-save sentences", () => {
  const azure: OrganizationAIConfiguration = {
    ...openai,
    provider: "azure_openai",
    model: "",
    azureEndpoint: "https://a.openai.azure.com",
    azureDeployment: "d1",
    azureApiVersion: "2024-10-21",
  };
  const bedrock: OrganizationAIConfiguration = { ...openai, provider: "bedrock", model: "m", awsRegion: "eu-west-1" };
  const incomplete: OrganizationAIConfiguration = { configured: false, keySet: false, personalKeysAllowed: true, configurationVersion: 0, changeableBy: "organization_admin" };

  it("nothing changed: no sentence", () => {
    expect(preSaveNotices(openai, formFrom(openai))).toEqual([]);
  });

  it("a provider change or a removal: members are asked again", () => {
    expect(preSaveNotices(openai, { ...formFrom(openai), provider: "anthropic", apiKey: "sk-a" })).toEqual(["provider_changed"]);
    expect(preSaveNotices(openai, { ...formFrom(openai), provider: "" })).toEqual(["provider_removed"]);
    // First setup is a provider change too (P87-D1).
    expect(preSaveNotices(incomplete, { ...formFrom(incomplete), provider: "openai", apiKey: "sk-a" })).toEqual(["provider_changed"]);
  });

  it("a key or destination change only: members are not asked again", () => {
    const f = formFrom(openai);
    expect(preSaveNotices(openai, { ...f, apiKey: "sk-new" })).toEqual(["key_or_destination"]);
    expect(preSaveNotices(openai, { ...f, baseUrl: "https://gw.example" })).toEqual(["key_or_destination"]);
    const gw = { ...openai, baseUrl: "https://gw.example" };
    expect(preSaveNotices(gw, { ...formFrom(gw), baseUrl: "" })).toEqual(["key_or_destination"]);
    for (const k of ["azureEndpoint", "azureDeployment", "azureApiVersion"] as const) {
      expect(preSaveNotices(azure, { ...formFrom(azure), [k]: "changed" })).toEqual(["key_or_destination"]);
    }
    expect(preSaveNotices(bedrock, { ...formFrom(bedrock), awsRegion: "us-east-1" })).toEqual(["key_or_destination"]);
  });

  it("a model-only change says nothing about members", () => {
    expect(preSaveNotices(openai, { ...formFrom(openai), model: "gpt-x" })).toEqual([]);
  });

  it("forbidding personal keys: complete -> asked once, settings kept; incomplete -> only the existing warning", () => {
    expect(preSaveNotices(openai, { ...formFrom(openai), personalKeysAllowed: false })).toEqual(["forbid_complete"]);
    expect(preSaveNotices(openai, { ...formFrom(openai), personalKeysAllowed: false, apiKey: "sk-new" })).toEqual(["key_or_destination", "forbid_complete"]);
    const f = { ...formFrom(incomplete), personalKeysAllowed: false };
    expect(forbidsWhileIncomplete(incomplete, f)).toBe(true);
    expect(preSaveNotices(incomplete, f)).toEqual([]);
    expect(forbidsWhileIncomplete(openai, { ...formFrom(openai), personalKeysAllowed: false })).toBe(false);
  });

  it("the sentences say what happens, and never read/reads/see (PAC87-AC-15)", () => {
    const all: PreSaveNotice[] = ["provider_changed", "provider_removed", "key_or_destination", "forbid_complete"];
    for (const n of all) expect(preSaveNoticeText(n, "OpenAI")).not.toMatch(/\b(read|reads|see)\b/i);
    expect(preSaveNoticeText("provider_changed", "OpenAI")).toMatch(/will be asked to confirm again/);
    expect(preSaveNoticeText("provider_removed", "OpenAI")).toMatch(/will be asked to confirm again/);
    const kd = preSaveNoticeText("key_or_destination", "OpenAI");
    expect(kd).toMatch(/^Members are not asked to confirm again: they agreed to OpenAI/);
    expect(kd).toMatch(/another OpenAI account or to a gateway run by someone else/);
    expect(kd).toMatch(/without asking them again/);
    expect(kd).toMatch(/administrators can access them/);
    expect(preSaveNoticeText("forbid_complete", "OpenAI")).toMatch(/asked once to confirm.*Their own settings are kept/);
  });
});
