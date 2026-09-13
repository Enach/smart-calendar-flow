/**
 * Manager / team API (T-43 UI surface).
 *
 * Pure mock implementation persisted in localStorage so a full session
 * round-trips across reloads without a backend.
 */

import type { Attendee } from "./types";
import { api, isUsingMocks, requestApi } from "./client";

async function withFallback<T>(real: () => Promise<T>, mock: () => T | Promise<T>): Promise<T> {
  if (isUsingMocks()) return mock();
  return real();
}
import { managerRosterSchema, scanConfirmationSchema, scanPreviewSchema, type ManagerMemberWire, type ManagerRosterWire, type ScanConfirmation, type ScanPreview } from "@/contracts/managerTeam";

// ---------- Types ----------

export type Cadence = "weekly" | "biweekly" | "monthly" | "custom" | "none";

export interface ManagerProfile {
  is_manager: boolean;
  onboarding_profile_selected: boolean;
}

export interface TeamMember {
  email: string;
  display_name: string;
  cadence: Cadence;
  custom_cadence_days?: number;
  /** ISO date of last 1:1, or null. */
  last_one_on_one?: string | null;
  source: "auto" | "manual" | "formal";
  is_paceday_user: boolean;
  data_available: boolean;
  added_at: string;
}

export interface FocusWeekStat {
  /** ISO date for Monday of the week. */
  week_start: string;
  meeting_minutes: number;
  focus_minutes: number;
  free_minutes: number;
}

export interface MemberAnalytics {
  email: string;
  weeks: FocusWeekStat[];
  one_on_ones: Array<{ date: string; title: string }>;
  is_paceday_user: boolean;
  data_available: boolean;
}

export interface OneOnOneGap {
  email: string;
  display_name: string;
  cadence: Cadence;
  last_one_on_one?: string | null;
  /** Negative = upcoming. Positive = overdue. */
  days_overdue: number;
}

export interface DetectionResult {
  scanned_at: string;
  added: number;
  total: number;
}

// ---------- Storage ----------

const STORAGE_KEY = "paceday:manager:v1";

interface Persisted {
  profile: ManagerProfile;
  members: TeamMember[];
  last_scan_at?: string;
}

const DEFAULT_PROFILE: ManagerProfile = {
  is_manager: false,
  onboarding_profile_selected: false,
};

const SEED_MEMBERS: TeamMember[] = [
  {
    email: "sarah.chen@co.com",
    display_name: "Sarah Chen",
    cadence: "weekly",
    last_one_on_one: isoDaysAgo(9),
    source: "auto",
    is_paceday_user: true,
    data_available: true,
    added_at: isoDaysAgo(40),
  },
  {
    email: "miguel.alvarez@co.com",
    display_name: "Miguel Alvarez",
    cadence: "weekly",
    last_one_on_one: isoDaysAgo(5),
    source: "auto",
    is_paceday_user: false,
    data_available: true,
    added_at: isoDaysAgo(40),
  },
  {
    email: "priya.nair@co.com",
    display_name: "Priya Nair",
    cadence: "biweekly",
    last_one_on_one: isoDaysAgo(11),
    source: "auto",
    is_paceday_user: true,
    data_available: true,
    added_at: isoDaysAgo(40),
  },
  {
    email: "tom.becker@co.com",
    display_name: "Tom Becker",
    cadence: "monthly",
    last_one_on_one: isoDaysAgo(36),
    source: "auto",
    is_paceday_user: false,
    data_available: true,
    added_at: isoDaysAgo(40),
  },
  {
    email: "leo.park@external.io",
    display_name: "Leo Park",
    cadence: "biweekly",
    last_one_on_one: isoDaysAgo(20),
    source: "manual",
    is_paceday_user: false,
    data_available: false,
    added_at: isoDaysAgo(20),
  },
];

function isoDaysAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString();
}

function load(): Persisted {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { profile: { ...DEFAULT_PROFILE }, members: [] };
    return JSON.parse(raw) as Persisted;
  } catch {
    return { profile: { ...DEFAULT_PROFILE }, members: [] };
  }
}

