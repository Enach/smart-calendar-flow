/**
 * Teams API (T-35 / T-36 backend surface, mock impl).
 *
 * Persisted in localStorage. Distinct from the manager API:
 * - manager.ts: the user's personal "people I have 1:1s with" list (Tab 1)
 * - teams.ts:   formal Paceday teams the user creates / joins for
 *               coordination (Protected Hours, Find a Time, Analytics)
 */

import { managerApi, type TeamMember as ManagerTeamMember } from "./manager";
import { getFreebusy } from "./coverageCache";
import { requestApi, withFallback } from "./client";

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

const teamsRemote = {
  list: () =>
    withFallback<FormalTeam[]>(
      async () => {
        const raw = await requestApi<BackendTeam[]>("GET", "/teams/");
        const teams = await Promise.all((raw ?? []).map((team) => remoteTeam(team.id)));
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
      },
      () => teamsApi.list(),
    ),

  get: (id: string) =>
    withFallback<FormalTeam | null>(
      async () => remoteTeam(id),
      () => teamsApi.get(id),
    ),

  createTeam: (name: string) =>
    withFallback<FormalTeam>(
      async () => {
        const raw = await requestApi<BackendTeam>("POST", "/teams/", { name: name.trim() });
        const team = await remoteTeam(raw.id);
        const state = load();
        state.teams = state.teams.filter((item) => item.id !== team.id).concat(team);
        state.active_team_id = team.id;
        save(state);
        return team;
      },
      () => teamsApi.createTeam(name),
    ),

  renameTeam: (id: string, name: string) =>
    withFallback<FormalTeam | null>(
      async () => {
        await requestApi("PATCH", "/teams/" + id, { name: name.trim() });
        return remoteTeam(id);
      },
      () => teamsApi.renameTeam(id, name),
    ),

  deleteTeam: (id: string) =>
    withFallback<void>(
      async () => {
        await requestApi("DELETE", "/teams/" + id);
        const state = load();
        state.teams = state.teams.filter((team) => team.id !== id);
        if (state.active_team_id === id) state.active_team_id = state.teams[0]?.id ?? null;
        save(state);
      },
      () => teamsApi.deleteTeam(id),
    ),

  inviteMember: (teamId: string, email: string, displayName?: string) =>
    withFallback<FormalTeamMember | null>(
      async () => {
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
      },
      () => teamsApi.inviteMember(teamId, email, displayName),
    ),

  removeMember: (teamId: string, email: string) =>
    withFallback<void>(
      async () => {
        const team = await remoteTeam(teamId);
        const member = team.members.find((item) => item.email === email.toLowerCase());
        if (!member) return;
        const userID = (await requestApi<{ members?: BackendTeamMember[] }>("GET", "/teams/" + teamId)).members?.find((item) => item.email?.toLowerCase() === email.toLowerCase())?.userId;
        if (!userID) throw new Error("team member has no user id");
        await requestApi("DELETE", "/teams/" + teamId + "/members/" + userID);
      },
      () => teamsApi.removeMember(teamId, email),
    ),

  addZone: (teamId: string, input: Omit<NoMeetingZone, "id" | "created_at">) =>
    withFallback<NoMeetingZone | null>(
      async () => {
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
      },
      () => teamsApi.addZone(teamId, input),
    ),

  updateZone: (teamId: string, zoneId: string, patch: Partial<NoMeetingZone>) =>
    withFallback<void>(
      async () => {
        const current = (await remoteTeam(teamId)).no_meeting_zones.find((zone) => zone.id === zoneId);
        if (!current) throw new Error("zone not found");
        await requestApi("PATCH", "/teams/" + teamId + "/no-meeting-zones/" + zoneId, {
          dayOfWeek: patch.day_of_week ?? current.day_of_week,
          startTime: timeFromMinutes(patch.start_min ?? current.start_min),
          endTime: timeFromMinutes(patch.end_min ?? current.end_min),
          label: patch.label ?? current.label,
        });
      },
      () => teamsApi.updateZone(teamId, zoneId, patch),
    ),

  removeZone: (teamId: string, zoneId: string) =>
    withFallback<void>(
      () => requestApi("DELETE", "/teams/" + teamId + "/no-meeting-zones/" + zoneId),
      () => teamsApi.removeZone(teamId, zoneId),
    ),

  findSlots: (teamId: string, dateISO: string, durationMin: number) =>
    withFallback<AvailabilitySlot[]>(
      async () => {
        const raw = await requestApi<{ slots?: Array<{ start: string; end: string; quality_score?: number }> }>(
          "GET", "/teams/" + teamId + "/availability", undefined, { date: dateISO, duration: String(durationMin) },
        );
        const team = await remoteTeam(teamId);
        const total = team.members.filter((member) => member.status === "active").length;
        return (raw.slots ?? []).map((slot) => ({
          start: slot.start, end: slot.end, score: slot.quality_score ?? 0,
          free_count: total, total_count: total,
        }));
      },
      () => teamsApi.findSlots(teamId, dateISO, durationMin),
    ),

  teamAnalytics: (teamId: string) =>
    withFallback<ReturnType<typeof teamsApi.teamAnalytics>>(
      async () => {
        const raw = await requestApi<{
          member_breakdown?: Array<{ name?: string; meeting_minutes: number; focus_minutes: number }>;
        }>("GET", "/teams/" + teamId + "/analytics");
        const team = await remoteTeam(teamId);
        const weekStart = new Date();
        const day = weekStart.getDay();
        weekStart.setDate(weekStart.getDate() + (day === 0 ? -6 : 1 - day));
        const week = weekStart.toISOString().slice(0, 10);
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
      },
      () => teamsApi.teamAnalytics(teamId),
    ),
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

  // ---------- Slot finder ----------

  /**
   * Return ranked slots for the team on a given date + duration.
   * Uses freebusy cache for member availability and excludes any slot
   * that overlaps a no-meeting zone.
   */
  async findSlots(teamId: string, dateISO: string, durationMin: number): Promise<AvailabilitySlot[]> {
    const team = this.get(teamId);
    if (!team) return [];
    const active = team.members.filter((m) => m.status === "active");
    if (active.length === 0) return [];

    const day = new Date(dateISO);
    day.setHours(0, 0, 0, 0);
    const dow = day.getDay() === 0 ? 7 : day.getDay(); // 1..7
    const dayStart = new Date(day);
    dayStart.setHours(8, 0, 0, 0);
    const dayEnd = new Date(day);
    dayEnd.setHours(20, 0, 0, 0);

    // Pull freebusy in one window
    let busyMap: Record<string, Array<{ start: string; end: string }>> = {};
    try {
      const fb = await getFreebusy({
        emails: active.map((m) => m.email),
        start_time: dayStart.toISOString(),
        end_time: dayEnd.toISOString(),
      });
      busyMap = fb.busy ?? {};
    } catch {
      busyMap = {};
    }

    const zones = team.no_meeting_zones.filter((z) => z.day_of_week === dow);
    const stepMin = 15;
    const slots: AvailabilitySlot[] = [];

    for (
      let cursor = new Date(dayStart);
      cursor.getTime() + durationMin * 60_000 <= dayEnd.getTime();
      cursor = new Date(cursor.getTime() + stepMin * 60_000)
    ) {
      const slotStart = new Date(cursor);
      const slotEnd = new Date(cursor.getTime() + durationMin * 60_000);
      const startMin = slotStart.getHours() * 60 + slotStart.getMinutes();
      const endMin = slotEnd.getHours() * 60 + slotEnd.getMinutes();

      // skip if overlaps a protected zone
      const inZone = zones.some((z) => !(endMin <= z.start_min || startMin >= z.end_min));
      if (inZone) continue;

      // count free members
      let free = 0;
      for (const m of active) {
        const busy = busyMap[m.email.toLowerCase()] ?? [];
        const conflict = busy.some(
          (b) => !(new Date(b.end) <= slotStart || new Date(b.start) >= slotEnd),
        );
        if (!conflict) free += 1;
      }

      if (free === 0) continue;

      // score: free fraction (0..70) + mid-day bonus (0..30)
      const freeFrac = free / active.length;
      const hour = slotStart.getHours() + slotStart.getMinutes() / 60;
      // peak around 10–11 and 14–15
      const midBonus =
        hour >= 10 && hour <= 11.5
          ? 30
          : hour >= 14 && hour <= 15.5
            ? 28
            : hour >= 9 && hour <= 16
              ? 18
              : 6;
      const score = Math.round(freeFrac * 70 + (freeFrac === 1 ? midBonus : midBonus * 0.6));

      slots.push({
        start: slotStart.toISOString(),
        end: slotEnd.toISOString(),
        score,
        free_count: free,
        total_count: active.length,
      });
    }

    // Sort by score desc, then earlier first
    slots.sort((a, b) => b.score - a.score || a.start.localeCompare(b.start));
    return slots.slice(0, 8);
  },

  // ---------- Aggregated team analytics ----------

  /**
   * Pull per-member analytics from the manager API where possible.
   * Members not in the manager team get a synthetic estimate.
   */
  teamAnalytics(teamId: string): Array<{
    email: string;
    display_name: string;
    is_paceday_user: boolean;
    weeks: { week_start: string; meeting_minutes: number; focus_minutes: number; free_minutes: number }[];
  }> {
    const team = this.get(teamId);
    if (!team) return [];
    const mgrMap = new Map<string, ManagerTeamMember>();
    for (const m of managerApi.listTeam()) mgrMap.set(m.email, m);

    return team.members
      .filter((m) => m.status === "active" && m.email !== load().current_user_email)
      .map((m) => {
        const mgr = mgrMap.get(m.email);
        if (mgr) {
          const a = managerApi.analytics(m.email);
          if (a) {
            return {
              email: m.email,
              display_name: m.display_name,
              is_paceday_user: m.is_paceday_user,
              weeks: a.weeks,
            };
          }
        }
        // Synthetic estimate for non-manager-team folks
        return {
          email: m.email,
          display_name: m.display_name,
          is_paceday_user: m.is_paceday_user,
          weeks: syntheticWeeks(m.email, m.is_paceday_user),
        };
      });
  },

  resetAll() {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
  },
};

