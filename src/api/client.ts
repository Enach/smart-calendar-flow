import type { ApiPort, CompressionApplyResponse } from "./contract";

import type {
  AuditEntry,
  AuthStatus,
  Attendee,
  CalendarEvent,
  CalendarProvider,
  CompressionResult,
  ConferenceLink,
  ConferenceProvider,
  ConferenceProviderStatus,
  CoverageProvider,
  CoverageStatus,
  FocusBlock,
  FocusRunResult,
  FreeBusyResponse,
  LLMTestResult,
  MoveProposal,
  ParseResult,
  ParticipantCoverage,
  PersonalCalendar,
  PersonalCalendarType,
  Room,
  Settings,
  SuggestedSlot,
} from "./types";

// ---------- Mock state ----------
// Used as a fallback when the Go backend at /api is not reachable
// (e.g. inside the Lovable preview). Mocks are mutated in-memory so
// the UI feels alive across interactions.

const PROVIDER_KEY = "clockwise:mock-mode";

let usingMocks = false;
const mockListeners = new Set<(v: boolean) => void>();

export function isUsingMocks() {
  return usingMocks;
}
export function subscribeMockMode(cb: (v: boolean) => void) {
  mockListeners.add(cb);
  cb(usingMocks);
  return () => {
    mockListeners.delete(cb);
  };
}
export function setMockMode(v: boolean) {
  if (usingMocks === v) return;
  usingMocks = v;
  try {
    sessionStorage.setItem(PROVIDER_KEY, v ? "1" : "0");
  } catch { /* storage unavailable */ }
  mockListeners.forEach((cb) => cb(v));
}
try {
  usingMocks = sessionStorage.getItem(PROVIDER_KEY) === "1";
} catch { /* storage unavailable */ }

const DEFAULT_SETTINGS: Settings = {
  work_start: "09:00",
  work_end: "18:00",
  timezone: "Europe/Paris",
  focus_min_block_minutes: 60,
  focus_max_block_minutes: 180,
  focus_daily_target_minutes: 180,
  focus_max_per_week: 15,
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
  aws_profile: "",
  azure_endpoint: "",
  azure_deployment: "",
  azure_api_version: "2024-02-01",
  default_conference_provider: "google_meet",
  teams_enabled: false,
};

const MOCK_ROOMS: Room[] = [
  { id: "r1", name: "Helsinki", email: "room.helsinki@co.com", building: "HQ", floor: "3", capacity: 6 },
  { id: "r2", name: "Reykjavik", email: "room.reykjavik@co.com", building: "HQ", floor: "3", capacity: 4 },
  { id: "r3", name: "Oslo", email: "room.oslo@co.com", building: "HQ", floor: "2", capacity: 12 },
  { id: "r4", name: "Stockholm", email: "room.stockholm@co.com", building: "HQ", floor: "2", capacity: 8 },
  { id: "r5", name: "Copenhagen", email: "room.copenhagen@co.com", building: "Annex", floor: "1", capacity: 20 },
  { id: "r6", name: "Phone Booth A", email: "room.booth-a@co.com", building: "HQ", floor: "1", capacity: 1 },
  { id: "r7", name: "Phone Booth B", email: "room.booth-b@co.com", building: "HQ", floor: "1", capacity: 1 },
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
function addMinutes(iso: string, m: number) {
  return new Date(new Date(iso).getTime() + m * 60_000).toISOString();
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


// ---------- Tiny fetch wrapper with mock fallback ----------

const API_BASE =
  (window as Window & { __API_BASE_URL__?: string }).__API_BASE_URL__ ??
  (import.meta.env.VITE_API_BASE_URL as string | undefined) ??
  "/api";
const NETWORK_TIMEOUT_MS = 4000;

/**
 * The backend answered with a non-success status (401/403/409/410/422/500…).
 * This is NEVER replaced with demo data — the UI must surface it.
 */
export class ApiHttpError extends Error {
  readonly status: number;
  readonly data: unknown;
  constructor(status: number, data?: unknown, message?: string) {
    super(message ?? `HTTP ${status}`);
    this.name = "ApiHttpError";
    this.status = status;
    this.data = data;
  }
}

/**
 * The backend could not be reached at all (network error, timeout, or a
 * non-JSON response such as the SPA index.html when no backend is mounted).
 * Only this class triggers the preview/offline mock fallback.
 */
export class ApiUnreachableError extends Error {
  constructor(message = "Backend unreachable") {
    super(message);
    this.name = "ApiUnreachableError";
  }
}

export function isApiHttpError(e: unknown): e is ApiHttpError {
  return e instanceof ApiHttpError;
}
export function isApiUnreachableError(e: unknown): e is ApiUnreachableError {
  return e instanceof ApiUnreachableError;
}

/** Human-readable message for an API failure, usable directly in the UI. */
export function apiErrorMessage(e: unknown): string {
  if (isApiUnreachableError(e)) return "Backend unreachable — showing preview data.";
  if (isApiHttpError(e)) {
    const data = e.data as { error?: string; message?: string; detail?: string } | undefined;
    const detail = data?.error ?? data?.message ?? data?.detail;
    if (detail) return detail;
    switch (e.status) {
      case 401:
        return "Your session expired. Please sign in again.";
      case 403:
        return "You don't have permission to do this.";
      case 409:
        return "This conflicts with the current state. Refresh and try again.";
      case 410:
        return "This resource is no longer available.";
      case 422:
        return "Some of the submitted data is invalid.";
      default:
        return e.status >= 500 ? "The server had a problem. Try again shortly." : `Request failed (${e.status}).`;
    }
  }
  return e instanceof Error ? e.message : "Unexpected error.";
}

export async function requestApi<T>(method: string, path: string, body?: unknown, query?: Record<string, string | undefined>): Promise<T> {
  const url = new URL(API_BASE + path, window.location.origin);
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (v != null && v !== "") url.searchParams.set(k, v);
    }
  }
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), NETWORK_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(url.toString(), {
      method,
      signal: ctrl.signal,
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      credentials: "include",
    });
  } catch {
    throw new ApiUnreachableError();
  } finally {
    clearTimeout(t);
  }

  if (!res.ok) {
    let data: unknown;
    try {
      data = await res.json();
    } catch {
      /* body is not JSON — keep undefined */
    }
    throw new ApiHttpError(res.status, data);
  }
  if (res.status === 204) return undefined as T;
  const ct = res.headers.get("content-type") || "";
  // Strict: only accept JSON. If the dev server returns HTML
  // (e.g. SPA index.html when no real backend exists), the backend is not
  // actually mounted → treat as unreachable so the preview fallback engages.
  if (!ct.includes("application/json")) {
    throw new ApiUnreachableError("Non-JSON response");
  }
  return (await res.json()) as T;
}