function save(state: Persisted) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* ignore */
  }
}

// ---------- Cadence helpers ----------

export function cadenceDays(c: Cadence, custom?: number): number | null {
  switch (c) {
    case "weekly":
      return 7;
    case "biweekly":
      return 14;
    case "monthly":
      return 30;
    case "custom":
      return Math.max(1, Math.round(custom ?? 7));
    case "none":
      return null;
  }
}

export function cadenceLabel(c: Cadence, custom?: number): string {
  switch (c) {
    case "weekly":
      return "Weekly";
    case "biweekly":
      return "Every 2 weeks";
    case "monthly":
      return "Monthly";
    case "custom":
      return `Every ${custom ?? 7}d`;
    case "none":
      return "No cadence";
  }
}

/**
 * Days overdue. >0 = overdue, 0 = due today, <0 = upcoming.
 * Returns null when cadence=none.
 */
export function computeDaysOverdue(m: TeamMember): number | null {
  const days = cadenceDays(m.cadence, m.custom_cadence_days);
  if (days == null) return null;
  if (!m.last_one_on_one) return Math.max(1, days); // never met → very overdue
  const last = new Date(m.last_one_on_one).getTime();
  const due = last + days * 86400000;
  const now = Date.now();
  return Math.round((now - due) / 86400000);
}

// ---------- Mock analytics generator ----------

function mockAnalyticsFor(m: TeamMember): MemberAnalytics {
  const weeks: FocusWeekStat[] = [];
  const monday = (() => {
    const d = new Date();
    const day = d.getDay();
    const diff = day === 0 ? -6 : 1 - day;
    d.setDate(d.getDate() + diff);
    d.setHours(0, 0, 0, 0);
    return d;
  })();
  // Deterministic-ish hash from email
  const seed = Array.from(m.email).reduce((a, c) => a + c.charCodeAt(0), 0);
  for (let i = 11; i >= 0; i--) {
    const ws = new Date(monday);
    ws.setDate(ws.getDate() - i * 7);
    const r = (n: number) => ((seed * (i + 1) * (n + 3)) % 100) / 100;
    const meetings = Math.round(120 + r(1) * 600);
    const focus = m.is_paceday_user
      ? Math.round(60 + r(2) * 480)
      : Math.round(30 + r(2) * 200);
    const free = Math.max(0, 2400 - meetings - focus);
    weeks.push({
      week_start: ws.toISOString().slice(0, 10),
      meeting_minutes: meetings,
      focus_minutes: focus,
      free_minutes: free,
    });
  }
  const oneOnOnes = m.last_one_on_one
    ? [
        { date: m.last_one_on_one, title: `1:1 with ${m.display_name}` },
        { date: isoDaysAgo(20), title: `1:1 with ${m.display_name}` },
        { date: isoDaysAgo(34), title: `1:1 with ${m.display_name}` },
      ]
    : [];
  return {
    email: m.email,
    weeks,
    one_on_ones: oneOnOnes,
    is_paceday_user: m.is_paceday_user,
    data_available: m.data_available,
  };
}

// ---------- Query keys ----------

/** Smallest-scope React Query keys for the manager surface. */
export const managerKeys = {
  profile: ["manager", "profile"] as const,
  team: (teamId?: string | null) => ["manager-team", teamId ?? "global"] as const,
  gaps: (teamId?: string | null) => ["manager", "gaps", teamId ?? "global"] as const,
  analytics: (week: string, teamId?: string | null) => ["manager", "analytics", teamId ?? "global", week] as const,
};

// ---------- Validation ----------

export class ManagerValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ManagerValidationError";
  }
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const CADENCE_VALUES: Cadence[] = ["weekly", "biweekly", "monthly", "custom", "none"];

/** Returns an error message, or null when the input is valid. */
export function validateMemberInput(input: {
  email: string;
  cadence: Cadence | string;
  custom_cadence_days?: number;
}): string | null {
  const email = input.email?.trim().toLowerCase() ?? "";
  if (!email) return "Email is required.";
  if (!EMAIL_RE.test(email)) return "Enter a valid email address.";
  if (!CADENCE_VALUES.includes(input.cadence as Cadence)) return "Choose a valid cadence.";
  if (input.cadence === "custom") {
    const d = input.custom_cadence_days;
    if (d == null || !Number.isFinite(d) || !Number.isInteger(d) || d < 1 || d > 365) {
      return "Custom cadence must be a whole number of days between 1 and 365.";
    }
  }
  return null;
}

