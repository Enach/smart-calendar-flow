/**
 * Demo-only (PAC-83): the seeded calendar, settings, rooms and directory the
 * demo shows, and the demo implementation of every `api` operation. Loaded
 * only through src/api/demoGate.ts in a demo session of a non-production
 * build; never part of a production bundle.
 */
import type { CalendarEventDTO, CompressionApplyResponse } from "@/api/contract";
import type {
  AuditEntry,
  AuthStatus,
  Attendee,
  CalendarEvent,
  CalendarProvider,
  ConferenceLink,
  ConferenceProvider,
  ConferenceProviderStatus,
  CoverageStatus,
  FocusBlock,
  FocusRunBlock,
  FocusRunResult,
  FreeBusyResponse,
  LLMTestResult,
  MoveProposal,
  ParseResult,
  ParticipantCoverage,
  PersonalCalendar,
  PersonalCalendarType,
  ProviderDisconnectResult,
  CalendarRoom,
  Settings,
  SuggestedSlot,
  CompressionResult,
} from "@/api/types";
import { DEFAULT_AUDIT_LIMIT } from "@/api/client";
import { PROVIDER_LABELS, isKeyProvider } from "@/lib/aiProviders";

const DEFAULT_SETTINGS: Settings = {
  work_start: "09:00",
  work_end: "18:00",
  timezone: "Europe/Paris",
  focus_min_block_minutes: 60,
  focus_max_block_minutes: 180,
  focus_daily_target_minutes: 180,
  out_of_hours_meetings_per_week: 0,
  auto_decline_outside_working_hours: false,
  focus_label: "Focus Time",
  focus_color: "#7C3AED",
  lunch_start: "12:30",
  lunch_end: "13:30",
  protect_lunch: true,
  buffer_before_minutes: 5,
  buffer_after_minutes: 5,
  compression_enabled: true,
  auto_schedule_enabled: true,
  auto_schedule_cron: "0 7 * * 1-5",
  llm_provider: "openai",
  llm_model: "gpt-4o-mini",
  llm_api_key: "",
  llm_base_url: "",
  calendar_id: "primary",
  calendar_provider: "google",
  webcal_url: "",
  aws_region: "us-east-1",
  azure_endpoint: "",
  azure_deployment: "",
  azure_api_version: "2024-02-01",
  default_conference_provider: "google_meet",
  teams_enabled: false,
  // Preview-only defaults so the day-by-day editor is explorable offline.
  working_hours: {
    mode: "all_days",
    default: { enabled: true, start: "09:00", end: "18:00" },
    days: {
      monday: { enabled: true, start: "09:00", end: "18:00" },
      tuesday: { enabled: true, start: "09:00", end: "18:00" },
      wednesday: { enabled: true, start: "09:00", end: "18:00" },
      thursday: { enabled: true, start: "09:00", end: "18:00" },
      friday: { enabled: true, start: "09:00", end: "18:00" },
      saturday: { enabled: false, start: "09:00", end: "13:00" },
      sunday: { enabled: false, start: "09:00", end: "13:00" },
    },
  },
};


/**
 * Demo rooms have exactly what a live room has (PAC-41 D-5, AC-10): a name and
 * an identifier that is a room address the live event save accepts.
 */
const MOCK_ROOMS: CalendarRoom[] = [
  { id: "c_demo-helsinki@resource.calendar.google.com", name: "Helsinki" },
  { id: "c_demo-reykjavik@resource.calendar.google.com", name: "Reykjavik" },
  { id: "c_demo-oslo@resource.calendar.google.com", name: "Oslo" },
  { id: "c_demo-stockholm@resource.calendar.google.com", name: "Stockholm" },
  { id: "c_demo-copenhagen@resource.calendar.google.com", name: "Copenhagen" },
  { id: "c_demo-phone-booth-a@resource.calendar.google.com", name: "Phone Booth A" },
  { id: "c_demo-phone-booth-b@resource.calendar.google.com", name: "Phone Booth B" },
];

const MOCK_DIRECTORY: Attendee[] = [
  { email: "alice@co.com", name: "Alice Martin" },
  { email: "bob@co.com", name: "Bob Chen" },
  { email: "carol@co.com", name: "Carol Diaz" },
  { email: "david@co.com", name: "David Okonkwo" },
  { email: "emma@co.com", name: "Emma Laurent" },
  { email: "felix@co.com", name: "Felix Weber" },
  { email: "grace@co.com", name: "Grace Park" },
  { email: "client@acme.com", name: "Acme Client" },
  { email: "pm@co.com", name: "Pat Morgan" },
  { email: "team@co.com", name: "All Hands" },
];

