/**
 * Teams API (T-35 / T-36 backend surface).
 *
 * The server is the source of truth (`teamsApi.remote`); the top level is a
 * local store of the last answer, read synchronously by a few pages. It
 * never invents a slot or a number: the demo's live in src/demo (PAC-83). Distinct from the manager API:
 * - manager.ts: the user's personal "people I have 1:1s with" list (Tab 1)
 * - teams.ts:   formal Paceday teams the user creates / joins for
 *               coordination (Protected Hours, Find a Time, Analytics)
 */

import { requestApi } from "./client";
import { demoOrReal } from "./demoGate";
import type { components } from "./generated/types";
import { localISODate } from "@/lib/localDate";
import { DEFAULT_TIME_FORMAT, formatMinutesOfDay, type TimeFormat } from "@/lib/timeFormat";

// ---------- Types ----------

export type TeamRole = "owner" | "member";
export type TeamMemberStatus = "active" | "pending";

export interface FormalTeamMember {
  email: string;
  display_name: string;
  role: TeamRole;
  status: TeamMemberStatus;
  is_paceday_user: boolean;
  invited_at?: string;
  joined_at?: string;
}

export interface NoMeetingZone {
  id: string;
  /** 1=Mon … 5=Fri */
  day_of_week: number;
  /** Minutes since midnight, e.g. 540 = 09:00 */
  start_min: number;
  end_min: number;
  label: string;
  created_at: string;
}

export interface FormalTeam {
  id: string;
  name: string;
  created_at: string;
  owner_email: string;
  members: FormalTeamMember[];
  no_meeting_zones: NoMeetingZone[];
}

/** One member's weeks in the team analytics view. */
export interface TeamAnalyticsRow {
  email: string;
  display_name: string;
  is_paceday_user: boolean;
  weeks: { week_start: string; meeting_minutes: number; focus_minutes: number; free_minutes: number }[];
}

export interface AvailabilitySlot {
  start: string;
  end: string;
  /** 0-100 */
  score: number;
  /** how many of the active members are free */
  free_count: number;
  total_count: number;
}

// ---------- Storage ----------

const STORAGE_KEY = "paceday:teams:v1";

interface Persisted {
  teams: FormalTeam[];
  active_team_id: string | null;
  current_user_email: string;
}

const DEFAULT_USER = "you@paceday.com";

function load(): Persisted {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { teams: [], active_team_id: null, current_user_email: DEFAULT_USER };
    return JSON.parse(raw) as Persisted;
  } catch {
    return { teams: [], active_team_id: null, current_user_email: DEFAULT_USER };
  }
}

function save(s: Persisted) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  } catch {
    /* ignore */
  }
}

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

