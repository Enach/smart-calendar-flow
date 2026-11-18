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
import { readBack } from "./savedButNotRead";
import type { components } from "./generated/types";
import { z as zod } from "zod";
import {
  TeamAnalytics as TeamAnalyticsSchema,
  TeamDetail as GeneratedTeamDetailSchema,
  TeamInvite as GeneratedTeamInviteSchema,
  TeamInviteResult as GeneratedTeamInviteResultSchema,
  TeamMember as GeneratedTeamMemberSchema,
  TeamPerson as TeamPersonSchema,
  TeamSlotList as TeamSlotListSchema,
} from "./generated/schemas";
import { DEFAULT_TIME_FORMAT, formatMinutesOfDay, type TimeFormat } from "@/lib/timeFormat";

// ---------- Types ----------

export type TeamRole = "owner" | "member";
/**
 * PAC-129 (spec §3.2): a Paceday member joined by accepting an invitation; an
 * added person was put on the team by an owner, without Paceday access. The
 * kind comes from the server's `kind` only, never from an account guess.
 */
export type TeamPersonKind = components["schemas"]["TeamPersonKind"];

/** PAC-129 (contract §9.1): the label an added person carries everywhere members are listed. */
export const ADDED_PERSON_LABEL = "Added (no Paceday access)";

export interface FormalTeamMember {
  email: string;
  /** The name to show: the server's name, or the address when it has none. */
  display_name: string;
  kind: TeamPersonKind;
  /** The membership role of a Paceday member; null for an added person. */
  role: TeamRole | null;
  /**
   * An added person's pending invitation. The server sends it to owners only
   * (contract §3.7, m-6); every other member gets null.
   */
  invitation: { expires_at: string } | null;
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

/** PAC-129 (contract §3.6): one member's row of the formal team analytics. */
export interface TeamAnalyticsRow {
  email: string;
  display_name: string;
  kind: TeamPersonKind;
  /** `measured`: the figures are present. `no_data`: show "No data", never zero. `withheld`: owners only. */
  figures: components["schemas"]["TeamAnalyticsFigures"];
  meeting_minutes: number | null;
  /** Always null for an added person (availability only). */
  focus_minutes: number | null;
  focus_score: number | null;
}

/** The formal team analytics for one week, as the server measured it (SF-041, SF-053). */
export interface TeamAnalyticsView {
  /** The Monday of the week asked for (YYYY-MM-DD): the week label. */
  week_start: string;
  /** Over the Paceday members whose figures are measured (server side). */
  avg_meeting_minutes: number;
  avg_focus_minutes: number;
  rows: TeamAnalyticsRow[];
}

export interface AvailabilitySlot {
  start: string;
  end: string;
  /** 0-100 */
  score: number;
  /** Members of both kinds whose availability is known: all free in this slot (SF-054). */
  free_count: number;
  /** Members whose availability could not be read. Never counted free. */
  unknown_count: number;
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


// ---------- Public API ----------


type BackendTeam = { id: string; name: string; createdAt?: string };
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

/**
 * Response parsing must never refuse an address the server accepted. The
 * contract still marks `TeamInvite.inviteeEmail` and `TeamMember.email`
 * `format: email`, which zod's email check reads more strictly than the
 * server's normaliser (net/mail): `a&b@x.example` and `pat@x.y` are valid
 * there and refused here, after the write committed. These two derived
 * schemas keep every other rule of the generated ones (strict objects, all
 * keys) and read those two addresses as strings. Request validation is
 * unchanged (validateTeamEmail).
 */
const TeamDetailSchema = GeneratedTeamDetailSchema.extend({
  members: zod.array(GeneratedTeamMemberSchema.extend({ email: zod.string().optional() })),
});
const TeamInviteResultSchema = GeneratedTeamInviteResultSchema.extend({
  invitation: GeneratedTeamInviteSchema.extend({ inviteeEmail: zod.string() }).nullable(),
});

type TeamPersonWire = zod.infer<typeof TeamPersonSchema>;

/** PAC-129: one entry of `people`, both kinds. The web reads `people`, never `members` (contract §9.1). */
export function normalizeTeamPerson(raw: TeamPersonWire): FormalTeamMember {
  return {
    email: raw.email,
    display_name: raw.name.trim() || raw.email,
    kind: raw.kind,
    role: raw.kind === "paceday" ? raw.role : null,
    invitation: raw.invitation ? { expires_at: raw.invitation.expiresAt } : null,
  };
}

function normalizeZones(zones: BackendZone[]): NoMeetingZone[] {
  return zones.map((zone) => ({
    id: zone.id,
    day_of_week: zone.dayOfWeek ?? 1,
    start_min: minutesFromTime(zone.startTime),
    end_min: minutesFromTime(zone.endTime),
    label: zone.label ?? "Protected hours",
    created_at: zone.createdAt ?? new Date().toISOString(),
  }));
}

async function remoteTeam(id: string): Promise<FormalTeam> {
  const [rawDetail, zones] = await Promise.all([
    requestApi<unknown>("GET", "/teams/" + id),
    requestApi<BackendZone[]>("GET", "/teams/" + id + "/no-meeting-zones"),
  ]);
  // Strict: an unknown key or a missing `people` throws rather than showing a
  // partial member list (SF-039 is the server's half; this is the client's).
  const detail = TeamDetailSchema.parse(rawDetail);
  const members = detail.people.map(normalizeTeamPerson);
  const owner = members.find((member) => member.role === "owner");
  return {
    id: detail.team.id,
    name: detail.team.name,
    created_at: detail.team.createdAt,
    owner_email: owner?.email ?? "",
    members,
    no_meeting_zones: normalizeZones(zones ?? []),
  };
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
        // The signed-in user is never derived from a team (PAC-129 review):
        // owner checks use the session's address (useTeamViewerEmail).
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
        // PAC-122 SF-024: the team exists now; a failed re-read is not a failed create.
        const id = raw.id;
        const team = await readBack(() => remoteTeam(id));
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
        return readBack(() => remoteTeam(id));
      }),