const mockState = {
  settings: { ...DEFAULT_SETTINGS },
  auth: { connected: true, email: "you@example.com", provider: "google" as CalendarProvider } as AuthStatus,
  events: [] as CalendarEvent[],
  focusBlocks: [] as FocusBlock[],
  audit: [] as AuditEntry[],
  personalCalendars: [] as PersonalCalendar[],
  conference: {
    zoom: { connected: false, email: undefined as string | undefined },
  },
  nextEventId: 1000,
  nextFocusId: 1,
  nextAuditId: 1,
  nextPersonalId: 1,
};

function pad(n: number) {
  return n < 10 ? `0${n}` : `${n}`;
}
function isoAt(date: Date, h: number, m: number) {
  const d = new Date(date);
  d.setHours(h, m, 0, 0);
  return d.toISOString();
}
function dateOnly(d: Date) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function startOfWeek(d: Date) {
  const x = new Date(d);
  const day = x.getDay();
  const diff = day === 0 ? -6 : 1 - day; // Monday
  x.setDate(x.getDate() + diff);
  x.setHours(0, 0, 0, 0);
  return x;
}
function logAudit(action: string, details: string) {
  mockState.audit.unshift({
    id: mockState.nextAuditId++,
    action,
    details,
    created_at: new Date().toISOString(),
  });
  mockState.audit = mockState.audit.slice(0, 50);
}

function seedMocks() {
  if (mockState.events.length > 0) return;
  const monday = startOfWeek(new Date());
  const sample: Array<{ day: number; sh: number; sm: number; eh: number; em: number; title: string; color: string; att?: string[] }> = [
    { day: 0, sh: 9, sm: 30, eh: 10, em: 0, title: "Standup", color: "#3B82F6", att: ["alice@co.com", "bob@co.com"] },
    { day: 0, sh: 14, sm: 0, eh: 15, em: 0, title: "1:1 with Alice", color: "#10B981", att: ["alice@co.com"] },
    { day: 1, sh: 11, sm: 0, eh: 12, em: 0, title: "Product review", color: "#F59E0B", att: ["pm@co.com"] },
    { day: 1, sh: 16, sm: 0, eh: 17, em: 0, title: "Design sync", color: "#EC4899" },
    { day: 2, sh: 10, sm: 0, eh: 10, em: 30, title: "Standup", color: "#3B82F6" },
    { day: 2, sh: 15, sm: 30, eh: 16, em: 30, title: "Customer call", color: "#06B6D4", att: ["client@gmail.com", "alice@co.com"] },
    { day: 3, sh: 9, sm: 30, eh: 10, em: 30, title: "Sprint planning", color: "#8B5CF6", att: ["team@co.com"] },
    { day: 3, sh: 14, sm: 0, eh: 14, em: 30, title: "Coffee with Sam", color: "#10B981" },
    { day: 4, sh: 11, sm: 0, eh: 12, em: 0, title: "Demo prep", color: "#F59E0B" },
  ];
  sample.forEach((s) => {
    const d = new Date(monday);
    d.setDate(d.getDate() + s.day);
    mockState.events.push({
      id: String(mockState.nextEventId++),
      title: s.title,
      start: isoAt(d, s.sh, s.sm),
      end: isoAt(d, s.eh, s.em),
      color: s.color,
      attendees: s.att,
      coverage: s.att && s.att.length > 0 ? coverageFromAttendees(s.att) : undefined,
    });
  });

  // A couple of pre-existing focus blocks
  const focusDays = [1, 3];
  focusDays.forEach((day) => {
    const d = new Date(monday);
    d.setDate(d.getDate() + day);
    const start = isoAt(d, 8, 0);
    const end = isoAt(d, 9, 0);
    const id = mockState.nextFocusId++;
    mockState.focusBlocks.push({
      id,
      google_event_id: `gcal-focus-${id}`,
      start_time: start,
      end_time: end,
      date: dateOnly(d),
      created_at: new Date().toISOString(),
    });
    mockState.events.push({
      id: `focus-${id}`,
      title: mockState.settings.focus_label,
      start,
      end,
      color: mockState.settings.focus_color,
      is_focus_block: true,
    });
  });

  logAudit("seed", "Initialised mock workspace");

  // Seed two personal calendars
  mockState.personalCalendars.push(
    {
      id: String(mockState.nextPersonalId++),
      label: "Personal",
      type: "google",
      email: "me.personal@gmail.com",
      enabled: true,
      last_synced_at: new Date(Date.now() - 12 * 60_000).toISOString(),
    },
    {
      id: String(mockState.nextPersonalId++),
      label: "Family (iCloud)",
      type: "webcal",
      url: "webcal://example.com/family.ics",
      enabled: false,
      last_synced_at: new Date(Date.now() - 3 * 3600_000).toISOString(),
    },
  );
}
/**
 * The preview (mock) answer of the three event mutations, in the shape the
 * server sends (the generated CalendarEvent DTO, PAC-29): only the declared
 * keys, and colour only when it is one of the server's palette.
 */
