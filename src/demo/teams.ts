/**
 * Demo-only (PAC-83): the demo's team slot finder and team analytics (made-up
 * numbers) and the demo implementation of every teamsApi.remote operation,
 * answered from the local team store. Reached only through
 * src/api/demoGate.ts in a demo session of a non-production build.
 */
import { ApiHttpError } from "@/api/client";
import {
  teamsApi,
  type AvailabilitySlot,
  type FormalTeamMember,
  type NoMeetingZone,
  type TeamAnalyticsRow,
  type TeamAnalyticsView,
  type TeamInviteOutcome,
} from "@/api/teams";
import { localISODate, mondayOf } from "@/lib/localDate";
import { getFreebusy } from "@/api/coverageCache";
import { demoMemberAnalytics } from "./manager";

  // ---------- Slot finder ----------

  /**
   * Return ranked slots for the team on a given date + duration.
   * Uses freebusy cache for member availability and excludes any slot
   * that overlaps a no-meeting zone.
   */
async function findSlots(teamId: string, dateISO: string, durationMin: number): Promise<AvailabilitySlot[]> {
    const team = teamsApi.get(teamId);
    if (!team) return [];
    // PAC-129 (AC-35): added people count, exactly like Paceday members.
    const active = team.members;
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
    // PAC-133: a member whose calendar could not be read is unknown, never
    // free. Windows reported for them still block; they are never counted free.
    let unknown = new Set<string>();
    try {
      const fb = await getFreebusy({
        emails: active.map((m) => m.email),
        start_time: dayStart.toISOString(),
        end_time: dayEnd.toISOString(),
      });
      busyMap = fb.busy ?? {};
      unknown = new Set(fb.participants.filter((p) => p.status === "unknown").map((p) => p.email.toLowerCase()));
    } catch {
      busyMap = {};
      unknown = new Set(active.map((m) => m.email.toLowerCase()));
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

      // As the server (PAC-129 §3.5): a reported busy window blocks the slot,
      // even for an unknown member; unknown is counted, never free.
      const blocked = active.some((m) =>
        (busyMap[m.email.toLowerCase()] ?? []).some(
          (b) => !(new Date(b.end) <= slotStart || new Date(b.start) >= slotEnd),
        ),
      );
      if (blocked) continue;
      const unknownCount = active.filter((m) => unknown.has(m.email.toLowerCase())).length;
      const free = active.length - unknownCount;

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
        unknown_count: unknownCount,
        total_count: active.length,
      });
    }

    // Sort by score desc, then earlier first
    slots.sort((a, b) => b.score - a.score || a.start.localeCompare(b.start));
    return slots.slice(0, 8);
}

  // ---------- Aggregated team analytics ----------

/**
 * The demo's team analytics for the week of `dateISO` (made-up numbers,
 * PAC-83), in the server's shape (PAC-129 §3.6): one row per member of both
 * kinds; an added person's row is availability only (meeting time, no focus);
 * no free time; the week is the week asked for. The demo user owns the team,
 * so no row is withheld.
 */
function teamAnalytics(teamId: string, dateISO?: string): TeamAnalyticsView {
  const week_start = mondayOf(dateISO ?? localISODate());
  const team = teamsApi.get(teamId);
  const rows: TeamAnalyticsRow[] = (team?.members ?? []).map((m) => {
    const managed = demoMemberAnalytics(m.email)?.weeks.find((w) => w.week_start === week_start);
    const synthetic = syntheticWeek(m.email, week_start);
    const meeting = managed?.meeting_minutes ?? synthetic.meeting;
    const focus = managed?.focus_minutes ?? synthetic.focus;
    const paceday = m.kind === "paceday";
    return {
      email: m.email,
      display_name: m.display_name,
      kind: m.kind,
      figures: "measured",
      meeting_minutes: meeting,
      focus_minutes: paceday ? focus : null,
      focus_score: paceday ? Math.round((focus / Math.max(1, focus + meeting)) * 100) : null,
    };
  });
  const measured = rows.filter((r) => r.kind === "paceday");
  const div = Math.max(1, measured.length);
  return {
    week_start,
    avg_meeting_minutes: Math.floor(measured.reduce((n, r) => n + (r.meeting_minutes ?? 0), 0) / div),
    avg_focus_minutes: Math.floor(measured.reduce((n, r) => n + (r.focus_minutes ?? 0), 0) / div),
    rows,
  };
}

