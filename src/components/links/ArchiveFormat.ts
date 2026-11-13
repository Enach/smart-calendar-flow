import { UI_LOCALE } from "@/lib/locale";

/** PAC-40: a date the owner reads in the archive, e.g. "Tue, Nov 3, 2026". */
export function formatArchiveDate(iso: string): string {
  return new Date(iso).toLocaleDateString(UI_LOCALE, { weekday: "short", day: "numeric", month: "short", year: "numeric" });
}