const DTO_COLORS: ReadonlyArray<string> = ["#7986CB", "#33B679", "#8E24AA", "#E67C73", "#F6BF26", "#F4511E", "#039BE5", "#3F51B5", "#0B8043", "#D50000", "#616161"];
function mockEventDTO(ev: CalendarEvent): CalendarEventDTO {
  const dto: CalendarEventDTO = { id: ev.id, title: ev.title, start: ev.start, end: ev.end };
  if (ev.color && DTO_COLORS.includes(ev.color)) dto.color = ev.color as CalendarEventDTO["color"];
  if (ev.attendees?.length) dto.attendees = [...ev.attendees];
  if (ev.attendee_details?.length) {
    dto.attendee_details = ev.attendee_details.map(({ email, name, rsvp, organizer }) => ({
      email,
      ...(name ? { name } : {}),
      ...(rsvp ? { rsvp } : {}),
      ...(organizer ? { organizer } : {}),
    }));
  }
  if (ev.description) dto.description = ev.description;
  if (ev.location) dto.location = ev.location;
  if (ev.conference) dto.conference = { ...ev.conference };
  return dto;
}
/**
 * The preview (mock) probe. It knows exactly the five key-based providers
 * (NEW-llm-bring-your-own AC-33); any other choice has nothing to test.
 */
export function mockLlmTest(s: Settings): LLMTestResult {
  const provider = String(s.llm_provider ?? "");
  if (!isKeyProvider(provider)) {
    return { ok: false, message: "No AI provider is chosen, so there is nothing to test." };
  }
  const need = (...keys: Array<keyof Settings>) => keys.find((k) => !s[k] || String(s[k]).trim() === "");
  let missing: keyof Settings | undefined;
  if (provider === "bedrock") missing = need("aws_region");
  else if (provider === "azure_openai") missing = need("azure_endpoint", "azure_deployment");
  if (missing) {
    return { ok: false, message: `Missing required field: ${String(missing)}` };
  }
  return {
    ok: true,
    message: `Reached ${PROVIDER_LABELS[provider]} (${s.llm_model || "default model"}) — mock response`,
    latency_ms: 120 + Math.floor(Math.random() * 80),
  };
}
// ---------- Mock implementations ----------

function mockSuggestedSlots(durationMin: number, rangeStart?: string, rangeEnd?: string): SuggestedSlot[] {
  const start = rangeStart ? new Date(rangeStart) : new Date();
  const out: SuggestedSlot[] = [];
  let cursor = new Date(start);
  cursor.setMinutes(0, 0, 0);
  if (cursor.getHours() < 9) cursor.setHours(10, 0, 0, 0);
  const end = rangeEnd ? new Date(rangeEnd) : new Date(cursor.getTime() + 5 * 24 * 3600_000);
  let attempts = 0;
  while (out.length < 3 && cursor < end && attempts < 60) {
    attempts++;
    const day = cursor.getDay();
    const hour = cursor.getHours();
    if (day !== 0 && day !== 6 && hour >= 9 && hour < 17) {
      const s = new Date(cursor);
      const e = new Date(cursor.getTime() + durationMin * 60_000);
      // Mirror Google's behavior: events the current user has DECLINED
      // should not block a new candidate slot, even if other invitees still
      // hold the meeting on their calendars.
      const conflict = mockState.events.some((ev) => {
        if (new Date(ev.start) >= e || new Date(ev.end) <= s) return false;
        const me = ev.attendee_details?.find(
          (a) => a.organizer || a.email === mockState.auth.email,
        );
        if (me?.rsvp === "declined") return false;
        return true;
      });
      if (!conflict) {
        out.push({
          start: s.toISOString(),
          end: e.toISOString(),
          score: 0.95 - out.length * 0.15,
          reasons: out.length === 0 ? ["Best fit", "No conflicts", "Inside working hours"] : ["No conflicts", "Inside working hours"],
        });
      }
    }
    cursor = new Date(cursor.getTime() + 60 * 60_000);
    if (cursor.getHours() >= 18) {
      cursor.setDate(cursor.getDate() + 1);
      cursor.setHours(10, 0, 0, 0);
    }
  }
  return out;
}

