/**
 * Demo-only (PAC-83): the demo's team slot finder and team analytics (made-up
 * numbers) and the demo implementation of every teamsApi.remote operation,
 * answered from the local team store. Reached only through
 * src/api/demoGate.ts in a demo session of a non-production build.
 */
import { teamsApi, type AvailabilitySlot, type NoMeetingZone } from "@/api/teams";
import { managerApi, type TeamMember as ManagerTeamMember } from "@/api/manager";
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
}

  // ---------- Aggregated team analytics ----------

  /**
   * Pull per-member analytics from the manager API where possible.
   * Members not in the manager team get a synthetic estimate.
   */
function teamAnalytics(teamId: string): Array<{
    email: string;
    display_name: string;
    is_paceday_user: boolean;
    weeks: { week_start: string; meeting_minutes: number; focus_minutes: number; free_minutes: number }[];
  }> {
    const team = teamsApi.get(teamId);
    if (!team) return [];
    const mgrMap = new Map<string, ManagerTeamMember>();
    for (const m of managerApi.listTeam()) mgrMap.set(m.email, m);

    return team.members
      .filter((m) => m.status === "active" && m.email !== teamsApi.currentUserEmail())
      .map((m) => {
        const mgr = mgrMap.get(m.email);
        if (mgr) {
          const a = demoMemberAnalytics(m.email);
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
}


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


/** The demo answer of each teamsApi.remote operation, keyed by its name. */
export const demoTeamsOps = {
  list: () => teamsApi.list(),

  get: (id: string) => teamsApi.get(id),

  createTeam: (name: string) => teamsApi.createTeam(name),

  renameTeam: (id: string, name: string) => teamsApi.renameTeam(id, name),

  deleteTeam: (id: string) => teamsApi.deleteTeam(id),

  inviteMember: (teamId: string, email: string, displayName?: string) => teamsApi.inviteMember(teamId, email, displayName),

  removeMember: (teamId: string, email: string) => teamsApi.removeMember(teamId, email),

  addZone: (teamId: string, input: Omit<NoMeetingZone, "id" | "created_at">) => teamsApi.addZone(teamId, input),

  updateZone: (teamId: string, zoneId: string, patch: Partial<NoMeetingZone>) => teamsApi.updateZone(teamId, zoneId, patch),

  removeZone: (teamId: string, zoneId: string) => teamsApi.removeZone(teamId, zoneId),

  findSlots: (teamId: string, dateISO: string, durationMin: number) => findSlots(teamId, dateISO, durationMin),

  teamAnalytics: (teamId: string, dateISO?: string) => teamAnalytics(teamId),
};
