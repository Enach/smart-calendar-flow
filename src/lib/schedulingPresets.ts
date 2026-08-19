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
  const base = current.working_hours ?? defaultWorkingHours(current.work_start, current.work_end);
  patch.working_hours = applyDefaultInterval(base, {
    enabled: true,
    start: template.values.work_start,
    end: template.values.work_end,
  });
  return patch;
}

/**
 * Seed a full workingHours object from the global work_start/work_end fields.
 * Used only to initialise the editable draft when GET /api/settings omitted the
 * field; the saved value always round-trips through PUT /api/settings.
 */
export function defaultWorkingHours(start: string, end: string): WorkingHours {
  return ensureAllDays({
    mode: "all_days",
    default: { enabled: true, start, end },
    days: {},
  });
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

function minutes(value: string): number {
  const [hours, mins] = value.split(":").map(Number);
  return hours * 60 + mins;
}

function dayIntervals(hours: WorkingHours): Array<[WeekdayKey, DayInterval]> {
  if (hours.mode === "all_days") return WEEKDAY_KEYS.map((key) => [key, hours.default]);
  return WEEKDAY_KEYS.flatMap((key) => {
    const interval = hours.days[key];
    return interval ? [[key, interval] as [WeekdayKey, DayInterval]] : [];
  });
}

/** The most restrictive enabled day capacity, excluding the effective lunch break. */
export function workingHoursCapacity(
  hours: WorkingHours,
  lunchBreaks: LunchBreaks | undefined,
  lunchStart: string,
  lunchEnd: string,
  protectLunch: boolean,
): number {
  const capacities = dayIntervals(hours)
    .filter(([, interval]) => interval.enabled && HHMM_RE.test(interval.start) && HHMM_RE.test(interval.end))
    .map(([key, interval]) => {
      let available = minutes(interval.end) - minutes(interval.start);
      const lunch = lunchBreaks?.[key] ?? {
        enabled: protectLunch,
        start: lunchStart,
        end: lunchEnd,
      };
      if (lunch.enabled && HHMM_RE.test(lunch.start) && HHMM_RE.test(lunch.end)) {
        const overlapStart = Math.max(minutes(interval.start), minutes(lunch.start));
        const overlapEnd = Math.min(minutes(interval.end), minutes(lunch.end));
        if (overlapEnd > overlapStart) available -= overlapEnd - overlapStart;
      }
      return Math.max(0, available);
    });
  return capacities.length > 0 ? Math.min(...capacities) : 0;
}

/** Return the common time bounds for controls that apply to every enabled day. */
export function workingHoursBounds(hours: WorkingHours): { start?: string; end?: string } {
  const intervals = dayIntervals(hours).filter(([, interval]) => interval.enabled && HHMM_RE.test(interval.start) && HHMM_RE.test(interval.end));
  if (intervals.length === 0) return {};
  return {
    start: intervals.reduce((latest, [, interval]) => (interval.start > latest ? interval.start : latest), intervals[0][1].start),
    end: intervals.reduce((earliest, [, interval]) => (interval.end < earliest ? interval.end : earliest), intervals[0][1].end),
  };
}

/** Validate global and per-day lunch values against their corresponding work windows. */
export function validateLunchWithinWorkingHours(
  hours: WorkingHours,
  lunchBreaks: LunchBreaks | undefined,
  lunchStart: string,
  lunchEnd: string,
  protectLunch: boolean,
): string | null {
  if (!protectLunch) return null;
  for (const [key, interval] of dayIntervals(hours)) {
    if (!interval.enabled) continue;
    const lunch = lunchBreaks?.[key] ?? { enabled: true, start: lunchStart, end: lunchEnd };
    if (!lunch.enabled) continue;
    if (lunch.start < interval.start || lunch.end > interval.end) {
      return `${WEEKDAY_LABELS[key]} lunch must stay inside working hours.`;
    }
  }
  return null;
}

/** Keep minute selectors coherent when the working window becomes smaller. */
export function clampMinuteSettings(settings: Settings): Settings {
  const hours = settings.working_hours ?? defaultWorkingHours(settings.work_start, settings.work_end);
  const capacity = workingHoursCapacity(hours, settings.lunch_breaks, settings.lunch_start, settings.lunch_end, settings.protect_lunch);
  if (capacity <= 0) return settings;
  const clamp = (value: number) => Math.min(Math.max(0, value), capacity);
  return {
    ...settings,
    focus_min_block_minutes: clamp(settings.focus_min_block_minutes),
    focus_max_block_minutes: clamp(settings.focus_max_block_minutes),
    focus_daily_target_minutes: clamp(settings.focus_daily_target_minutes),
    buffer_before_minutes: clamp(settings.buffer_before_minutes),
    buffer_after_minutes: clamp(settings.buffer_after_minutes),
  };
}