type BackendPersonalCalendar = {
  id: string | number;
  provider?: string;
  type?: PersonalCalendarType;
  name?: string;
  label?: string;
  url?: string;
  enabled?: boolean;
  last_synced_at?: string;
};

function normalizePersonalCalendar(raw: BackendPersonalCalendar): PersonalCalendar {
  const type = (raw.type ?? raw.provider ?? "webcal") as PersonalCalendarType;
  const label = raw.label ?? raw.name ?? "Personal";
  return {
    id: String(raw.id),
    label,
    type,
    url: raw.url,
    enabled: raw.enabled ?? true,
    last_synced_at: raw.last_synced_at,
  };
}

export async function withFallback<T>(real: () => Promise<T>, mock: () => T | Promise<T>): Promise<T> {
  if (usingMocks) return mock();
  try {
    return await real();
  } catch {
    return mock();
  }
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

const PACEDAY_DOMAINS = new Set(["paceday.com", "demo.paceday.com"]);
const KNOWN_GOOGLE_DOMAINS = new Set(["co.com", "acme.com", "paceday.com", "demo.paceday.com"]);
const KNOWN_OUTLOOK_DOMAINS = new Set([
  "microsoft.com",
  "outlook.com",
  "hotmail.com",
  "live.com",
  "msn.com",
]);
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

function classifyEmail(email: string): { status: CoverageStatus; provider?: CoverageProvider } {
  const domain = email.toLowerCase().split("@")[1] ?? "";
  if (PACEDAY_DOMAINS.has(domain)) return { status: "paceday_user", provider: "paceday" };
  if (KNOWN_GOOGLE_DOMAINS.has(domain)) return { status: "known", provider: "google" };
  if (KNOWN_OUTLOOK_DOMAINS.has(domain)) return { status: "known", provider: "outlook" };
  if (PERSONAL_DOMAINS.has(domain)) return { status: "unknown" };
  // Heuristic: any non-personal corporate domain → assume Google Workspace
  if (domain && !domain.startsWith("@")) return { status: "known", provider: "google" };
  return { status: "unknown" };
}

function mockFreebusy(input: { emails: string[]; start_time: string; end_time: string }): FreeBusyResponse {
  const participants: ParticipantCoverage[] = input.emails.map((email) => {
    const { status, provider } = classifyEmail(email);
    return { email: email.toLowerCase(), status, provider };
  });
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
    const c = classifyEmail(e);
    if (c.status === "paceday_user" || c.status === "known") checked += 1;
  }
  return { total: list.length + organizerCounted, checked };
}


