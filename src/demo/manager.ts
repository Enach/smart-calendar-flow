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
      data_available: m.data_available,
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
