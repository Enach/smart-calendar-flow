import { describe, expect, it } from "vitest";

import { llmTestBody, normalizeSettings, settingsPatchBody, settingsRequestBody } from "./client";
import {
  clampMinuteSettings,
  defaultWorkingHours,
  templatePatch,
  validateLunchWithinWorkingHours,
  workingHoursCapacity,
} from "@/lib/schedulingPresets";
import type { Settings } from "./types";

const base = {
  timezone: "Europe/Paris",
  work_start: "09:00",
  work_end: "18:00",
  lunch_start: "12:30",
  lunch_end: "13:30",
  protect_lunch: true,
} as unknown as Settings;

describe("settings adapter", () => {
  it("maps backend workingHours/lunchBreaks into snake_case frontend fields", () => {
    const out = normalizeSettings({
      ...base,
      workingHours: {
        mode: "by_day",
        default: { enabled: true, start: "09:00", end: "18:00" },
        days: { monday: { enabled: true, start: "08:30", end: "17:30" }, sunday: { enabled: false, start: "09:00", end: "18:00" } },
      },
      lunchBreaks: { monday: { enabled: true, start: "12:00", end: "13:00" } },
    });
    expect(out.working_hours?.mode).toBe("by_day");
    expect(out.working_hours?.days.monday).toEqual({ enabled: true, start: "08:30", end: "17:30" });
    expect(out.lunch_breaks?.monday?.start).toBe("12:00");
    expect((out as unknown as Record<string, unknown>).workingHours).toBeUndefined();
  });

  it("omits the new fields when the backend does not return them", () => {
    const out = normalizeSettings(base);
    expect(out.working_hours).toBeUndefined();
    expect(out.lunch_breaks).toBeUndefined();
  });

  it("sends camelCase fields and an empty lunchBreaks map when there are no overrides", () => {
    const body = settingsRequestBody({
      ...base,
      working_hours: {
        mode: "all_days",
        default: { enabled: true, start: "09:00", end: "18:00" },
        days: {},
      },
      lunch_breaks: {},
    });
    expect(body.workingHours).toBeTruthy();
    expect(body.lunchBreaks).toEqual({});
    expect(body.working_hours).toBeUndefined();
    expect(body.workStart).toBe("09:00");
    expect(body.work_start).toBeUndefined();
  });

  // Shape of a real GET /api/settings response (seeded e2e backend): every
  // property is camelCase, per the contract's Settings schema.
  const backendPayload = {
    workStart: "09:00",
    workEnd: "18:00",
    timezone: "UTC",
    focusMinBlockMinutes: 25,
    focusMaxBlockMinutes: 120,
    focusDailyTargetMinutes: 240,
    outOfHoursMeetingsPerWeek: 0,
    autoDeclineOutsideWorkingHours: false,
    focusLabel: "Focus Time",
    focusColor: "#4F46E5",
    lunchStart: "12:00",
    lunchEnd: "13:00",
    protectLunch: true,
    bufferBeforeMinutes: 5,
    bufferAfterMinutes: 5,
    workingHours: { mode: "all_days", default: { enabled: true, start: "09:00", end: "18:00" }, days: {} },
    lunchBreaks: {},
    compressionEnabled: false,
    autoScheduleEnabled: false,
    autoScheduleCron: "0 8 * * *",
    llmProvider: "openai",
    llmModel: "",
    calendarProvider: "google",
    recapEnabled: false,
  };

  it("reads every camelCase setting from the backend payload", () => {
    const out = normalizeSettings(backendPayload);
    expect(out.work_start).toBe("09:00");
    expect(out.focus_min_block_minutes).toBe(25);
    expect(out.focus_max_block_minutes).toBe(120);
    expect(out.focus_daily_target_minutes).toBe(240);
    expect(out.focus_label).toBe("Focus Time");
    expect(out.focus_color).toBe("#4F46E5");
    expect(out.protect_lunch).toBe(true);
    expect(out.buffer_before_minutes).toBe(5);
    expect(out.auto_schedule_cron).toBe("0 8 * * *");
    expect(out.llm_provider).toBe("openai");
    expect(out.calendar_provider).toBe("google");
    const bag = out as unknown as Record<string, unknown>;
    expect(bag.focusDailyTargetMinutes).toBeUndefined();
    expect(bag.workStart).toBeUndefined();
  });

  it("sends an edited setting back under its camelCase name", () => {
    const edited = { ...normalizeSettings(backendPayload), focus_daily_target_minutes: 180, protect_lunch: false };
    const body = settingsRequestBody(edited);
    expect(body.focusDailyTargetMinutes).toBe(180);
    expect(body.protectLunch).toBe(false);
    expect(body.focus_daily_target_minutes).toBeUndefined();
    expect(body.protect_lunch).toBeUndefined();
    // Properties the frontend does not model are carried through.
    expect(body.recapEnabled).toBe(false);
  });

  it("maps and persists the meeting policy fields", () => {
    const out = normalizeSettings({
      ...base,
      outOfHoursMeetingsPerWeek: 3,
      autoDeclineOutsideWorkingHours: true,
    });
    expect(out.out_of_hours_meetings_per_week).toBe(3);
    expect(out.auto_decline_outside_working_hours).toBe(true);

    const body = settingsRequestBody({
      ...base,
      out_of_hours_meetings_per_week: 3,
      auto_decline_outside_working_hours: true,
    });
    expect(body.outOfHoursMeetingsPerWeek).toBe(3);
    expect(body.autoDeclineOutsideWorkingHours).toBe(true);
    expect(body.out_of_hours_meetings_per_week).toBeUndefined();
  });
});

