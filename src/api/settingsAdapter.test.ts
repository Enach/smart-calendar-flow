import { describe, expect, it } from "vitest";

import { normalizeSettings, settingsRequestBody } from "./client";
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