// ---------- Free/busy mock helper ----------

const PERSONAL_DOMAINS = new Set([
  "gmail.com",
  "yahoo.com",
  "yahoo.co.uk",
  "proton.me",
  "protonmail.com",
  "icloud.com",
  "me.com",
  "aol.com",
  "fastmail.com",
  "gmx.com",
]);

/**
 * The demo's free/busy, in the server's shape (PAC-41 D-5, AC-10): two
 * statuses and no provider. A personal mail domain is `unknown`, as on the
 * server; any other address is `known`, with no busy windows.
 */
function classifyEmail(email: string): CoverageStatus {
  const domain = email.toLowerCase().split("@")[1] ?? "";
  if (!domain || PERSONAL_DOMAINS.has(domain)) return "unknown";
  return "known";
}

function mockFreebusy(input: { emails: string[]; start_time: string; end_time: string }): FreeBusyResponse {
  const participants: ParticipantCoverage[] = input.emails.map((email) => ({
    email: email.toLowerCase(),
    status: classifyEmail(email),
    busy: [],
  }));
  return {
    start_time: input.start_time,
    end_time: input.end_time,
    participants,
  };
}

/**
 * Compute the coverage summary the UI shows next to suggestions / events.
 * `total` includes the organizer (assumed connected — otherwise we'd flag
 * organizer_disconnected). Mirrors what the backend returns for T-39.
 */
function coverageFromAttendees(attendees: string[] | undefined): { total: number; checked: number; organizer_disconnected?: boolean } {
  const list = (attendees ?? []).filter(Boolean);
  // Count organizer (always known via Paceday) + each attendee whose mail we can read.
  const organizerCounted = 1;
  let checked = organizerCounted;
  for (const e of list) {
    if (classifyEmail(e) === "known") checked += 1;
  }
  return { total: list.length + organizerCounted, checked };
}

// Mock-only conferencing link generator

function mockGenerateConferenceLink(provider: ConferenceProvider, custom?: string): ConferenceLink {
  if (provider === "custom") {
    return { provider, url: custom?.trim() || "https://meet.example.com/your-room" };
  }
  const id = Math.random().toString(36).slice(2, 11);
  switch (provider) {
    case "google_meet":
      return { provider, url: `https://meet.google.com/${id.slice(0, 3)}-${id.slice(3, 7)}-${id.slice(7, 10)}` };
    case "zoom":
      return { provider, url: `https://zoom.us/j/${Math.floor(1e10 + Math.random() * 9e10)}` };
    case "teams":
      return { provider, url: `https://teams.microsoft.com/l/meetup-join/${id}` };
  }
}

// Pretend toggle for Zoom (used by Settings UI without a real OAuth flow)
export function mockZoomConnect(email = "you@zoom.us") {
  mockState.conference.zoom = { connected: true, email };
}

// keep helper for components that want to nudge state
export const _mockHelpers = {
  get: () => mockState,
  pushEvent: (ev: CalendarEvent) => {
    // Replace any existing event with the same id so seeding is idempotent.
    mockState.events = mockState.events.filter((e) => e.id !== ev.id);
    mockState.events.push(ev);
  },
  removeEventsWithPrefix: (prefix: string) => {
    mockState.events = mockState.events.filter((e) => !e.id.startsWith(prefix));
  },
};

seedMocks();

