/**
 * Demo-only (PAC-83): the seeded manager roster ("Sarah Chen", "Miguel
 * Alvarez", "Priya Nair", ...), made-up analytics, and the demo implementation
 * of every managerApi.remote operation, answered from the local manager
 * store. Reached only through src/api/demoGate.ts in a demo session of a
 * non-production build.
 */
import {
  managerApi,
  requireTeamId,
  type Cadence,
  type FocusWeekStat,
  type ManagerProfile,
  type MemberAnalytics,
  type TeamMember,
} from "@/api/manager";
import type { ManagerMemberWire, ScanConfirmation, ScanPreview } from "@/contracts/managerTeam";
import { localISODate } from "@/lib/localDate";

export const SEED_MEMBERS: TeamMember[] = [
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


// ---------- Mock analytics generator ----------

/** The server's working week for the estimate (5 days x 8h). */
const DEMO_WORK_MINUTES_PER_WEEK = 2400;

/**
 * engine.TrendPct (clockwise-like backend/engine/manager.go). Go's math.Round
 * rounds halves away from zero; Math.round rounds them up, so round |x|.
 */
export function trendPct(current: number, prior: number): number {
  if (prior === 0) return current === 0 ? 0 : 200;
  const t = ((current - prior) / prior) * 100;
  if (t > 200) return 200;
  if (t < -200) return -200;
  const x = t * 10;
  return (Math.sign(x) * Math.round(Math.abs(x))) / 10;
}

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
  // An added person (PAC-129) is never measured; a row without data is "no data".
  const known = m.data_available && m.source !== "added";
  // Deterministic-ish hash from email
  const seed = Array.from(m.email).reduce((a, c) => a + c.charCodeAt(0), 0);
  for (let i = 11; i >= 0; i--) {
    const ws = new Date(monday);
    ws.setDate(ws.getDate() - i * 7);
    const r = (n: number) => ((seed * (i + 1) * (n + 3)) % 100) / 100;
    // PAC-152: the made-up figures take the server's branches (PAC-130
    // contract §2.2). No data: all zeroes. Not shown as on Paceday (the
    // estimate branch): meeting time from free/busy, never focus, free time
    // 2400 minus meetings. Shown as on Paceday: Paceday figures.
    const meetings = known ? Math.round(120 + r(1) * 600) : 0;
    const focus = known && m.is_paceday_user ? Math.round(60 + r(2) * 480) : 0;
    const free = known ? Math.max(0, DEMO_WORK_MINUTES_PER_WEEK - meetings - focus) : 0;
    weeks.push({
      // The local Monday (toISOString gave the Sunday east of UTC).
      week_start: localISODate(ws),
      meeting_minutes: meetings,
      focus_minutes: focus,
      free_minutes: free,
      data_available: known,
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
    data_available: known,
  };
}


/** PAC-152: the roster's two weeks are the analytics' last two weeks. */
function mockMemberToWire(member: TeamMember): ManagerMemberWire {
  const weeks = mockAnalyticsFor(member).weeks;
  const toWire = (w: FocusWeekStat) => ({
    focus_minutes: w.focus_minutes, meeting_minutes: w.meeting_minutes,
    free_minutes: w.free_minutes, data_available: w.data_available,
  });
  const thisWeek = toWire(weeks[weeks.length - 1]);
  const lastWeek = toWire(weeks[weeks.length - 2]);
  return {
    email: member.email, display_name: member.display_name, source: member.source, cadence: member.cadence,
    cadence_custom_days: member.custom_cadence_days ?? null,
    last_one_on_one_at: member.last_one_on_one ?? null, is_paceday_user: member.is_paceday_user,
    this_week: thisWeek, last_week: lastWeek,
    focus_trend_pct: trendPct(thisWeek.focus_minutes, lastWeek.focus_minutes),
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
  const present = new Set(managerApi.listTeam().map((m) => m.email));
  for (const member of SEED_MEMBERS) {
    if (!selected.has(member.email)) continue;
    if (present.has(member.email)) {
      managerApi.addMember({ email: member.email, display_name: member.display_name, cadence: member.cadence });
    } else {
      // PAC-152: a detected person is stored as the server's confirm stores
      // it, source "auto", with the seed's own flag and data (not as a manual
      // add, which would erase the "On Paceday" branch from the demo).
      managerApi.addMember({ email: member.email, display_name: member.display_name, cadence: member.cadence });
      managerApi.updateMember(member.email, {
        source: "auto",
        is_paceday_user: member.is_paceday_user,
        data_available: member.data_available,
        last_one_on_one: member.last_one_on_one,
        added_at: member.added_at,
      });
    }
    assigned += 1;
  }
  return { team_id: teamId, assigned, skipped: Math.max(0, selected.size - assigned), total: managerApi.listTeam().length };
}


export function demoMemberAnalytics(email: string): MemberAnalytics | null {
    const m = managerApi.listTeam().find((x) => x.email === email);
    if (!m) return null;
    return mockAnalyticsFor(m);
}



/** The demo answer of each managerApi.remote operation, keyed by its name. */
export const demoManagerOps = {
  detect: (teamId: string) => mockScanPreview(teamId),
  getProfile: () => managerApi.getProfile(),

  setProfile: (patch: Partial<ManagerProfile>) => managerApi.setProfile(patch),

  listTeam: (teamId: string) => ({ team_id: requireTeamId(teamId), members: managerApi.listTeam().map(mockMemberToWire) }),

  addMember: (input: {
    email: string;
    display_name?: string;
    cadence: Cadence;
    custom_cadence_days?: number;
  }, teamId: string) => managerApi.addMember(input),

  updateMember: (email: string, patch: Partial<TeamMember>, teamId: string) => managerApi.updateMember(email, patch),

  removeMember: (email: string, teamId: string) => managerApi.removeMember(email),

  confirmDetect: (teamId: string, emails: string[]) => mockConfirmScan(requireTeamId(teamId), emails),

  gaps: (teamId: string) => managerApi.gaps(),

  analytics: (week: string, teamId: string) => managerApi
          .listTeam()
          .map((m) => demoMemberAnalytics(m.email))
          .filter((a): a is MemberAnalytics => a !== null),

  schedulePrefillUrl: (email: string, suggestedDate: string | undefined, teamId: string) => managerApi.schedulePrefillUrl(email),
};