function assertMemberInput(input: { email: string; cadence: Cadence; custom_cadence_days?: number }) {
  const err = validateMemberInput(input);
  if (err) throw new ManagerValidationError(err);
}

/** Validate a cadence-only patch (member edit). */
export function validateCadencePatch(cadence: Cadence, customDays?: number): string | null {
  return validateMemberInput({ email: "placeholder@example.com", cadence, custom_cadence_days: customDays });
}

// ---------- Public API ----------




export function normalizeRemoteMember(raw: ManagerMemberWire): TeamMember {
  return {
    email: raw.email,
    display_name: raw.display_name,
    cadence: raw.cadence,
    custom_cadence_days: raw.cadence_custom_days ?? undefined,
    last_one_on_one: raw.last_one_on_one_at,
    source: raw.source,
    is_paceday_user: raw.is_paceday_user,
    data_available: raw.this_week.data_available && raw.last_week.data_available,
    added_at: new Date().toISOString(),
  };
}

function requireTeamId(teamId: string): string {
  const normalized = teamId.trim();
  if (!normalized) throw new ManagerValidationError("team_id is required.");
  return normalized;
}

function managerQuery(teamId: string): Record<string, string> {
  return { team_id: requireTeamId(teamId) };
}

function mockMemberToWire(member: TeamMember): ManagerMemberWire {
  const week = { focus_minutes: 0, meeting_minutes: 0, free_minutes: 0, data_available: member.data_available };
  return {
    email: member.email, display_name: member.display_name, source: member.source, cadence: member.cadence,
    cadence_custom_days: member.custom_cadence_days ?? null,
    last_one_on_one_at: member.last_one_on_one ?? null, is_paceday_user: member.is_paceday_user,
    this_week: week, last_week: week, focus_trend_pct: 0,
  };
}

function mockScanPreview(teamId: string): ScanPreview {
  return {
    team_id: teamId, scanned_at: new Date().toISOString(), detected: SEED_MEMBERS.length,
    eligible: SEED_MEMBERS.length, assigned: 0, skipped: 0,
    candidates: SEED_MEMBERS.map((member) => ({ email: member.email, display_name: member.display_name, already_assigned: false })),
  };
}

function mockConfirmScan(teamId: string, emails: string[]): ScanConfirmation {
  const selected = new Set(emails.map((email) => email.trim().toLowerCase()));
  let assigned = 0;
  for (const member of SEED_MEMBERS) {
    if (!selected.has(member.email)) continue;
    managerApi.addMember({ email: member.email, display_name: member.display_name, cadence: member.cadence });
    assigned += 1;
  }
  return { team_id: teamId, assigned, skipped: Math.max(0, selected.size - assigned), total: managerApi.listTeam().length };
}

function detectRemote(teamId: string): Promise<ScanPreview> {
  return withFallback<ScanPreview>(
    async () => {
      const raw = await requestApi<unknown>("POST", "/manager/detect", undefined, managerQuery(teamId));
      const result = scanPreviewSchema.parse(raw);
      if (result.team_id !== teamId) throw new ManagerValidationError("Scan response does not match the active team.");
      return result;
    },
    () => mockScanPreview(teamId),
  );
}

