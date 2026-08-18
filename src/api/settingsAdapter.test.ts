import { describe, expect, it } from "vitest";

import { normalizeSettings, settingsRequestBody } from "./client";
import { defaultWorkingHours, templatePatch } from "@/lib/schedulingPresets";
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

  it("sends camelCase fields in the PUT body and drops empty lunch overrides", () => {
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
    expect(body.lunchBreaks).toBeUndefined();
    expect(body.working_hours).toBeUndefined();
    expect(body.work_start).toBe("09:00");
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