function deriveName(email: string): string {
  return email
    .split("@")[0]
    .replace(/[._-]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

// ---------- Public API ----------


type BackendTeam = { id: string; name: string; createdAt?: string };
type BackendTeamMember = {
  userId?: string;
  email?: string;
  name?: string;
  role?: string;
  joinedAt?: string;
};
type BackendZone = {
  id: string;
  dayOfWeek?: number;
  startTime?: string;
  endTime?: string;
  label?: string;
  createdAt?: string;
};

function minutesFromTime(value?: string): number {
  if (!value) return 0;
  const parts = value.split(":").map((part) => Number(part));
  return (parts[0] || 0) * 60 + (parts[1] || 0);
}

function timeFromMinutes(value: number): string {
  const hours = Math.floor(value / 60).toString().padStart(2, "0");
  const minutes = (value % 60).toString().padStart(2, "0");
  return hours + ":" + minutes;
}

function normalizeTeam(raw: BackendTeam, members: BackendTeamMember[], zones: BackendZone[]): FormalTeam {
  const owner = members.find((member) => member.role === "owner");
  const ownerEmail = owner?.email ?? load().current_user_email;
  const normalizedMembers: FormalTeamMember[] = members.map((member) => ({
    email: member.email ?? "",
    display_name: member.name ?? deriveName(member.email ?? ""),
    role: member.role === "owner" ? "owner" : "member",
    status: "active",
    is_paceday_user: Boolean(member.userId),
    joined_at: member.joinedAt,
  }));
  return {
    id: raw.id,
    name: raw.name,
    created_at: raw.createdAt ?? new Date().toISOString(),
    owner_email: ownerEmail,
    members: normalizedMembers,
    no_meeting_zones: zones.map((zone) => ({
      id: zone.id,
      day_of_week: zone.dayOfWeek ?? 1,
      start_min: minutesFromTime(zone.startTime),
      end_min: minutesFromTime(zone.endTime),
      label: zone.label ?? "Protected hours",
      created_at: zone.createdAt ?? new Date().toISOString(),
    })),
  };
}

async function remoteTeam(id: string): Promise<FormalTeam> {
  const [detail, zones] = await Promise.all([
    requestApi<{ team?: BackendTeam; members?: BackendTeamMember[] }>("GET", "/teams/" + id),
    requestApi<BackendZone[]>("GET", "/teams/" + id + "/no-meeting-zones"),
  ]);
  return normalizeTeam(detail.team ?? { id, name: "Team" }, detail.members ?? [], zones ?? []);
}

// ---------- Team invites ----------

export interface TeamInvite {
  token: string;
  team_id: string;
  team_name: string;
  invited_email: string;
  /** The inviter's display name; null when the server could not read it. */
  inviter_name: string | null;
  /** The inviter's account email; null when the server could not read it. */
  inviter_email: string | null;
  /** RFC 3339 instant after which the invite cannot be accepted. */
  expires_at: string | null;
}

/** GET /api/teams/invites/{token} (contract TeamInvitePreview, PAC-34). */
type BackendInvite = Partial<components["schemas"]["TeamInvitePreview"]>;

export function normalizeInvite(raw: BackendInvite, token: string): TeamInvite {
  return {
    token,
    team_id: raw.team_id ?? "",
    team_name: raw.teamName || "this team",
    invited_email: (raw.email ?? "").toLowerCase(),
    inviter_name: raw.inviterName || null,
    inviter_email: raw.inviter_email || null,
    expires_at: raw.expires_at || null,
  };
}

/**
 * Invite consumption is authenticated and must never be faked: both calls go
 * straight to the backend so 401/403/404/409/410/422 stay visible in the UI
 * and the current session is preserved (cookies are sent by requestApi).
 */
export const teamInvitesApi = {
  get: (token: string) =>
    requestApi<BackendInvite>("GET", "/teams/invites/" + encodeURIComponent(token)).then((raw) =>
      normalizeInvite(raw ?? {}, token),
    ),
  accept: (token: string) =>
    requestApi<BackendInvite | void>("POST", "/teams/invites/" + encodeURIComponent(token) + "/accept"),
};

// ---------- Query keys ----------

export const teamKeys = {
  all: ["formal-teams"] as const,
  detail: (id: string) => ["formal-teams", id] as const,
  invite: (token: string) => ["team-invite", token] as const,
  availability: (id: string, date: string, duration: number) =>
    ["formal-teams", id, "availability", date, duration] as const,
  analytics: (id: string, date: string) => ["formal-team-analytics", id, date] as const,
};


// ---------- Validation ----------

export class TeamValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TeamValidationError";
  }
}

const TEAM_EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const DURATIONS_ALLOWED = [15, 30, 45, 60, 90, 120];

export function validateTeamName(name: string): string | null {
  const trimmed = name?.trim() ?? "";
  if (!trimmed) return "Team name is required.";
  if (trimmed.length > 80) return "Team name must be 80 characters or fewer.";
  return null;
}

export function validateTeamEmail(email: string): string | null {
  const trimmed = email?.trim() ?? "";
  if (!trimmed) return "Email is required.";
  if (!TEAM_EMAIL_RE.test(trimmed)) return "Enter a valid email address.";
  return null;
}

/** Weekday convention is Monday=1 … Sunday=7. */
export function validateZoneInput(input: { day_of_week: number; start_min: number; end_min: number; label?: string }): string | null {
  const { day_of_week: dow, start_min: start, end_min: end } = input;
  if (!Number.isInteger(dow) || dow < 1 || dow > 7) return "Day must be between Monday (1) and Sunday (7).";
  if (!Number.isInteger(start) || start < 0 || start > 1440) return "Start time is out of range.";
  if (!Number.isInteger(end) || end < 0 || end > 1440) return "End time is out of range.";
  if (end <= start) return "End time must be after the start time.";
  return null;
}

export function validateAvailabilityQuery(dateISO: string, durationMin: number): string | null {
  if (!ISO_DATE_RE.test(dateISO ?? "")) return "Pick a valid date.";
  if (!Number.isInteger(durationMin) || durationMin <= 0) return "Pick a valid duration.";
  if (!DURATIONS_ALLOWED.includes(durationMin)) return "Duration must be one of 15, 30, 45, 60, 90 or 120 minutes.";
  return null;
}