const managerRemote = {
  getProfile: () =>
    withFallback<ManagerProfile>(
      async () => {
        const raw = await requestApi<{ is_manager?: boolean; detected_at?: string | null }>("GET", "/manager/profile");
        const state = load();
        state.profile = {
          is_manager: raw.is_manager ?? false,
          onboarding_profile_selected: Boolean(raw.detected_at) || state.profile.onboarding_profile_selected,
        };
        save(state);
        return { ...state.profile };
      },
      () => managerApi.getProfile(),
    ),

  setProfile: (patch: Partial<ManagerProfile>) =>
    withFallback<ManagerProfile>(
      async () => {
        if (patch.is_manager !== undefined) {
          await requestApi("POST", "/manager/profile", { is_manager: patch.is_manager });
        }
        const state = load();
        state.profile = { ...state.profile, ...patch };
        save(state);
        return { ...state.profile };
      },
      () => managerApi.setProfile(patch),
    ),

  listTeam: (teamId: string) =>
    withFallback<ManagerRosterWire>(
      async () => {
        const raw = await requestApi<unknown>("GET", "/manager/team", undefined, managerQuery(teamId));
        const roster = managerRosterSchema.parse(raw);
        if (roster.team_id !== teamId) throw new ManagerValidationError("Roster response does not match the active team.");
        const state = load();
        state.members = roster.members.map(normalizeRemoteMember);
        save(state);
        return roster;
      },
      () => ({ team_id: requireTeamId(teamId), members: managerApi.listTeam().map(mockMemberToWire) }),
    ),

  addMember: (input: {
    email: string;
    display_name?: string;
    cadence: Cadence;
    custom_cadence_days?: number;
  }, teamId: string) =>
    withFallback<{ member: TeamMember; alreadyAuto: boolean }>(
      async () => {
        assertMemberInput(input);

        await requestApi("POST", "/manager/team/members", {
          email: input.email,
          display_name: input.display_name ?? "",
          cadence: input.cadence,
          cadence_custom_days: input.custom_cadence_days,
        }, managerQuery(teamId));
        const roster = await managerRemote.listTeam(teamId);
        const member = roster.members.map(normalizeRemoteMember).find((m) => m.email === input.email.trim().toLowerCase());
        if (!member) throw new Error("backend did not return the new team member");
        return { member, alreadyAuto: false };
      },
      () => managerApi.addMember(input),
    ),

  updateMember: (email: string, patch: Partial<TeamMember>, teamId: string) =>
    withFallback<TeamMember | null>(
      async () => {
        if (patch.cadence !== undefined) {
          const err = validateCadencePatch(patch.cadence, patch.custom_cadence_days);
          if (err) throw new ManagerValidationError(err);
        }
        const body = {

          ...(patch.display_name === undefined ? {} : { display_name: patch.display_name }),
          ...(patch.cadence === undefined ? {} : { cadence: patch.cadence }),
          ...(patch.custom_cadence_days === undefined ? {} : { cadence_custom_days: patch.custom_cadence_days }),
        };
        await requestApi("PATCH", "/manager/team/members/" + encodeURIComponent(email), body, managerQuery(teamId));
        const roster = await managerRemote.listTeam(teamId);
        return roster.members.map(normalizeRemoteMember).find((m) => m.email === email.toLowerCase()) ?? null;
      },
      () => managerApi.updateMember(email, patch),
    ),

  removeMember: (email: string, teamId: string) =>
    withFallback<void>(
      async () => {
        await requestApi("DELETE", "/manager/team/members/" + encodeURIComponent(email), undefined, managerQuery(teamId));
        const state = load();
        state.members = state.members.filter((m) => m.email !== email.toLowerCase());
        save(state);
      },
      () => managerApi.removeMember(email),
    ),

  detect: detectRemote,

  confirmDetect: (teamId: string, emails: string[]) =>
    withFallback<ScanConfirmation>(
      async () => {
        const normalized = Array.from(new Set(emails.map((email) => email.trim().toLowerCase())));
        if (normalized.some((email) => !EMAIL_RE.test(email))) throw new ManagerValidationError("Every selected candidate must have a valid email address.");
        const raw = await requestApi<unknown>("POST", "/manager/detect/confirm", { emails: normalized }, managerQuery(teamId));
        const result = scanConfirmationSchema.parse(raw);
        if (result.team_id !== teamId) throw new ManagerValidationError("Confirmation response does not match the active team.");
        return result;
      },
      () => mockConfirmScan(requireTeamId(teamId), emails),
    ),

  gaps: (teamId: string) =>
    withFallback<OneOnOneGap[]>(
      async () => {
        const raw = await requestApi<{ gaps?: RawGap[] }>(
          "GET", "/manager/gaps", undefined, managerQuery(teamId),
        );
        return normalizeGaps(raw);
      },
      () => managerApi.gaps(),
    ),

  /**
   * GET /api/manager/analytics?week=YYYY-MM-DD -> { members: [...] }
   * `week` must be the ISO date of a Monday.
   */
  analytics: (week: string, teamId: string) =>
    withFallback<MemberAnalytics[]>(
      async () => {
        if (!DATE_RE.test(week)) throw new ManagerValidationError("Week must be an ISO date (YYYY-MM-DD).");
        const raw = await requestApi<{ members?: RawAnalyticsMember[] }>(
          "GET",
          "/manager/analytics",
          undefined,
          { week, ...managerQuery(teamId) },
        );
        return normalizeAnalytics(raw, week);
      },
      () =>
        managerApi
          .listTeam()
          .map((m) => managerApi.analytics(m.email))
          .filter((a): a is MemberAnalytics => a !== null),
    ),

  /**
   * POST /api/manager/team/members/:email/schedule -> { prefill_url }
   * The URL is always server-generated; we never fabricate one online.
   */
  schedulePrefillUrl: (email: string, suggestedDate: string | undefined, teamId: string) =>
    withFallback<string>(
      async () => {
        if (!EMAIL_RE.test(email.trim())) throw new ManagerValidationError("Enter a valid email address.");
        if (suggestedDate !== undefined && !DATE_RE.test(suggestedDate)) {
          throw new ManagerValidationError("Suggested date must be an ISO date (YYYY-MM-DD).");
        }
        const raw = await requestApi<{ prefill_url?: string }>(
          "POST",
          `/manager/team/members/${encodeURIComponent(email)}/schedule`,
          suggestedDate ? { suggested_date: suggestedDate } : {},
          managerQuery(teamId),
        );
        if (!raw?.prefill_url) throw new Error("backend did not return a prefill_url");
        return raw.prefill_url;
      },
      () => managerApi.schedulePrefillUrl(email),
    ),
};

