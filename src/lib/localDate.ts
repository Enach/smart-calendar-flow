/**
 * YYYY-MM-DD of the calendar day `d` falls on in the user's timezone.
 *
 * `d.toISOString().slice(0, 10)` returns the UTC day instead: at local
 * midnight anywhere east of UTC that is the previous day.
 */
export function localISODate(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** YYYY-MM-DD of the Monday of the week containing the local date `iso`. */
export function mondayOf(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  const day = date.getDay();
  date.setDate(date.getDate() + (day === 0 ? -6 : 1 - day));
  return localISODate(date);
}
