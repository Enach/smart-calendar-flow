
import { WEEKDAY_KEYS } from "@/api/client";
import type { DayInterval, LunchBreaks, WeekdayKey, WorkingHours } from "@/api/types";
import {
  WEEKDAY_LABELS,
  applyDefaultInterval,
  ensureAllDays,
  validateLunchBreaks,
  validateWorkingHours,
} from "@/lib/schedulingPresets";

const inputCls =
  "h-9 w-full rounded-lg border border-input bg-background px-2 text-sm text-foreground transition focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 disabled:opacity-50";

function DayRow({
  label,
  ariaLabel,
  value,
  onChange,
}: {
  label: string;
  /** Accessible name prefix; defaults to the visible label. */
  ariaLabel?: string;
  value: DayInterval;
  onChange: (next: DayInterval) => void;
}) {
  const name = ariaLabel ?? label;
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-2 sm:grid-cols-[130px_1fr_1fr_auto]">
      <label className="flex items-center gap-2 text-sm text-foreground">
        <input
          type="checkbox"
          checked={value.enabled}
          onChange={(e) => onChange({ ...value, enabled: e.target.checked })}
          className="h-4 w-4 rounded border-input text-primary focus:ring-primary"
          aria-label={`${name} enabled`}
        />
        {label}
      </label>
      <input
        type="time"
        step="900"
        value={value.start}
        disabled={!value.enabled}
        onChange={(e) => onChange({ ...value, start: e.target.value })}
        className={inputCls}
        aria-label={`${name} start`}
      />
      <input
        type="time"
        step="900"
        value={value.end}
        disabled={!value.enabled}
        onChange={(e) => onChange({ ...value, end: e.target.value })}
        className={inputCls}
        aria-label={`${name} end`}
      />
      <span className="hidden text-[11px] text-muted-foreground sm:block">
        {value.enabled ? "" : "Off"}
      </span>
    </div>
  );
}


export function WorkingHoursEditor({
  value,
  onChange,
}: {
  value: WorkingHours;
  onChange: (next: WorkingHours) => void;
}) {
  const error = validateWorkingHours(value);
  const days = ensureAllDays(value).days;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {(["all_days", "by_day"] as const).map((mode) => (
          <button
            key={mode}
            type="button"
            onClick={() =>
              onChange(mode === "by_day" ? ensureAllDays({ ...value, mode }) : { ...value, mode })
            }
            className={
              "rounded-lg border px-3 py-1.5 text-xs font-medium transition " +
              (value.mode === mode
                ? "border-primary bg-primary/10 text-foreground"
                : "border-border text-muted-foreground hover:text-foreground")
            }
          >
            {mode === "all_days" ? "Same hours every day" : "Customize by day"}
          </button>
        ))}
      </div>

      {value.mode === "all_days" ? (
        <DayRow
          label="Every day"
          value={value.default}
          onChange={(next) => onChange(applyDefaultInterval(value, next))}
        />
      ) : (
        <div className="space-y-2">
          {WEEKDAY_KEYS.map((key: WeekdayKey) => (
            <DayRow
              key={key}
              label={WEEKDAY_LABELS[key]}
              value={days[key]!}
              onChange={(next) => onChange({ ...value, days: { ...days, [key]: next } })}
            />
          ))}
        </div>
      )}

      {error && (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}

export function LunchBreaksEditor({
  value,
  onChange,
}: {
  value: LunchBreaks;
  onChange: (next: LunchBreaks) => void;
}) {
  const error = validateLunchBreaks(value);
  return (
    <div className="space-y-2">
      {WEEKDAY_KEYS.map((key) => {
        const day = value[key] ?? { enabled: false, start: "12:30", end: "13:30" };
        return (
          <DayRow
            key={key}
            label={WEEKDAY_LABELS[key]}
            ariaLabel={`${WEEKDAY_LABELS[key]} lunch`}
            value={day}
            onChange={(next) => onChange({ ...value, [key]: next })}
          />
        );
      })}
      {error && (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
