/**
 * Seeded mock calendar events for demo mode.
 *
 * Pushes the spec's 7 fixtures into the existing mock state owned by
 * `src/api/client.ts` so the calendar reads them through the regular
 * `getEvents` fallback. Idempotent — safe to call multiple times.
 */

import { _mockHelpers } from "@/api/client";

const DEMO_PREFIX = "demo-";

interface DemoEventSpec {
  id: string;
  dayOffset: number; // from Monday of current week
  startH: number;
  startM: number;
  endH: number;
  endM: number;
  title: string;
  color: string;
}

const DEMO_EVENTS: DemoEventSpec[] = [
  { id: "d1", dayOffset: 0, startH: 9, startM: 0, endH: 9, endM: 15, title: "Team standup", color: "#E9B949" },
  { id: "d2", dayOffset: 0, startH: 10, startM: 0, endH: 12, endM: 0, title: "Focus block — spec", color: "#5B7FFF" },
  { id: "d3", dayOffset: 1, startH: 14, startM: 0, endH: 14, endM: 30, title: "1:1 with Sarah", color: "#E9B949" },
  { id: "d4", dayOffset: 2, startH: 9, startM: 0, endH: 11, endM: 30, title: "Deep work — feature", color: "#5B7FFF" },
  { id: "d5", dayOffset: 2, startH: 15, startM: 0, endH: 16, endM: 0, title: "Design review", color: "#E9B949" },
  { id: "d6", dayOffset: 3, startH: 10, startM: 0, endH: 12, endM: 0, title: "Focus block — writing", color: "#5B7FFF" },
  { id: "d7", dayOffset: 4, startH: 10, startM: 0, endH: 11, endM: 0, title: "All-hands", color: "#9B7AE0" },
];

function startOfWeek(d: Date) {
  const x = new Date(d);
  const day = x.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  x.setDate(x.getDate() + diff);
  x.setHours(0, 0, 0, 0);
  return x;
}

export function seedDemoEvents() {
  const helpers = _mockHelpers;
  const monday = startOfWeek(new Date());
  // Remove any prior demo events so re-seeding stays idempotent.
  helpers.removeEventsWithPrefix(DEMO_PREFIX);
  for (const ev of DEMO_EVENTS) {
    const d = new Date(monday);
    d.setDate(d.getDate() + ev.dayOffset);
    const start = new Date(d);
    start.setHours(ev.startH, ev.startM, 0, 0);
    const end = new Date(d);
    end.setHours(ev.endH, ev.endM, 0, 0);
    const isFocus = /focus|deep work/i.test(ev.title);
    helpers.pushEvent({
      id: `${DEMO_PREFIX}${ev.id}`,
      title: ev.title,
      start: start.toISOString(),
      end: end.toISOString(),
      color: ev.color,
      is_focus_block: isFocus || undefined,
    });
  }
}

export function clearDemoEvents() {
  _mockHelpers.removeEventsWithPrefix(DEMO_PREFIX);
}