  deleteTeam: (id: string) =>
    demoOrReal<void>("teams.deleteTeam", [id], async () => {
        await requestApi("DELETE", "/teams/" + id);
        const state = load();
        state.teams = state.teams.filter((team) => team.id !== id);
        if (state.active_team_id === id) state.active_team_id = state.teams[0]?.id ?? null;
        save(state);
      }),

  /**
   * PAC-129 addTeamPerson: POST /api/teams/{id}/people. Adds the address to
   * the team without Paceday access; nothing is sent to them. 201 (added) and
   * 200 (already added) both answer the entry. A 422 carries the refusal's
   * exact text, which the caller shows verbatim.
   */
  addPerson: (teamId: string, email: string, name?: string) =>
    demoOrReal<FormalTeamMember>("teams.addPerson", [teamId, email, name], async () => {
        assertTeams(validateTeamEmail(email));
        const trimmedName = name?.trim();
        const raw = await requestApi<unknown>("POST", "/teams/" + teamId + "/people", {
          email: email.trim().toLowerCase(),
          ...(trimmedName ? { name: trimmedName } : {}),
        });
        return normalizeTeamPerson(TeamPersonSchema.parse(raw));
      }),

  /**
   * PAC-129 inviteTeamMember: invites the address to Paceday and, when it is
   * not on the team yet, adds it (contract §3.3). The name typed is sent
   * (SF-051). The answer says what happened; nothing here claims delivery.
   */
  inviteMember: (teamId: string, email: string, displayName?: string) =>
    demoOrReal<TeamInviteOutcome>("teams.inviteMember", [teamId, email, displayName], async () => {
        assertTeams(validateTeamEmail(email));
        const trimmedName = displayName?.trim();
        const raw = await requestApi<unknown>("POST", "/teams/" + teamId + "/members/invite", {
          email: email.trim().toLowerCase(),
          ...(trimmedName ? { name: trimmedName } : {}),
        });
        const result = TeamInviteResultSchema.parse(raw);
        return { outcome: result.outcome, person: normalizeTeamPerson(result.person) };
      }),

  /**
   * PAC-129 removeTeamPerson: DELETE /api/teams/{id}/people/{email}, for both
   * kinds. Resolves only on the 204; a 404 ("person not found") or a 422 is
   * the caller's error, never a silent success (SF-089).
   */
  removeMember: (teamId: string, email: string) =>
    demoOrReal<void>("teams.removeMember", [teamId, email], async () => {
        await requestApi("DELETE", "/teams/" + teamId + "/people/" + encodeURIComponent(email.trim().toLowerCase()));
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
        const raw = await requestApi<unknown>(
          "GET", "/teams/" + teamId + "/availability", undefined, { date: dateISO, duration: String(durationMin) },
        );
        // The counts are the server's (SF-054): never derived from the member list.
        return TeamSlotListSchema.parse(raw).slots.map((slot) => ({
          start: slot.start,
          end: slot.end,
          score: slot.quality_score,
          free_count: slot.free_count,
          unknown_count: slot.unknown_count,
          total_count: slot.total_count,
        }));
      }),

  teamAnalytics: (teamId: string, dateISO?: string) =>
    demoOrReal<TeamAnalyticsView>("teams.teamAnalytics", [teamId, dateISO], async () => {
        if (dateISO !== undefined) assertTeams(ISO_DATE_RE.test(dateISO) ? null : "Pick a valid date.");
        const raw = await requestApi<unknown>("GET", "/teams/" + teamId + "/analytics", undefined, dateISO ? { date: dateISO } : undefined);
        return normalizeTeamAnalytics(TeamAnalyticsSchema.parse(raw));
      }),
};

/**
 * PAC-129 (SF-053, SF-041): rows come from `people`, each attributed by its own
 * email (never by name or position), with the server's figures as they are:
 * nothing is computed here, no free time is invented, and the week is the
 * server's `week_start` (the week asked for).
 */