// ---------- Response normalization (exported for tests) ----------

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export interface RawGap {
  member_email: string;
  display_name?: string;
  cadence?: Cadence;
  last_one_on_one_at?: string | null;
  days_overdue?: number;
}

export function normalizeGaps(raw: { gaps?: RawGap[] } | null | undefined): OneOnOneGap[] {
  return (raw?.gaps ?? []).map((gap) => ({
    email: gap.member_email,
    display_name: gap.display_name || gap.member_email.split("@")[0],
    cadence: gap.cadence ?? "none",
    last_one_on_one: gap.last_one_on_one_at ?? null,
    days_overdue: Number.isFinite(gap.days_overdue) ? Number(gap.days_overdue) : 0,
  }));
}

export interface RawAnalyticsMember {
  email: string;
  is_paceday_user?: boolean;
  data_available?: boolean;
  week_start?: string;
  meeting_minutes?: number;
  focus_minutes?: number;
  free_minutes?: number;
  weeks?: Array<{
    week_start?: string;
    meeting_minutes?: number;
    focus_minutes?: number;
    free_minutes?: number;
  }>;
  one_on_ones?: Array<{ date: string; title?: string }>;
}

export function normalizeAnalytics(
  raw: { members?: RawAnalyticsMember[] } | null | undefined,
  week: string,
): MemberAnalytics[] {
  return (raw?.members ?? []).map((m) => {
    const source =
      m.weeks && m.weeks.length > 0
        ? m.weeks
        : [{ week_start: m.week_start ?? week, meeting_minutes: m.meeting_minutes, focus_minutes: m.focus_minutes, free_minutes: m.free_minutes }];
    return {
      email: m.email,
      is_paceday_user: m.is_paceday_user ?? false,
      data_available: m.data_available ?? true,
      weeks: source.map((w) => ({
        week_start: w.week_start ?? week,
        meeting_minutes: Number(w.meeting_minutes ?? 0),
        focus_minutes: Number(w.focus_minutes ?? 0),
        free_minutes: Number(w.free_minutes ?? 0),
      })),
      one_on_ones: (m.one_on_ones ?? []).map((o) => ({ date: o.date, title: o.title ?? "1:1" })),
    };
  });
}


