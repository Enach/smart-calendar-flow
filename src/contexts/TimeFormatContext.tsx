import { createContext, useContext, type ReactNode } from "react";

import { useSettings } from "@/hooks/useSettings";
import { asTimeFormat, DEFAULT_TIME_FORMAT, type TimeFormat } from "@/lib/timeFormat";

const TimeFormatContext = createContext<TimeFormat>(DEFAULT_TIME_FORMAT);

/**
 * Provides the signed-in user's time format (PAC-55) from their settings.
 * While settings load, or if they cannot be loaded, it is 12-hour.
 */
export function TimeFormatProvider({ children }: { children: ReactNode }) {
  const { data } = useSettings();
  return <TimeFormatContext.Provider value={asTimeFormat(data?.time_format)}>{children}</TimeFormatContext.Provider>;
}

/** Explicit value, for tests and for surfaces that pin the format. */
export function TimeFormatValue({ value, children }: { value: TimeFormat; children: ReactNode }) {
  return <TimeFormatContext.Provider value={value}>{children}</TimeFormatContext.Provider>;
}

export function useTimeFormat(): TimeFormat {
  return useContext(TimeFormatContext);
}