function assertTeams(err: string | null) {
  if (err) throw new TeamValidationError(err);
}

/**
 * GET /api/teams/ and POST /api/teams/ may return either a bare array /
 * object or an envelope with a `teams` (or `team`) property.
 */
export function unwrapTeamList(raw: unknown): BackendTeam[] {
  if (Array.isArray(raw)) return raw as BackendTeam[];
  if (raw && typeof raw === "object") {
    const teams = (raw as { teams?: unknown }).teams;
    if (Array.isArray(teams)) return teams as BackendTeam[];
  }
  return [];
}

export function unwrapTeam(raw: unknown): BackendTeam | null {
  if (!raw || typeof raw !== "object") return null;
  const envelope = raw as { team?: BackendTeam; id?: string };
  if (envelope.team?.id) return envelope.team;
  if (envelope.id) return raw as BackendTeam;
  return null;
}

const teamsRemote = {
  list: () =>
    demoOrReal<FormalTeam[]>("teams.list", [], async () => {
        const raw = unwrapTeamList(await requestApi<unknown>("GET", "/teams/"));
        const teams = await Promise.all(raw.map((team) => remoteTeam(team.id)));
        const state = load();
        state.teams = teams;
        if (state.active_team_id && !teams.some((team) => team.id === state.active_team_id)) {
          state.active_team_id = teams[0]?.id ?? null;
        }
        if (!state.active_team_id && teams[0]) state.active_team_id = teams[0].id;
        const ownerEmail = teams[0]?.owner_email;
        if (ownerEmail) state.current_user_email = ownerEmail;
        save(state);
        return teams.slice().sort((a, b) => a.name.localeCompare(b.name));
      }),

  get: (id: string) =>
    demoOrReal<FormalTeam | null>("teams.get", [id], async () => remoteTeam(id)),

  createTeam: (name: string) =>
    demoOrReal<FormalTeam>("teams.createTeam", [name], async () => {
        assertTeams(validateTeamName(name));
        const raw = unwrapTeam(await requestApi<unknown>("POST", "/teams/", { name: name.trim() }));
        if (!raw?.id) throw new TeamValidationError("The server did not return the created team.");
        const team = await remoteTeam(raw.id);
        const state = load();
        state.teams = state.teams.filter((item) => item.id !== team.id).concat(team);
        state.active_team_id = team.id;
        save(state);
        return team;
      }),

  renameTeam: (id: string, name: string) =>
    demoOrReal<FormalTeam | null>("teams.renameTeam", [id, name], async () => {
        assertTeams(validateTeamName(name));
        await requestApi("PATCH", "/teams/" + id, { name: name.trim() });
        return remoteTeam(id);
      }),

  deleteTeam: (id: string) =>
    demoOrReal<void>("teams.deleteTeam", [id], async () => {
        await requestApi("DELETE", "/teams/" + id);
        const state = load();
        state.teams = state.teams.filter((team) => team.id !== id);
        if (state.active_team_id === id) state.active_team_id = state.teams[0]?.id ?? null;
        save(state);
      }),

  inviteMember: (teamId: string, email: string, displayName?: string) =>
    demoOrReal<FormalTeamMember | null>("teams.inviteMember", [teamId, email, displayName], async () => {
        assertTeams(validateTeamEmail(email));
        await requestApi("POST", "/teams/" + teamId + "/members/invite", { email: email.trim().toLowerCase() });
        const team = await remoteTeam(teamId);
        return team.members.find((member) => member.email === email.trim().toLowerCase()) ?? {
          email: email.trim().toLowerCase(),
          display_name: displayName?.trim() || deriveName(email),
          role: "member",
          status: "pending",
          is_paceday_user: false,
          invited_at: new Date().toISOString(),
        };
      }),

  removeMember: (teamId: string, email: string) =>
    demoOrReal<void>("teams.removeMember", [teamId, email], async () => {
        const team = await remoteTeam(teamId);
        const member = team.members.find((item) => item.email === email.toLowerCase());
        if (!member) return;
        const userID = (await requestApi<{ members?: BackendTeamMember[] }>("GET", "/teams/" + teamId)).members?.find((item) => item.email?.toLowerCase() === email.toLowerCase())?.userId;
        if (!userID) throw new Error("team member has no user id");
        await requestApi("DELETE", "/teams/" + teamId + "/members/" + userID);
      }),

  addZone: (teamId: string, input: Omit<NoMeetingZone, "id" | "created_at">) =>
    demoOrReal<NoMeetingZone | null>("teams.addZone", [teamId, input], async () => {
        assertTeams(validateZoneInput(input));
        const raw = await requestApi<BackendZone>("POST", "/teams/" + teamId + "/no-meeting-zones", {
          dayOfWeek: input.day_of_week,
          startTime: timeFromMinutes(input.start_min),
          endTime: timeFromMinutes(input.end_min),
          label: input.label,
        });
        return {
          id: raw.id, day_of_week: raw.dayOfWeek ?? input.day_of_week,
          start_min: minutesFromTime(raw.startTime) || input.start_min,
          end_min: minutesFromTime(raw.endTime) || input.end_min,
          label: raw.label ?? input.label, created_at: raw.createdAt ?? new Date().toISOString(),
        };
      }),

  updateZone: (teamId: string, zoneId: string, patch: Partial<NoMeetingZone>) =>
    demoOrReal<void>("teams.updateZone", [teamId, zoneId, patch], async () => {
        const current = (await remoteTeam(teamId)).no_meeting_zones.find((zone) => zone.id === zoneId);
        if (!current) throw new Error("zone not found");
        const merged = {
          day_of_week: patch.day_of_week ?? current.day_of_week,
          start_min: patch.start_min ?? current.start_min,
          end_min: patch.end_min ?? current.end_min,
        };
        assertTeams(validateZoneInput(merged));
        await requestApi("PATCH", "/teams/" + teamId + "/no-meeting-zones/" + zoneId, {
          dayOfWeek: patch.day_of_week ?? current.day_of_week,
          startTime: timeFromMinutes(patch.start_min ?? current.start_min),
          endTime: timeFromMinutes(patch.end_min ?? current.end_min),
          label: patch.label ?? current.label,
        });
      }),

  removeZone: (teamId: string, zoneId: string) =>
    demoOrReal<void>("teams.removeZone", [teamId, zoneId], () => requestApi("DELETE", "/teams/" + teamId + "/no-meeting-zones/" + zoneId)),

  findSlots: (teamId: string, dateISO: string, durationMin: number) =>
    demoOrReal<AvailabilitySlot[]>("teams.findSlots", [teamId, dateISO, durationMin], async () => {
        assertTeams(validateAvailabilityQuery(dateISO, durationMin));
        const raw = await requestApi<{ slots?: Array<{ start: string; end: string; quality_score?: number }> }>(
          "GET", "/teams/" + teamId + "/availability", undefined, { date: dateISO, duration: String(durationMin) },
        );
        const team = await remoteTeam(teamId);
        const total = team.members.filter((member) => member.status === "active").length;
        return (raw.slots ?? []).map((slot) => ({
          start: slot.start, end: slot.end, score: slot.quality_score ?? 0,
          free_count: total, total_count: total,
        }));
      }),

  teamAnalytics: (teamId: string, dateISO?: string) =>
    demoOrReal<TeamAnalyticsRow[]>("teams.teamAnalytics", [teamId, dateISO], async () => {
        if (dateISO !== undefined) assertTeams(ISO_DATE_RE.test(dateISO) ? null : "Pick a valid date.");
        const raw = await requestApi<{
          member_breakdown?: Array<{ name?: string; meeting_minutes: number; focus_minutes: number }>;
        }>("GET", "/teams/" + teamId + "/analytics", undefined, dateISO ? { date: dateISO } : undefined);
        const team = await remoteTeam(teamId);
        const weekStart = new Date();
        const day = weekStart.getDay();
        weekStart.setDate(weekStart.getDate() + (day === 0 ? -6 : 1 - day));
        const week = localISODate(weekStart);
        return team.members
          .filter((member) => member.status === "active" && member.email !== team.owner_email)
          .map((member, index) => {
            const summary = raw.member_breakdown?.find((item) => item.name === member.display_name) ?? raw.member_breakdown?.[index];
            const meeting = summary?.meeting_minutes ?? 0;
            const focus = summary?.focus_minutes ?? 0;
            return {
              email: member.email,
              display_name: member.display_name,
              is_paceday_user: member.is_paceday_user,
              weeks: [{ week_start: week, meeting_minutes: meeting, focus_minutes: focus, free_minutes: Math.max(0, 2400 - meeting - focus) }],
            };
          });
      }),
};