export const managerApi = {
  remote: managerRemote,
  getProfile(): ManagerProfile {
    return { ...load().profile };
  },

  setProfile(patch: Partial<ManagerProfile>): ManagerProfile {
    const s = load();
    s.profile = { ...s.profile, ...patch };
    save(s);
    return { ...s.profile };
  },

  listTeam(): TeamMember[] {
    return load().members.slice().sort((a, b) =>
      a.display_name.localeCompare(b.display_name),
    );
  },

  addMember(input: {
    email: string;
    display_name?: string;
    cadence: Cadence;
    custom_cadence_days?: number;
  }): { member: TeamMember; alreadyAuto: boolean } {
    const s = load();
    const email = input.email.trim().toLowerCase();
    const existing = s.members.find((m) => m.email === email);
    if (existing) {
      const alreadyAuto = existing.source === "auto";
      existing.cadence = input.cadence;
      existing.custom_cadence_days = input.custom_cadence_days;
      if (input.display_name) existing.display_name = input.display_name;
      save(s);
      return { member: { ...existing }, alreadyAuto };
    }
    const member: TeamMember = {
      email,
      display_name:
        input.display_name?.trim() ||
        email
          .split("@")[0]
          .replace(/[._-]+/g, " ")
          .replace(/\b\w/g, (c) => c.toUpperCase()),
      cadence: input.cadence,
      custom_cadence_days: input.custom_cadence_days,
      last_one_on_one: null,
      source: "manual",
      is_paceday_user: /paceday\.com$/i.test(email),
      data_available: !/gmail\.com|yahoo\.com|icloud\.com|me\.com|proton/i.test(email),
      added_at: new Date().toISOString(),
    };
    s.members.push(member);
    save(s);
    return { member, alreadyAuto: false };
  },

  updateMember(email: string, patch: Partial<TeamMember>): TeamMember | null {
    const s = load();
    const m = s.members.find((x) => x.email === email);
    if (!m) return null;
    Object.assign(m, patch);
    save(s);
    return { ...m };
  },

  removeMember(email: string): void {
    const s = load();
    s.members = s.members.filter((m) => m.email !== email);
    save(s);
  },

  async detect(): Promise<DetectionResult> {
    const s = load();
    let added = 0;
    for (const seed of SEED_MEMBERS) {
      if (!s.members.find((m) => m.email === seed.email)) {
        s.members.push({ ...seed });
        added += 1;
      }
    }
    s.last_scan_at = new Date().toISOString();
    save(s);
    // Simulate latency
    await new Promise((r) => setTimeout(r, 700));
    return {
      scanned_at: s.last_scan_at,
      added,
      total: s.members.length,
    };
  },

  lastScanAt(): string | undefined {
    return load().last_scan_at;
  },

  gaps(): OneOnOneGap[] {
    const list: OneOnOneGap[] = [];
    for (const m of load().members) {
      const overdue = computeDaysOverdue(m);
      if (overdue == null) continue;
      list.push({
        email: m.email,
        display_name: m.display_name,
        cadence: m.cadence,
        last_one_on_one: m.last_one_on_one,
        days_overdue: overdue,
      });
    }
    return list.sort((a, b) => b.days_overdue - a.days_overdue);
  },

  /** Build a /app?prefill= URL the calendar can deep-link to. */
  schedulePrefillUrl(email: string): string {
    const member = load().members.find((m) => m.email === email);
    const title = member ? `1:1 with ${member.display_name}` : "1:1";
    const params = new URLSearchParams({
      title,
      attendees: email,
      duration: "30",
    });
    return `/app?${params.toString()}`;
  },

  analytics(email: string): MemberAnalytics | null {
    const m = load().members.find((x) => x.email === email);
    if (!m) return null;
    return mockAnalyticsFor(m);
  },

  resetAll(): void {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
  },
};

// Re-export for components that want to use the directory typeahead
export type { Attendee };
export { api };