/** The demo answer of each `api` operation, keyed by its name (same signature). */
export const demoClientOps = {
  freebusy: (input: { emails: string[]; start_time: string; end_time: string }) => mockFreebusy(input),

  authStatus: () => ({ ...mockState.auth }),

  integrationAvailability: () => ({
        google: { available: true, reason: "demo" },
        microsoft: { available: true, reason: "demo" },
        zoom: { available: true, reason: "demo" },
        slack: { available: true, reason: "demo" },
        notion: { available: true, reason: "demo" },
        webcal: { available: true, reason: "built_in" },
      }),

  authDisconnect: () => {
        mockState.auth = { connected: false, email: "", provider: undefined };
        logAudit("auth.disconnect", "Disconnected calendar (mock)");
      },

  getSettings: () => ({ ...mockState.settings }),

  updateSettings: (s: Settings, previous?: Settings) => {
        mockState.settings = { ...s };
        // keep focus block colors in sync
        mockState.events.forEach((e) => {
          if (e.is_focus_block) {
            e.color = s.focus_color;
            e.title = s.focus_label;
          }
        });
        logAudit("settings.update", "Updated settings (mock)");
        return { ...mockState.settings };
      },

  getEvents: (start: string, end: string) => {
        const s = new Date(start).getTime();
        const e = new Date(end).getTime();
        return mockState.events.filter((ev) => {
          const es = new Date(ev.start).getTime();
          const ee = new Date(ev.end).getTime();
          return ee >= s && es <= e;
        });
      },

  runFocus: (week?: string) => {
        const monday = week ? new Date(week) : startOfWeek(new Date());
        const created: FocusRunBlock[] = [];
        const skipped: string[] = [];
        for (let i = 0; i < 5; i++) {
          const d = new Date(monday);
          d.setDate(d.getDate() + i);
          const date = dateOnly(d);
          // pick an empty 90-min morning slot
          const slotStart = isoAt(d, 8, 0);
          const slotEnd = isoAt(d, 9, 30);
          const conflict = mockState.events.some(
            (ev) =>
              new Date(ev.start) < new Date(slotEnd) &&
              new Date(ev.end) > new Date(slotStart) &&
              !ev.is_focus_block,
          );
          if (conflict) {
            skipped.push(date);
            continue;
          }
          const exists = mockState.focusBlocks.some(
            (b) => b.start_time === slotStart && b.end_time === slotEnd,
          );
          if (exists) continue;
          const id = mockState.nextFocusId++;
          const block: FocusRunBlock = {
            google_event_id: `gcal-focus-${id}`,
            start_time: slotStart,
            end_time: slotEnd,
            date,
          };
          mockState.focusBlocks.push({ id, ...block, created_at: new Date().toISOString() });
          mockState.events.push({
            id: `focus-${id}`,
            title: mockState.settings.focus_label,
            start: slotStart,
            end: slotEnd,
            color: mockState.settings.focus_color,
            is_focus_block: true,
          });
          created.push(block);
        }
        logAudit("focus.run", `Created ${created.length} focus blocks (mock)`);
        const result: FocusRunResult = {
          weekStart: new Date(monday).toISOString(),
          createdBlocks: created,
          skippedDays: skipped,
          totalMinutes: created.length * 90,
          errors: [],
        };
        return result;
      },

  getFocusBlocks: (week: string) => {
        const monday = startOfWeek(new Date(week));
        const sunday = new Date(monday);
        sunday.setDate(sunday.getDate() + 7);
        return mockState.focusBlocks.filter((b) => {
          const t = new Date(b.start_time);
          return t >= monday && t < sunday;
        });
      },

  clearFocusBlocks: (week: string) => {
        const monday = startOfWeek(new Date(week));
        const sunday = new Date(monday);
        sunday.setDate(sunday.getDate() + 7);
        const before = mockState.focusBlocks.length;
        const ids = new Set<string>();
        mockState.focusBlocks = mockState.focusBlocks.filter((b) => {
          const t = new Date(b.start_time);
          if (t >= monday && t < sunday) {
            ids.add(`focus-${b.id}`);
            return false;
          }
          return true;
        });
        mockState.events = mockState.events.filter((e) => !ids.has(e.id));
        const deleted = before - mockState.focusBlocks.length;
        logAudit("focus.clear", `Cleared ${deleted} focus blocks (mock)`);
        return { deleted };
      },

  scheduleSuggest: (body: {
    duration_minutes: number;
    attendees: string[];
    range_start: string;
    range_end: string;
    title: string;
  }) => {
        const cov = coverageFromAttendees(body.attendees);
        const slots = mockSuggestedSlots(body.duration_minutes, body.range_start, body.range_end).map(
          (s) => ({ ...s, coverage: cov }),
        );
        return { slots };
      },

  scheduleCreate: (body: {
    title: string;
    start: string;
    end: string;
    attendees: string[];
    description?: string;
  }) => {
        const ev: CalendarEvent = {
          id: String(mockState.nextEventId++),
          title: body.title,
          start: body.start,
          end: body.end,
          attendees: body.attendees,
          color: "#3B82F6",
          coverage: coverageFromAttendees(body.attendees),
        };
        mockState.events.push(ev);
        logAudit("schedule.create", `Created "${body.title}" (mock)`);
        return mockEventDTO(ev);
      },

  compressionPreview: (body: { date?: string; week?: string }) => [],

  compressionApply: (body: { proposals: MoveProposal[] }) => ({
        applied: body.proposals.map((proposal) => proposal.eventId),
        failed: [],
      }),

  nlpParse: (text: string) => {
        const t = text.trim().toLowerCase();
        if (!t) return { intent: "unknown", error: "Please type a request." } as ParseResult;
        if (t.includes("focus")) {
          return {
            intent: "schedule_focus",
            title: "Focus Time",
            duration_minutes: 90,
          } as ParseResult;
        }
        const durationMatch = t.match(/(\d+)\s*(min|minute|m\b|h\b|hour|hr)/);
        let duration = 30;
        if (durationMatch) {
          const n = parseInt(durationMatch[1], 10);
          duration = /h/.test(durationMatch[2]) ? n * 60 : n;
        }
        const attendees = Array.from(text.matchAll(/[\w.+-]+@[\w-]+\.[\w.-]+/g)).map((m) => m[0]);
        const titleMatch = text.match(/(?:about|for|:)\s*(.+)$/i);
        const title = titleMatch ? titleMatch[1].trim() : attendees.length ? `Meeting with ${attendees[0].split("@")[0]}` : "New meeting";
        const now = new Date();
        const rangeStart = now.toISOString();
        const rangeEnd = new Date(now.getTime() + 7 * 24 * 3600_000).toISOString();
        const cov = coverageFromAttendees(attendees);
        return {
          intent: "schedule_meeting",
          title,
          duration_minutes: duration,
          attendees,
          range_start: rangeStart,
          range_end: rangeEnd,
          suggested_slots: mockSuggestedSlots(duration, rangeStart, rangeEnd).map((s) => ({ ...s, coverage: cov })),
          coverage: cov,
        } as ParseResult;
      },

  nlpConfirm: (parse_result: ParseResult, selected_slot_index: number) => {
        const slot = parse_result.suggested_slots?.[selected_slot_index];
        if (!slot) throw new Error("No slot selected");
        const ev: CalendarEvent = {
          id: String(mockState.nextEventId++),
          title: parse_result.title || "New meeting",
          start: slot.start,
          end: slot.end,
          attendees: parse_result.attendees,
          color: "#3B82F6",
          coverage: parse_result.coverage ?? coverageFromAttendees(parse_result.attendees),
        };
        mockState.events.push(ev);
        logAudit("nlp.confirm", `Scheduled "${ev.title}" (mock)`);
        return mockEventDTO(ev);
      },

  getAudit: (limit = DEFAULT_AUDIT_LIMIT) => mockState.audit.slice(0, limit),

  listPersonalCalendars: () => [...mockState.personalCalendars],

  addPersonalCalendar: (body: { type: PersonalCalendarType; label: string; url?: string }) => {
        const id = String(mockState.nextPersonalId++);
        const cal: PersonalCalendar = {
          id,
          label: body.label || "Personal",
          type: body.type,
          enabled: true,
          last_synced_at: new Date().toISOString(),
          ...(body.type === "webcal"
            ? { url: body.url }
            : { email: `you.${body.type}@example.com` }),
        };
        mockState.personalCalendars.push(cal);
        logAudit("personal.add", `Added personal calendar "${cal.label}" (mock)`);
        // No auth_url in mocks — we just pretend it succeeded.
        return cal;
      },

  updatePersonalCalendar: (id: string, patch: Partial<Pick<PersonalCalendar, "enabled" | "label">>) => {
        const cal = mockState.personalCalendars.find((c) => c.id === id);
        if (!cal) throw new Error("Not found");
        Object.assign(cal, patch);
        logAudit("personal.update", `Updated "${cal.label}" (mock)`);
        return { ...cal };
      },

  deletePersonalCalendar: (id: string) => {
        mockState.personalCalendars = mockState.personalCalendars.filter((c) => c.id !== id);
        logAudit("personal.delete", `Removed personal calendar (mock)`);
      },

  syncPersonalCalendar: (id: string) => {
        const cal = mockState.personalCalendars.find((c) => c.id === id);
        if (!cal) throw new Error("Not found");
        cal.last_synced_at = new Date().toISOString();
        logAudit("personal.sync", `Synced "${cal.label}" (mock)`);
        return { ...cal };
      },

  llmTest: (s: Settings) => mockLlmTest(s),

  updateEvent: (
    id: string,
    patch: Partial<Pick<CalendarEvent, "title" | "start" | "end" | "description" | "location" | "room_resource_email" | "attendees" | "attendee_details">>,
    sendUpdates: "all" | "none" = "none",
  ) => {
        const ev = mockState.events.find((e) => e.id === id);
        if (!ev) throw new Error("Not found");
        Object.assign(ev, patch);
        // keep attendees array in sync with attendee_details if details given
        if (patch.attendee_details) {
          ev.attendees = patch.attendee_details.map((a) => a.email);
        }
        logAudit("event.update", `Edited "${ev.title}" (mock)`);
        return mockEventDTO(ev);
      },

  deleteEvent: (id: string, sendUpdates: "all" | "none" = "none") => {
        const ev = mockState.events.find((e) => e.id === id);
        mockState.events = mockState.events.filter((e) => e.id !== id);
        logAudit("event.delete", `Deleted "${ev?.title ?? id}" (mock)`);
      },

  // Like the server: a case-insensitive substring of the name or the address.
  searchRooms: (q: string) => {
        const ql = q.trim().toLowerCase();
        if (!ql) return MOCK_ROOMS.map((r) => ({ ...r }));
        return MOCK_ROOMS.filter((r) => r.name.toLowerCase().includes(ql) || r.id.toLowerCase().includes(ql)).map((r) => ({ ...r }));
      },

  suggestAttendees: (q: string) => {
        const ql = q.trim().toLowerCase();
        if (!ql) return MOCK_DIRECTORY.slice(0, 5);
        return MOCK_DIRECTORY.filter(
          (a) =>
            a.email.toLowerCase().includes(ql) ||
            (a.name?.toLowerCase().includes(ql) ?? false),
        ).slice(0, 8);
      },

  addConference: (eventId: string, body: { provider: ConferenceProvider; url?: string }) => {
        const ev = mockState.events.find((e) => e.id === eventId);
        if (!ev) throw new Error("Not found");
        const link = mockGenerateConferenceLink(body.provider, body.url);
        ev.conference = link;
        logAudit("conference.add", `Added ${body.provider} link to "${ev.title}" (mock)`);
        return { ...link };
      },

  removeConference: (eventId: string) => {
        const ev = mockState.events.find((e) => e.id === eventId);
        if (!ev) return;
        delete ev.conference;
        logAudit("conference.remove", `Removed conference from "${ev.title}" (mock)`);
      },

  conferenceProviders: () => {
        const calProvider = mockState.settings.calendar_provider ?? "google";
        return [
          {
            provider: "google_meet",
            connected: calProvider === "google",
            auto_with: "google",
          },
          {
            provider: "zoom",
            connected: mockState.conference.zoom.connected,
            email: mockState.conference.zoom.email,
          },
          {
            provider: "teams",
            connected: calProvider === "outlook",
            enabled: !!mockState.settings.teams_enabled,
            auto_with: "outlook",
          },
        ] as ConferenceProviderStatus[];
      },

  zoomDisconnect: (): ProviderDisconnectResult => {
        mockState.conference.zoom = { connected: false, email: undefined };
        logAudit("conference.zoom.disconnect", "Disconnected Zoom (mock)");
        return { provider: "zoom", revocation: "confirmed" };
      },

  microsoftDisconnect: (): ProviderDisconnectResult => {
        logAudit("auth.microsoft.disconnect", "Disconnected Outlook (mock)");
        return { provider: "outlook", revocation: "not_offered" };
      },
};