export const teamsApi = {
  remote: teamsRemote,
  currentUserEmail(): string {
    return load().current_user_email;
  },

  setCurrentUserEmail(email: string) {
    const s = load();
    s.current_user_email = email;
    save(s);
  },

  list(): FormalTeam[] {
    return load().teams.slice().sort((a, b) => a.name.localeCompare(b.name));
  },

  get(id: string): FormalTeam | null {
    return load().teams.find((t) => t.id === id) ?? null;
  },

  activeTeamId(): string | null {
    const s = load();
    if (s.active_team_id && s.teams.find((t) => t.id === s.active_team_id)) {
      return s.active_team_id;
    }
    return s.teams[0]?.id ?? null;
  },

  setActiveTeam(id: string) {
    const s = load();
    s.active_team_id = id;
    save(s);
  },

  createTeam(name: string): FormalTeam {
    const s = load();
    const owner = s.current_user_email;
    const team: FormalTeam = {
      id: uid(),
      name: name.trim(),
      created_at: new Date().toISOString(),
      owner_email: owner,
      members: [
        {
          email: owner,
          display_name: "You",
          role: "owner",
          status: "active",
          is_paceday_user: true,
          joined_at: new Date().toISOString(),
        },
      ],
      no_meeting_zones: [],
    };
    s.teams.push(team);
    s.active_team_id = team.id;
    save(s);
    return team;
  },

  renameTeam(id: string, name: string): FormalTeam | null {
    const s = load();
    const t = s.teams.find((x) => x.id === id);
    if (!t) return null;
    t.name = name.trim();
    save(s);
    return t;
  },

  deleteTeam(id: string) {
    const s = load();
    s.teams = s.teams.filter((t) => t.id !== id);
    if (s.active_team_id === id) s.active_team_id = s.teams[0]?.id ?? null;
    save(s);
  },

  inviteMember(teamId: string, email: string, displayName?: string): FormalTeamMember | null {
    const s = load();
    const t = s.teams.find((x) => x.id === teamId);
    if (!t) return null;
    const norm = email.trim().toLowerCase();
    const existing = t.members.find((m) => m.email === norm);
    if (existing) return existing;
    const member: FormalTeamMember = {
      email: norm,
      display_name: displayName?.trim() || deriveName(norm),
      role: "member",
      status: "pending",
      is_paceday_user: /paceday\.com$/i.test(norm),
      invited_at: new Date().toISOString(),
    };
    t.members.push(member);
    save(s);
    return member;
  },

  /** Mock-accept an invite (single-browser demo). */
  acceptInvite(teamId: string, email: string): FormalTeamMember | null {
    const s = load();
    const t = s.teams.find((x) => x.id === teamId);
    if (!t) return null;
    const m = t.members.find((x) => x.email === email.toLowerCase());
    if (!m) return null;
    m.status = "active";
    m.joined_at = new Date().toISOString();
    save(s);
    return m;
  },

  removeMember(teamId: string, email: string) {
    const s = load();
    const t = s.teams.find((x) => x.id === teamId);
    if (!t) return;
    t.members = t.members.filter((m) => m.email !== email.toLowerCase());
    save(s);
  },

  // ---------- No-meeting zones ----------

  addZone(teamId: string, input: Omit<NoMeetingZone, "id" | "created_at">): NoMeetingZone | null {
    const s = load();
    const t = s.teams.find((x) => x.id === teamId);
    if (!t) return null;
    const zone: NoMeetingZone = {
      ...input,
      id: uid(),
      created_at: new Date().toISOString(),
    };
    t.no_meeting_zones.push(zone);
    save(s);
    return zone;
  },

  updateZone(teamId: string, zoneId: string, patch: Partial<NoMeetingZone>) {
    const s = load();
    const t = s.teams.find((x) => x.id === teamId);
    if (!t) return;
    const z = t.no_meeting_zones.find((x) => x.id === zoneId);
    if (!z) return;
    Object.assign(z, patch);
    save(s);
  },

  removeZone(teamId: string, zoneId: string) {
    const s = load();
    const t = s.teams.find((x) => x.id === teamId);
    if (!t) return;
    t.no_meeting_zones = t.no_meeting_zones.filter((z) => z.id !== zoneId);
    save(s);
  },

  resetAll() {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
  },
};

// ---------- Helpers exposed to UI ----------

export const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri"];

/** Minutes after midnight as a time of day, in the user's format (PAC-55). */
export function fmtTime(min: number, tf: TimeFormat = DEFAULT_TIME_FORMAT): string {
  return formatMinutesOfDay(min, tf);
}
