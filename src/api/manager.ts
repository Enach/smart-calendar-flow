/**
 * Manager / team API (T-43 UI surface).
 *
 * Pure mock implementation persisted in localStorage so a full session
 * round-trips across reloads without a backend.
 */

import type { Attendee } from "./types";
import { api, requestApi, withFallback } from "./client";

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
  source: "auto" | "manual";
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
  team: ["manager-team"] as const,
  gaps: ["manager", "gaps"] as const,
  analytics: (week: string) => ["manager", "analytics", week] as const,
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




type BackendManagerMember = {
  email: string;
  display_name?: string;
  source?: "auto" | "manual";
  cadence?: Cadence;
  cadence_custom_days?: number;
  last_one_on_one_at?: string | null;
  is_paceday_user?: boolean;
  this_week?: { data_available?: boolean };
};

function normalizeRemoteMember(raw: BackendManagerMember): TeamMember {
  return {
    email: raw.email,
    display_name: raw.display_name || raw.email.split("@")[0],
    cadence: raw.cadence ?? "none",
    custom_cadence_days: raw.cadence_custom_days,
    last_one_on_one: raw.last_one_on_one_at ?? null,
    source: raw.source ?? "manual",
    is_paceday_user: raw.is_paceday_user ?? false,
    data_available: raw.this_week?.data_available ?? false,
    added_at: new Date().toISOString(),
  };
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

  listTeam: () =>
    withFallback<TeamMember[]>(
      async () => {
        const raw = await requestApi<{ members?: BackendManagerMember[] }>("GET", "/manager/team");
        const members = (raw.members ?? []).map(normalizeRemoteMember);
        const state = load();
        state.members = members;
        save(state);
        return members.slice().sort((a, b) => a.display_name.localeCompare(b.display_name));
      },
      () => managerApi.listTeam(),
    ),

  addMember: (input: {
    email: string;
    display_name?: string;
    cadence: Cadence;
    custom_cadence_days?: number;
  }) =>
    withFallback<{ member: TeamMember; alreadyAuto: boolean }>(
      async () => {
        await requestApi("POST", "/manager/team/members", {
          email: input.email,
          display_name: input.display_name ?? "",
          cadence: input.cadence,
          cadence_custom_days: input.custom_cadence_days,
        });
        const members = await managerRemote.listTeam();
        const member = members.find((m) => m.email === input.email.trim().toLowerCase());
        if (!member) throw new Error("backend did not return the new team member");
        return { member, alreadyAuto: false };
      },
      () => managerApi.addMember(input),
    ),

  updateMember: (email: string, patch: Partial<TeamMember>) =>
    withFallback<TeamMember | null>(
      async () => {
        const body = {
          ...(patch.display_name === undefined ? {} : { display_name: patch.display_name }),
          ...(patch.cadence === undefined ? {} : { cadence: patch.cadence }),
          ...(patch.custom_cadence_days === undefined ? {} : { cadence_custom_days: patch.custom_cadence_days }),
        };
        await requestApi("PATCH", "/manager/team/members/" + encodeURIComponent(email), body);
        const members = await managerRemote.listTeam();
        return members.find((m) => m.email === email.toLowerCase()) ?? null;
      },
      () => managerApi.updateMember(email, patch),
    ),

  removeMember: (email: string) =>
    withFallback<void>(
      async () => {
        await requestApi("DELETE", "/manager/team/members/" + encodeURIComponent(email));
        const state = load();
        state.members = state.members.filter((m) => m.email !== email.toLowerCase());
        save(state);
      },
      () => managerApi.removeMember(email),
    ),

  detect: () =>
    withFallback<DetectionResult>(
      async () => {
        const raw = await requestApi<{ MembersAdded?: number; members_added?: number }>("POST", "/manager/detect");
        const members = await managerRemote.listTeam();
        return {
          scanned_at: new Date().toISOString(),
          added: raw.MembersAdded ?? raw.members_added ?? 0,
          total: members.length,
        };
      },
      () => managerApi.detect(),
    ),

  gaps: () =>
    withFallback<OneOnOneGap[]>(
      async () => {
        const raw = await requestApi<{ gaps?: Array<{
          member_email: string; display_name: string; cadence: Cadence;
          last_one_on_one_at?: string | null; days_overdue: number;
        }> }>("GET", "/manager/gaps");
        return (raw.gaps ?? []).map((gap) => ({
          email: gap.member_email,
          display_name: gap.display_name,
          cadence: gap.cadence,
          last_one_on_one: gap.last_one_on_one_at ?? null,
          days_overdue: gap.days_overdue,
        }));
      },
      () => managerApi.gaps(),
    ),
};

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