seedMocks();

// ---------- Public API ----------

export const api = {
  // Health — used by the polling probe. We don't go through withFallback
  // because we want to control the mock-mode flag directly here.
  health: async (): Promise<{ status: string; version: string; reachable: boolean }> => {
    try {
      const r = await requestApi<{ status: string; version: string }>("GET", "/health");
      setMockMode(false);
      return { ...r, reachable: true };
    } catch {
      setMockMode(true);
      return { status: "ok", version: "mock-1.0.0", reachable: false };
    }
  },

  /**
   * Free/busy probe (T-39 / T-40).
   *
   * Tells the UI which participants we can read calendar data for.
   * Mock heuristic — covers the demo + offline cases:
   *   - email matches the current org domain → status=paceday_user (provider=paceday)
   *   - known directory (co.com, acme.com, paceday.com) → known + google
   *   - microsoft.com / outlook.com / hotmail.com / live.com → known + outlook
   *   - personal mail (gmail.com, yahoo.com, proton.me, ...) → unknown
   * The real backend overrides all of this when reachable.
   */
  freebusy: (input: { emails: string[]; start_time: string; end_time: string }) =>
    withFallback<FreeBusyResponse>(
      () => requestApi<FreeBusyResponse>("POST", "/freebusy", input),
      () => mockFreebusy(input),
    ),
  authStatus: () =>
    withFallback(
      () => requestApi<AuthStatus>("GET", "/auth/status"),
      () => ({ ...mockState.auth }),
    ),
  authConnectUrl: (provider: CalendarProvider = "google") =>
    `${API_BASE}/auth/${provider === "outlook" ? "microsoft" : provider}`,
  authDisconnect: () =>
    withFallback(
      () => requestApi<void>("DELETE", "/auth/disconnect"),
      () => {
        mockState.auth = { connected: false, email: "", provider: undefined };
        logAudit("auth.disconnect", "Disconnected calendar (mock)");
      },
    ),

  // Settings
  getSettings: () =>
    withFallback(
      () => requestApi<Settings>("GET", "/settings"),
      () => ({ ...mockState.settings }),
    ),
  updateSettings: (s: Settings) =>
    withFallback(
      () => requestApi<Settings>("PUT", "/settings", s),
      () => {
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
    ),

  // Calendar
  getEvents: (start: string, end: string) =>
    withFallback(
      () => requestApi<CalendarEvent[]>("GET", "/calendar/events", undefined, { start, end }),
      () => {
        const s = new Date(start).getTime();
        const e = new Date(end).getTime();
        return mockState.events.filter((ev) => {
          const es = new Date(ev.start).getTime();
          const ee = new Date(ev.end).getTime();
          return ee >= s && es <= e;
        });
      },
    ),

  // Focus
  runFocus: (week?: string) =>
    withFallback(
      () => requestApi<FocusRunResult>("POST", "/focus/run", { week }),
      () => {
        const monday = week ? new Date(week) : startOfWeek(new Date());
        const created: FocusBlock[] = [];
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
          const block: FocusBlock = {
            id,
            google_event_id: `gcal-focus-${id}`,
            start_time: slotStart,
            end_time: slotEnd,
            date,
          };
          mockState.focusBlocks.push(block);
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
        return {
          week_start: dateOnly(monday),
          created_blocks: created,
          skipped_days: skipped,
          total_minutes: created.length * 90,
          errors: [],
        };
      },
    ),
  getFocusBlocks: (week: string) =>
    withFallback(
      () => requestApi<FocusBlock[]>("GET", "/focus/blocks", undefined, { week }),
      () => {
        const monday = startOfWeek(new Date(week));
        const sunday = new Date(monday);
        sunday.setDate(sunday.getDate() + 7);
        return mockState.focusBlocks.filter((b) => {
          const t = new Date(b.start_time);
          return t >= monday && t < sunday;
        });
      },
    ),
  clearFocusBlocks: (week: string) =>
    withFallback(
      () => requestApi<{ deleted: number }>("DELETE", "/focus/blocks", undefined, { week }),
      () => {
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
    ),

  // Schedule
  scheduleSuggest: (body: {
    duration_minutes: number;
    attendees: string[];
    range_start: string;
    range_end: string;
    title: string;
  }) =>
    withFallback(
      () => requestApi<{ slots: SuggestedSlot[] }>("POST", "/schedule/suggest", body),
      () => {
        const cov = coverageFromAttendees(body.attendees);
        const slots = mockSuggestedSlots(body.duration_minutes, body.range_start, body.range_end).map(
          (s) => ({ ...s, coverage: cov }),
        );
        return { slots };
      },
    ),
  scheduleCreate: (body: {
    title: string;
    start: string;
    end: string;
    attendees: string[];
    description?: string;
  }) =>
    withFallback(
      () => requestApi<CalendarEvent>("POST", "/schedule/create", body),
      () => {
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
        return ev;
      },
    ),
  compressionPreview: (body: { date?: string; week?: string }) =>
    withFallback(
      () => requestApi<CompressionResult[]>("POST", "/schedule/compress", body),
      () => [],
    ),
  compressionApply: (body: { proposals: MoveProposal[] }) =>
    withFallback(
      () => requestApi<CompressionApplyResponse>("POST", "/schedule/compress/apply", body),
      () => ({
        applied: body.proposals.map((proposal) => proposal.event_id),
        failed: [],
      }),
    ),

  // NLP
  nlpParse: (text: string) =>
    withFallback(
      () => requestApi<ParseResult>("POST", "/nlp/parse", { text }),
      () => {
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
    ),
  nlpConfirm: (parse_result: ParseResult, selected_slot_index: number) =>
    withFallback(
      () => requestApi<CalendarEvent>("POST", "/nlp/confirm", { parse_result, selected_slot_index }),
      () => {
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
        return ev;
      },
    ),

  // Audit
  getAudit: () =>
    withFallback(
      () => requestApi<AuditEntry[]>("GET", "/audit"),
      () => [...mockState.audit],
    ),

  // Personal calendars
  listPersonalCalendars: () =>
    withFallback(
      async () => {
        const raw = await requestApi<BackendPersonalCalendar[]>("GET", "/personal-calendars");
        return (raw ?? []).map(normalizePersonalCalendar);
      },
      () => [...mockState.personalCalendars],
    ),
  addPersonalCalendar: (body: { type: PersonalCalendarType; label: string; url?: string }) =>
    withFallback(
      () =>
        requestApi<BackendPersonalCalendar>(
          "POST",
          "/personal-calendars",
          { provider: body.type, name: body.label, url: body.url, enabled: true },
        ).then(normalizePersonalCalendar),
      () => {
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
    ),
  updatePersonalCalendar: (id: string, patch: Partial<Pick<PersonalCalendar, "enabled" | "label">>) =>
    withFallback(
      () =>
        requestApi<BackendPersonalCalendar>("PATCH", `/personal-calendars/${id}`, {
          ...(patch.label === undefined ? {} : { name: patch.label }),
          ...(patch.enabled === undefined ? {} : { enabled: patch.enabled }),
        }).then(normalizePersonalCalendar),
      () => {
        const cal = mockState.personalCalendars.find((c) => c.id === id);
        if (!cal) throw new Error("Not found");
        Object.assign(cal, patch);
        logAudit("personal.update", `Updated "${cal.label}" (mock)`);
        return { ...cal };
      },
    ),
  deletePersonalCalendar: (id: string) =>
    withFallback(
      () => requestApi<void>("DELETE", `/personal-calendars/${id}`),
      () => {
        mockState.personalCalendars = mockState.personalCalendars.filter((c) => c.id !== id);
        logAudit("personal.delete", `Removed personal calendar (mock)`);
      },
    ),
  syncPersonalCalendar: (id: string) =>
    withFallback(
      () => requestApi<BackendPersonalCalendar>("POST", `/personal-calendars/${id}/sync`).then(normalizePersonalCalendar),
      () => {
        const cal = mockState.personalCalendars.find((c) => c.id === id);
        if (!cal) throw new Error("Not found");
        cal.last_synced_at = new Date().toISOString();
        logAudit("personal.sync", `Synced "${cal.label}" (mock)`);
        return { ...cal };
      },
    ),

  // LLM
  llmTest: (s: Settings) =>
    withFallback(
      () => requestApi<LLMTestResult>("POST", "/llm/test", s),
      () => {
        const provider = s.llm_provider;
        const need = (...keys: Array<keyof Settings>) =>
          keys.find((k) => !s[k] || String(s[k]).trim() === "");
        let missing: keyof Settings | undefined;
        if (provider === "bedrock") missing = need("aws_region");
        else if (provider === "azure_openai") missing = need("azure_endpoint", "azure_deployment");
        else if (provider === "ollama") missing = need("llm_base_url");
        if (missing) {
          return { ok: false, message: `Missing required field: ${String(missing)}` };
        }
        return {
          ok: true,
          message: `Reached ${provider} (${s.llm_model || "default model"}) — mock response`,
          latency_ms: 120 + Math.floor(Math.random() * 80),
        };
      },
    ),

  // ----- Events: edit / delete -----
  updateEvent: (
    id: string,
    patch: Partial<Pick<CalendarEvent, "title" | "start" | "end" | "description" | "location" | "room_resource_email" | "attendees" | "attendee_details">>,
    sendUpdates: "all" | "none" = "none",
  ) =>
    withFallback(
      () =>
        requestApi<CalendarEvent>("PATCH", `/events/${id}`, { ...patch, send_updates: sendUpdates }),
      () => {
        const ev = mockState.events.find((e) => e.id === id);
        if (!ev) throw new Error("Not found");
        Object.assign(ev, patch);
        // keep attendees array in sync with attendee_details if details given
        if (patch.attendee_details) {
          ev.attendees = patch.attendee_details.map((a) => a.email);
        }
        logAudit("event.update", `Edited "${ev.title}" (mock)`);
        return { ...ev };
      },
    ),

  deleteEvent: (id: string, sendUpdates: "all" | "none" = "none") =>
    withFallback(
      () => requestApi<void>("DELETE", `/events/${id}`, undefined, { send_updates: sendUpdates }),
      () => {
        const ev = mockState.events.find((e) => e.id === id);
        mockState.events = mockState.events.filter((e) => e.id !== id);
        logAudit("event.delete", `Deleted "${ev?.title ?? id}" (mock)`);
      },
    ),

  // ----- Rooms -----
  searchRooms: (q: string, start?: string, end?: string) =>
    withFallback(
      () => requestApi<Room[]>("GET", "/rooms", undefined, { q, start, end }),
      () => {
        const ql = q.trim().toLowerCase();
        const matches = ql
          ? MOCK_ROOMS.filter(
              (r) =>
                r.name.toLowerCase().includes(ql) ||
                r.building?.toLowerCase().includes(ql) ||
                r.email.toLowerCase().includes(ql),
            )
          : MOCK_ROOMS.slice();
        const s = start ? new Date(start).getTime() : 0;
        const e = end ? new Date(end).getTime() : 0;
        return matches.map((r) => {
          let available = true;
          if (s && e) {
            available = !mockState.events.some(
              (ev) =>
                ev.room_resource_email === r.email &&
                new Date(ev.start).getTime() < e &&
                new Date(ev.end).getTime() > s,
            );
            // pretend a couple are busy for demo flair
            if (r.id === "r3" || r.id === "r6") available = false;
          }
          return { ...r, available };
        });
      },
    ),

  // ----- Attendees -----
  suggestAttendees: (q: string) =>
    withFallback(
      () => requestApi<Attendee[]>("GET", "/attendees/suggest", undefined, { q }),
      () => {
        const ql = q.trim().toLowerCase();
        if (!ql) return MOCK_DIRECTORY.slice(0, 5);
        return MOCK_DIRECTORY.filter(
          (a) =>
            a.email.toLowerCase().includes(ql) ||
            (a.name?.toLowerCase().includes(ql) ?? false),
        ).slice(0, 8);
      },
    ),

  // ----- Conferencing -----
  addConference: (eventId: string, body: { provider: ConferenceProvider; url?: string }) =>
    withFallback(
      () => requestApi<ConferenceLink>("POST", `/events/${eventId}/conference`, body),
      () => {
        const ev = mockState.events.find((e) => e.id === eventId);
        if (!ev) throw new Error("Not found");
        const link = mockGenerateConferenceLink(body.provider, body.url);
        ev.conference = link;
        logAudit("conference.add", `Added ${body.provider} link to "${ev.title}" (mock)`);
        return { ...link };
      },
    ),
  removeConference: (eventId: string) =>
    withFallback(
      () => requestApi<void>("DELETE", `/events/${eventId}/conference`),
      () => {
        const ev = mockState.events.find((e) => e.id === eventId);
        if (!ev) return;
        delete ev.conference;
        logAudit("conference.remove", `Removed conference from "${ev.title}" (mock)`);
      },
    ),
  conferenceProviders: () =>
    withFallback(
      () => requestApi<ConferenceProviderStatus[]>("GET", "/conference/providers"),
      () => {
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
    ),
  zoomConnectUrl: () => `${API_BASE}/auth/zoom`,
  zoomDisconnect: () =>
    withFallback(
      () => requestApi<void>("POST", "/conference/zoom/disconnect"),
      () => {
        mockState.conference.zoom = { connected: false, email: undefined };
        logAudit("conference.zoom.disconnect", "Disconnected Zoom (mock)");
      },
    ),
} satisfies ApiPort;

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
  mockListeners.forEach(() => {});
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