describe("working-hours draft seeding", () => {
  it("seeds a full week from the global work_start/work_end pair", () => {
    const hours = defaultWorkingHours("09:00", "18:00");
    expect(hours.mode).toBe("all_days");
    expect(hours.days.monday).toEqual({ enabled: true, start: "09:00", end: "18:00" });
    expect(hours.days.saturday?.enabled).toBe(false);
  });

  it("applies a template to workingHours even when the server omitted the field", () => {
    const patch = templatePatch("focus_first", base);
    expect(patch?.work_start).toBe("08:30");
    expect(patch?.working_hours?.default).toEqual({ enabled: true, start: "08:30", end: "17:30" });
    expect(patch?.working_hours?.days.monday?.end).toBe("17:30");
  });
});

describe("working-hours bounds", () => {
  const hours = defaultWorkingHours("09:00", "18:00");

  it("computes the minimum daily capacity after lunch", () => {
    expect(workingHoursCapacity(hours, undefined, "12:30", "13:30", true)).toBe(480);
  });

  it("rejects lunch outside the selected work window", () => {
    expect(validateLunchWithinWorkingHours(hours, undefined, "08:00", "09:00", true)).toContain(
      "lunch must stay inside working hours",
    );
    expect(validateLunchWithinWorkingHours(hours, undefined, "08:00", "09:00", false)).toBeNull();
  });

  it("clamps focus and buffer values without changing the out-of-hours override", () => {
    const clamped = clampMinuteSettings({
      ...base,
      work_start: "09:00",
      work_end: "18:00",
      focus_min_block_minutes: 600,
      focus_max_block_minutes: 600,
      focus_daily_target_minutes: 600,
      buffer_before_minutes: 600,
      buffer_after_minutes: 600,
      out_of_hours_meetings_per_week: 4,
    });
    expect(clamped.focus_max_block_minutes).toBe(480);
    expect(clamped.buffer_after_minutes).toBe(480);
    expect(clamped.out_of_hours_meetings_per_week).toBe(4);
  });
});

const patchPayload = {
  workStart: "09:00",
  workEnd: "18:00",
  timezone: "UTC",
  focusDailyTargetMinutes: 240,
  lunchStart: "12:00",
  lunchEnd: "13:00",
  protectLunch: true,
  workingHours: { mode: "all_days", default: { enabled: true, start: "09:00", end: "18:00" }, days: {} },
  lunchBreaks: {},
  llmProvider: "openai",
  llmModel: "",
  recapEnabled: false,
};

// PAC-24: PATCH /api/settings merges, so the body carries only what changed,
// only contract properties, and the key only when the user typed or cleared it.
describe("PATCH body", () => {
  const read = { ...normalizeSettings({ ...patchPayload, llmApiKeySet: true, updatedAt: "2026-10-12T10:00:00Z" }), calendar_id: "primary" } as Settings;

  it("is empty when nothing changed", () => {
    expect(settingsPatchBody({ ...read }, read)).toEqual({});
  });

  it("carries only the changed properties, in camelCase", () => {
    expect(settingsPatchBody({ ...read, focus_daily_target_minutes: 180, timezone: "Europe/Paris" }, read)).toEqual({
      focusDailyTargetMinutes: 180,
      timezone: "Europe/Paris",
    });
  });

  it("never sends properties the contract does not have, or read-only ones", () => {
    const body = settingsPatchBody({ ...read, calendar_id: "work", teams_enabled: true, llm_api_key_set: false }, read);
    expect(body).toEqual({});
  });

  it("sends the key only when typed or cleared", () => {
    expect(settingsPatchBody({ ...read }, read).llmApiKey).toBeUndefined();
    expect(settingsPatchBody({ ...read, llm_api_key: "sk-new" }, read)).toEqual({ llmApiKey: "sk-new" });
    expect(settingsPatchBody({ ...read, llm_api_key: "" }, read)).toEqual({ llmApiKey: "" });
  });

  it("removes the last per-day lunch override with an empty map", () => {
    const withLunch = { ...read, lunch_breaks: { monday: { enabled: true, start: "12:00", end: "13:00" } } } as Settings;
    expect(settingsPatchBody({ ...withLunch, lunch_breaks: undefined }, withLunch)).toEqual({ lunchBreaks: {} });
  });

  it("probes with provider, model and an unsaved key only", () => {
    expect(llmTestBody({ ...read, llm_provider: "openai", llm_model: "gpt-4o", llm_base_url: "https://x" })).toEqual({
      llmProvider: "openai",
      llmModel: "gpt-4o",
    });
    expect(llmTestBody({ ...read, llm_provider: "openai", llm_api_key: "sk-try" }).llmApiKey).toBe("sk-try");
  });
});