function syntheticWeek(email: string, weekStart: string): { meeting: number; focus: number } {
  const seed = Array.from(email + weekStart).reduce((a, c) => a + c.charCodeAt(0), 0);
  const r = (n: number) => ((seed * (n + 3)) % 100) / 100;
  return { meeting: Math.round(120 + r(1) * 600), focus: Math.round(60 + r(2) * 480) };
}

// ---------- Members (PAC-129 §3.12) ----------

const LIMIT_TEXT = "this team has reached its limit of 50 members; remove someone before adding another";

function refuse(status: number, error: string): never {
  throw new ApiHttpError(status, { error }, error);
}

function addPerson(teamId: string, email: string, name?: string): FormalTeamMember {
  const team = teamsApi.get(teamId);
  if (!team) refuse(403, "forbidden");
  const norm = email.trim().toLowerCase();
  if (norm === teamsApi.currentUserEmail().toLowerCase()) refuse(422, "you cannot add your own address");
  const existing = team.members.find((m) => m.email === norm);
  if (existing?.kind === "paceday") refuse(422, "this address belongs to a Paceday member of this team");
  if (!existing && team.members.length >= 50) refuse(422, LIMIT_TEXT);
  return teamsApi.addPerson(teamId, norm, name)!.person;
}

function inviteMember(teamId: string, email: string, displayName?: string): TeamInviteOutcome {
  const team = teamsApi.get(teamId);
  if (!team) refuse(403, "forbidden");
  const norm = email.trim().toLowerCase();
  if (!team.members.some((m) => m.email === norm) && team.members.length >= 50) refuse(422, LIMIT_TEXT);
  return teamsApi.inviteMember(teamId, norm, displayName)!;
}

function removeMember(teamId: string, email: string): void {
  const team = teamsApi.get(teamId);
  const person = team?.members.find((m) => m.email === email.trim().toLowerCase());
  if (person?.role === "owner" && team!.members.filter((m) => m.role === "owner").length === 1) {
    refuse(422, "the team owner cannot be removed");
  }
  if (!teamsApi.removeMember(teamId, email)) refuse(404, "person not found");
}

/** The demo answer of each teamsApi.remote operation, keyed by its name. */
export const demoTeamsOps = {
  list: () => teamsApi.list(),

  get: (id: string) => teamsApi.get(id),

  createTeam: (name: string) => teamsApi.createTeam(name),

  renameTeam: (id: string, name: string) => teamsApi.renameTeam(id, name),

  deleteTeam: (id: string) => teamsApi.deleteTeam(id),

  addPerson: (teamId: string, email: string, name?: string) => addPerson(teamId, email, name),

  inviteMember: (teamId: string, email: string, displayName?: string) => inviteMember(teamId, email, displayName),

  removeMember: (teamId: string, email: string) => removeMember(teamId, email),

  addZone: (teamId: string, input: Omit<NoMeetingZone, "id" | "created_at">) => teamsApi.addZone(teamId, input),

  updateZone: (teamId: string, zoneId: string, patch: Partial<NoMeetingZone>) => teamsApi.updateZone(teamId, zoneId, patch),

  removeZone: (teamId: string, zoneId: string) => teamsApi.removeZone(teamId, zoneId),

  findSlots: (teamId: string, dateISO: string, durationMin: number) => findSlots(teamId, dateISO, durationMin),

  teamAnalytics: (teamId: string, dateISO?: string) => teamAnalytics(teamId, dateISO),
};
