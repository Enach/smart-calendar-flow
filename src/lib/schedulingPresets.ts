/**
 * Frontend-only scheduling presets.
 *
 * A template only produces a *draft patch*: it is persisted through the
 * existing settings adapter (PUT /api/settings) when the user presses
 * "Save changes". No new endpoint and no new backend field are introduced.
 */
import { WEEKDAY_KEYS } from "@/api/client";
import type { DayInterval, LunchBreaks, Settings, WeekdayKey, WorkingHours } from "@/api/types";

export type SchedulingTemplateId = "balanced" | "focus_first" | "custom";

export interface SchedulingTemplate {
  id: SchedulingTemplateId;
  label: string;
  description: string;
  /** Undefined for "custom": nothing is applied, all fields stay editable. */
  values?: {
    work_start: string;
    work_end: string;
    focus_min_block_minutes: number;
    focus_max_block_minutes: number;
    focus_daily_target_minutes: number;
    lunch_start: string;
    lunch_end: string;
    buffer_before_minutes: number;
    buffer_after_minutes: number;
  };
}

export const SCHEDULING_TEMPLATES: SchedulingTemplate[] = [
  {
    id: "balanced",
    label: "Balanced",
    description: "09:00–18:00, 60–180 min focus blocks, 3 h daily target, lunch 12:30–13:30, 5 min buffers.",
    values: {
      work_start: "09:00",
      work_end: "18:00",
      focus_min_block_minutes: 60,
      focus_max_block_minutes: 180,
      focus_daily_target_minutes: 180,
      lunch_start: "12:30",
      lunch_end: "13:30",
      buffer_before_minutes: 5,
      buffer_after_minutes: 5,
    },
  },
  {
    id: "focus_first",
    label: "Focus first",
    description: "08:30–17:30, 90–180 min focus blocks, 4 h daily target, lunch 12:00–13:00, 10 min buffers.",
    values: {
      work_start: "08:30",
      work_end: "17:30",
      focus_min_block_minutes: 90,
      focus_max_block_minutes: 180,
      focus_daily_target_minutes: 240,
      lunch_start: "12:00",
      lunch_end: "13:00",
      buffer_before_minutes: 10,
      buffer_after_minutes: 10,
    },
  },
  {
    id: "custom",
    label: "Custom",
    description: "Edit every field yourself.",
  },
];

export const WEEKDAY_LABELS: Record<WeekdayKey, string> = {
  monday: "Monday",
  tuesday: "Tuesday",
  wednesday: "Wednesday",
  thursday: "Thursday",
  friday: "Friday",
  saturday: "Saturday",
  sunday: "Sunday",
};

const WEEKEND: WeekdayKey[] = ["saturday", "sunday"];

/** Detect which template (if any) the current settings already match. */
export function matchTemplate(settings: Settings): SchedulingTemplateId {
  for (const template of SCHEDULING_TEMPLATES) {
    if (!template.values) continue;
    const same = (Object.keys(template.values) as Array<keyof typeof template.values>).every(
      (key) => settings[key] === template.values![key],
    );
    if (same) return template.id;
  }
  return "custom";
}

/** Build the draft patch for a template. Returns null for "custom". */
export function templatePatch(id: SchedulingTemplateId, current: Settings): Partial<Settings> | null {
  const template = SCHEDULING_TEMPLATES.find((t) => t.id === id);
  if (!template?.values) return null;
  const patch: Partial<Settings> = { ...template.values, protect_lunch: true };
  if (current.working_hours) {
    patch.working_hours = applyDefaultInterval(current.working_hours, {
      enabled: true,
      start: template.values.work_start,
      end: template.values.work_end,
    });
  }
  return patch;
}

/** Replace the default interval, keeping every enabled day in sync in all_days mode. */
export function applyDefaultInterval(hours: WorkingHours, next: DayInterval): WorkingHours {
  if (hours.mode === "by_day") return { ...hours, default: next };
  const days: WorkingHours["days"] = {};
  for (const key of WEEKDAY_KEYS) {
    const existing = hours.days[key];
    days[key] = {
      enabled: existing ? existing.enabled : !WEEKEND.includes(key),
      start: next.start,
      end: next.end,
    };
  }
  return { ...hours, default: next, days };
}

/** Seed a full Monday→Sunday map from the default interval. */
export function ensureAllDays(hours: WorkingHours): WorkingHours {
  const days: WorkingHours["days"] = { ...hours.days };
  for (const key of WEEKDAY_KEYS) {
    if (!days[key]) {
      days[key] = {
        enabled: !WEEKEND.includes(key),
        start: hours.default.start,
        end: hours.default.end,
      };
    }
  }
  return { ...hours, days };
}

export function emptyLunchBreaks(lunchStart: string, lunchEnd: string): LunchBreaks {
  const out: LunchBreaks = {};
  for (const key of WEEKDAY_KEYS) {
    out[key] = { enabled: !WEEKEND.includes(key), start: lunchStart, end: lunchEnd };
  }
  return out;
}

const HHMM_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Validate an editable interval. Returns null when valid. */
export function validateInterval(interval: DayInterval, label: string): string | null {
  if (!interval.enabled) return null;
  if (!HHMM_RE.test(interval.start) || !HHMM_RE.test(interval.end)) {
    return `${label}: use the HH:MM format.`;
  }
  if (interval.end <= interval.start) {
    return `${label}: the end time must be after the start time.`;
  }
  return null;
}

/** Validate the whole working-hours object. Returns the first error, or null. */
export function validateWorkingHours(hours: WorkingHours): string | null {
  if (hours.mode === "all_days") return validateInterval(hours.default, "Working hours");
  for (const key of WEEKDAY_KEYS) {
    const day = hours.days[key];
    if (!day) continue;
    const err = validateInterval(day, WEEKDAY_LABELS[key]);
    if (err) return err;
  }
  return null;
}

export function validateLunchBreaks(breaks: LunchBreaks): string | null {
  for (const key of WEEKDAY_KEYS) {
    const day = breaks[key];
    if (!day) continue;
    const err = validateInterval(day, `${WEEKDAY_LABELS[key]} lunch`);
    if (err) return err;
  }
  return null;
}