// API-039: provider values the server uses that the app did not know.
describe("provider values", () => {
  it("maps the backend conferencingProvider to the app's default provider and back", () => {
    const read = normalizeSettings({ ...patchPayload, conferencingProvider: "meet" });
    expect(read.default_conference_provider).toBe("google_meet");
    expect((read as unknown as Record<string, unknown>).conferencingProvider).toBeUndefined();
    expect(settingsPatchBody({ ...read, default_conference_provider: "zoom" }, read)).toEqual({ conferencingProvider: "zoom" });
    expect(settingsPatchBody({ ...read, default_conference_provider: "google_meet" }, read)).toEqual({});
  });

  it("keeps vertex and the empty provider, and maps the Vertex and Bedrock models", () => {
    const read = normalizeSettings({ ...patchPayload, llmProvider: "vertex", vertexModel: "gemini", bedrockModel: "anthropic.claude-sonnet-4-5-20251001-v1:0" });
    expect(read.llm_provider).toBe("vertex");
    expect(read.vertex_model).toBe("gemini");
    // NEW-llm-bring-your-own D-16: the Bedrock picker reads and writes bedrockModel.
    expect(read.bedrock_model).toBe("anthropic.claude-sonnet-4-5-20251001-v1:0");
    expect(settingsPatchBody({ ...read, bedrock_model: "m2", llm_provider: "" }, read)).toEqual({
      bedrockModel: "m2",
      llmProvider: "",
    });
  });
});

// NEW-llm-bring-your-own: keys bound to providers, the read-only AI status,
// the removed settings and the unbound legacy key.
describe("AI settings", () => {
  const aiPayload = {
    ...patchPayload,
    llmProvider: "unsupported",
    llmApiKeySet: false,
    llmApiKeysSet: { openai: true, anthropic: false, azure_openai: false, bedrock: false, vertex: false },
    llmUnboundApiKeySet: true,
    aiStatus: {
      configured: false,
      inOrganization: true,
      notConfigured: { reason: "provider_removed", enablers: ["user", "organization_admin"], message: "AI features are off: Ollama is no longer supported." },
    },
  };
  const read = normalizeSettings(aiPayload);

  it("reads the key flags and the AI status", () => {
    expect(read.llm_provider).toBe("unsupported");
    expect(read.llm_api_keys_set?.openai).toBe(true);
    expect(read.llm_unbound_api_key_set).toBe(true);
    expect(read.ai_status?.notConfigured?.reason).toBe("provider_removed");
    expect(read.ai_status?.inOrganization).toBe(true);
    const bag = read as unknown as Record<string, unknown>;
    expect(bag.aiStatus).toBeUndefined();
    expect(bag.llmApiKeysSet).toBeUndefined();
  });

  it("writes an unsupported document back as nothing, and never sends read-only AI fields", () => {
    expect(settingsPatchBody({ ...read }, read)).toEqual({});
    expect(
      settingsPatchBody(
        { ...read, llm_api_keys_set: { ...read.llm_api_keys_set!, anthropic: true }, llm_unbound_api_key_set: false, ai_status: undefined },
        read,
      ),
    ).toEqual({});
  });

  it("removes the unbound key only when asked", () => {
    expect(settingsPatchBody({ ...read, llm_unbound_api_key: "" }, read)).toEqual({ llmUnboundApiKey: "" });
  });

  it("never sends the removed settings", () => {
    const stale = { ...read, aws_profile: "p", gcp_project: "g", gcp_location: "l", ollama_base_url: "http://x" } as unknown as Settings;
    expect(settingsPatchBody(stale, read)).toEqual({});
  });

  it("probes an unsupported saved choice with the value the read returned", () => {
    expect(llmTestBody(read)).toEqual({ llmProvider: "unsupported", llmModel: "" });
  });
});