export function normalizeTeamAnalytics(raw: zod.infer<typeof TeamAnalyticsSchema>): TeamAnalyticsView {
  return {
    week_start: raw.week_start,
    avg_meeting_minutes: raw.avg_meeting_minutes,
    avg_focus_minutes: raw.avg_focus_minutes,
    rows: raw.people.map((person) => ({
      email: person.email,
      display_name: person.name.trim() || person.email,
      kind: person.kind,
      figures: person.figures,
      meeting_minutes: person.figures === "measured" ? person.meeting_minutes : null,
      focus_minutes: person.figures === "measured" && person.kind === "paceday" ? person.focus_minutes : null,
      focus_score: person.figures === "measured" && person.kind === "paceday" ? person.focus_score : null,
    })),
  };
}

/** The addresses of the team's owners (lowercase). A team may have several. */
export function teamOwnerEmails(team: Pick<FormalTeam, "members">): string[] {
  return team.members.filter((m) => m.role === "owner").map((m) => m.email.toLowerCase());
}

/** True when `me` (the signed-in user's address) is an owner of the team. */
export function isTeamOwner(team: Pick<FormalTeam, "members">, me: string | null | undefined): boolean {
  const self = (me ?? "").trim().toLowerCase();
  return self !== "" && teamOwnerEmails(team).includes(self);
}

/** Every member of both kinds except `me`: the attendees of a team meeting (AC-36). */
export function teamMembersExcept(team: Pick<FormalTeam, "members">, me: string | null | undefined): string[] {
  const self = (me ?? "").trim().toLowerCase();
  return team.members.filter((m) => m.email.toLowerCase() !== self).map((m) => m.email);
}

/** The analytics rows without the team's owners: the view shows the people the owners coordinate. */
export function analyticsRowsWithoutOwner(rows: readonly TeamAnalyticsRow[], ownerEmails: readonly string[]): TeamAnalyticsRow[] {
  const owners = new Set(ownerEmails.map((e) => e.trim().toLowerCase()));
  return rows.filter((row) => !owners.has(row.email.toLowerCase()));
}

/** What inviteTeamMember did (contract §3.3) and the entry after it. */
export interface TeamInviteOutcome {
  outcome: components["schemas"]["TeamInviteOutcome"];
  person: FormalTeamMember;
}

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
        { email: owner, display_name: "You", kind: "paceday", role: "owner", invitation: null },
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

  /**
   * The demo's add (PAC-129 §3.12): the address is put on the team as an
   * added person, once. Refusals (own address, a Paceday member, the cap) are
   * decided by the demo operation before it calls this.
   */
  addPerson(teamId: string, email: string, name?: string): { person: FormalTeamMember; created: boolean } | null {
    const s = load();
    const t = s.teams.find((x) => x.id === teamId);
    if (!t) return null;
    const norm = email.trim().toLowerCase();
    const existing = t.members.find((m) => m.email === norm);
    if (existing) return { person: existing, created: false };
    const person: FormalTeamMember = {
      email: norm,
      display_name: name?.trim() || norm,
      kind: "added",
      role: null,
      invitation: null,
    };
    t.members.push(person);
    save(s);
    return { person, created: true };
  },

  /**
   * The demo's invitation (PAC-129 §3.7): an invited person is an added
   * person with a pending invitation. Never guesses an account from a domain.
   */
  inviteMember(teamId: string, email: string, displayName?: string): TeamInviteOutcome | null {
    const s = load();
    const t = s.teams.find((x) => x.id === teamId);
    if (!t) return null;
    const norm = email.trim().toLowerCase();
    const existing = t.members.find((m) => m.email === norm);
    if (existing?.kind === "paceday") return { outcome: "already_member", person: existing };
    const pending = existing?.invitation && Date.parse(existing.invitation.expires_at) > Date.now();
    if (existing && pending) return { outcome: "already_pending", person: existing };
    const expires_at = new Date(Date.now() + 7 * 86_400_000).toISOString();
    if (existing) {
      existing.invitation = { expires_at };
      save(s);
      return { outcome: "invited", person: existing };
    }
    const person: FormalTeamMember = {
      email: norm,
      display_name: displayName?.trim() || norm,
      kind: "added",
      role: null,
      invitation: { expires_at },
    };
    t.members.push(person);
    save(s);
    return { outcome: "added_and_invited", person };
  },

  /** Mock-accept an invite (single-browser demo): the added entry becomes a Paceday member. */
  acceptInvite(teamId: string, email: string): FormalTeamMember | null {
    const s = load();
    const t = s.teams.find((x) => x.id === teamId);
    if (!t) return null;
    const m = t.members.find((x) => x.email === email.toLowerCase());
    if (!m) return null;
    m.kind = "paceday";
    m.role = "member";
    m.invitation = null;
    save(s);
    return m;
  },

  /** Removes the person (either kind) and their invitation. False when nobody was there. */
  removeMember(teamId: string, email: string): boolean {
    const s = load();
    const t = s.teams.find((x) => x.id === teamId);
    if (!t) return false;
    const before = t.members.length;
    t.members = t.members.filter((m) => m.email !== email.trim().toLowerCase());
    save(s);
    return t.members.length < before;
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