function syntheticWeeks(email: string, paceday: boolean) {
  const seed = Array.from(email).reduce((a, c) => a + c.charCodeAt(0), 0);
  const monday = (() => {
    const d = new Date();
    const day = d.getDay();
    const diff = day === 0 ? -6 : 1 - day;
    d.setDate(d.getDate() + diff);
    d.setHours(0, 0, 0, 0);
    return d;
  })();
  const weeks = [];
  for (let i = 11; i >= 0; i--) {
    const ws = new Date(monday);
    ws.setDate(ws.getDate() - i * 7);
    const r = (n: number) => ((seed * (i + 1) * (n + 3)) % 100) / 100;
    const meetings = Math.round(120 + r(1) * 600);
    const focus = paceday ? Math.round(60 + r(2) * 480) : 0;
    const free = Math.max(0, 2400 - meetings - focus);
    weeks.push({
      week_start: ws.toISOString().slice(0, 10),
      meeting_minutes: meetings,
      focus_minutes: focus,
      free_minutes: free,
    });
  }
  return weeks;
}

// ---------- Helpers exposed to UI ----------

export const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri"];

export function fmtTime(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  const ampm = h >= 12 ? "PM" : "AM";
  const h12 = ((h + 11) % 12) + 1;
  return `${h12}:${m.toString().padStart(2, "0")} ${ampm}`;
}
