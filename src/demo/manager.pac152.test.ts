/**
 * PAC-152: the Manager demo's made-up figures follow PAC-130's branches
 * (clockwise-like contracts/features/PAC-130.md §2.2):
 *
 * - a row not shown as on Paceday (`is_paceday_user` false) is the estimate
 *   branch: focus 0, free = 2400 - meeting time (floored at 0);
 * - a week whose data is not available is all zeroes ("no data");
 * - a row shown as on Paceday keeps its made-up Paceday figures;
 * - the roster's this_week / last_week are the same figures as the analytics,
 *   and focus_trend_pct is the server's TrendPct of the two focus figures.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { managerApi, type MemberAnalytics } from "@/api/manager";
import type { ManagerMemberWire } from "@/contracts/managerTeam";
import { teamsApi } from "@/api/teams";
import { demoManagerOps, SEED_MEMBERS, trendPct } from "./manager";
import { demoTeamsOps } from "./teams";

const TEAM = "t1";

function seedRoster() {
  demoManagerOps.confirmDetect(TEAM, SEED_MEMBERS.map((m) => m.email));
}

function analyticsOf(email: string): MemberAnalytics {
  const found = demoManagerOps.analytics("", TEAM).find((a) => a.email === email);
  if (!found) throw new Error(`no analytics for ${email}`);
  return found;
}

function wireOf(email: string): ManagerMemberWire {
  const found = demoManagerOps.listTeam(TEAM).members.find((m) => m.email === email);
  if (!found) throw new Error(`no roster entry for ${email}`);
  return found;
}

/** engine.TrendPct (clockwise-like backend/engine/manager.go), transcribed. */
function serverTrendPct(current: number, prior: number): number {
  if (prior === 0) return current === 0 ? 0 : 200;
  const t = ((current - prior) / prior) * 100;
  if (t > 200) return 200;
  if (t < -200) return -200;
  const x = t * 10; // Go's math.Round: halves away from zero.
  return (x < 0 ? -Math.floor(-x + 0.5) : Math.floor(x + 0.5)) / 10;
}

// CI runs in UTC, where a UTC-derived week start is still a Monday; pin a
// timezone east of UTC so the week-start test can fail.
let savedTZ: string | undefined;
beforeAll(() => {
  savedTZ = process.env.TZ;
  process.env.TZ = "Asia/Tokyo";
});
afterAll(() => {
  if (savedTZ === undefined) delete process.env.TZ;
  else process.env.TZ = savedTZ;
});

beforeEach(() => {
  localStorage.clear();
});

describe("PAC-152: unflagged demo rows take the estimate branch", () => {
  it("Miguel and Tom show no focus, and free time is 2400 minus meetings", () => {
    seedRoster();
    for (const email of ["miguel.alvarez@co.com", "tom.becker@co.com"]) {
      const a = analyticsOf(email);
      expect(a.is_paceday_user).toBe(false);
      expect(a.weeks.some((w) => w.meeting_minutes > 0)).toBe(true);
      for (const w of a.weeks) {
        expect(w.focus_minutes).toBe(0);
        expect(w.free_minutes).toBe(Math.max(0, 2400 - w.meeting_minutes));
      }
    }
  });

  it("every unflagged row has no focus", () => {
    seedRoster();
    for (const row of demoManagerOps.analytics("", TEAM).filter((r) => !r.is_paceday_user)) {
      expect(row.weeks.every((w) => w.focus_minutes === 0)).toBe(true);
    }
  });

  it("an address added by hand is unflagged and shows no focus either", () => {
    managerApi.addMember({ email: "new.person@co.example", cadence: "weekly" });
    const a = analyticsOf("new.person@co.example");
    expect(a.is_paceday_user).toBe(false);
    expect(a.weeks.every((w) => w.focus_minutes === 0 && w.free_minutes === Math.max(0, 2400 - w.meeting_minutes))).toBe(true);
  });

  it("a week without data is all zeroes, whatever the flag", () => {
    managerApi.addMember({ email: "someone@gmail.com", cadence: "weekly" });
    const a = analyticsOf("someone@gmail.com");
    expect(a.data_available).toBe(false);
    for (const w of a.weeks) {
      expect(w).toMatchObject({ focus_minutes: 0, meeting_minutes: 0, free_minutes: 0, data_available: false });
    }
  });
});

describe("PAC-152: a flagged demo row keeps its Paceday figures", () => {
  it("focus is shown and free time is what is left after meetings and focus", () => {
    seedRoster();
    const a = analyticsOf("sarah.chen@co.com");
    expect(a.is_paceday_user).toBe(true);
    for (const w of a.weeks) {
      expect(w.focus_minutes).toBeGreaterThan(0);
      expect(w.free_minutes).toBe(Math.max(0, 2400 - w.meeting_minutes - w.focus_minutes));
    }
  });
});

describe("PAC-152: the roster's week figures are the analytics' figures", () => {
  it("this_week and last_week of an unflagged row are its estimate weeks, with no focus trend", () => {
    seedRoster();
    const a = analyticsOf("miguel.alvarez@co.com");
    const wire = wireOf("miguel.alvarez@co.com");
    const [last, current] = a.weeks.slice(-2);
    expect(wire.this_week).toEqual({
      focus_minutes: 0, meeting_minutes: current.meeting_minutes, free_minutes: current.free_minutes, data_available: true,
    });
    expect(wire.last_week).toEqual({
      focus_minutes: 0, meeting_minutes: last.meeting_minutes, free_minutes: last.free_minutes, data_available: true,
    });
    expect(wire.this_week.free_minutes).toBe(Math.max(0, 2400 - wire.this_week.meeting_minutes));
    expect(wire.focus_trend_pct).toBe(0);
  });

  it("a flagged row's trend is the server's TrendPct of its two focus figures", () => {
    seedRoster();
    const trends: number[] = [];
    for (const m of SEED_MEMBERS.filter((x) => x.data_available)) {
      managerApi.updateMember(m.email, { is_paceday_user: true });
      const wire = wireOf(m.email);
      expect(wire.this_week.focus_minutes).toBeGreaterThan(0);
      expect(wire.focus_trend_pct).toBe(serverTrendPct(wire.this_week.focus_minutes, wire.last_week.focus_minutes));
      trends.push(wire.focus_trend_pct);
    }
    // The seeds do move week to week, so the trend is not trivially 0.
    expect(trends.some((t) => t !== 0)).toBe(true);
  });

  it("a row without data has zero weeks marked unavailable", () => {
    managerApi.addMember({ email: "someone@gmail.com", cadence: "weekly" });
    const wire = wireOf("someone@gmail.com");
    const zero = { focus_minutes: 0, meeting_minutes: 0, free_minutes: 0, data_available: false };
    expect(wire.this_week).toEqual(zero);
    expect(wire.last_week).toEqual(zero);
    expect(wire.focus_trend_pct).toBe(0);
  });
});

describe("PAC-152: Teams rows take the Manager week only from a flagged row", () => {
  function setup() {
    teamsApi.setCurrentUserEmail("you@paceday.com");
    const teamId = teamsApi.createTeam("Demo squad").id;
    const rowOf = () => demoTeamsOps.teamAnalytics(teamId).rows.find((r) => r.email === "you@paceday.com")!;
    return { teamId, rowOf };
  }

  it("an unflagged Manager row lends nothing: meetings and focus are the team's own", () => {
    const { rowOf } = setup();
    const own = rowOf();
    managerApi.addMember({ email: "you@paceday.com", cadence: "weekly" });
    expect(analyticsOf("you@paceday.com").is_paceday_user).toBe(false);
    const row = rowOf();
    expect(row.kind).toBe("paceday");
    expect(row.meeting_minutes).toBe(own.meeting_minutes);
    expect(row.focus_minutes).toBe(own.focus_minutes);
    expect(row.focus_minutes).toBeGreaterThan(0);
  });

  it("a flagged Manager row lends both its meetings and its focus", () => {
    const { teamId, rowOf } = setup();
    managerApi.addMember({ email: "you@paceday.com", cadence: "weekly" });
    managerApi.updateMember("you@paceday.com", { is_paceday_user: true });
    const view = demoTeamsOps.teamAnalytics(teamId);
    const week = analyticsOf("you@paceday.com").weeks.find((w) => w.week_start === view.week_start);
    expect(week).toBeDefined();
    const row = rowOf();
    expect(row.meeting_minutes).toBe(week!.meeting_minutes);
    expect(row.focus_minutes).toBe(week!.focus_minutes);
  });
});

describe("PAC-152: demo Manager weeks start on a Monday, like the server's", () => {
  it("every week_start is a Monday", () => {
    managerApi.addMember({ email: "a@co.example", cadence: "weekly" });
    for (const w of analyticsOf("a@co.example").weeks) {
      expect(new Date(`${w.week_start}T12:00:00Z`).getUTCDay()).toBe(1);
    }
  });
});

describe("PAC-152: an added (PAC-129) row is never measured", () => {
  it("all zeroes and data_available false, on the analytics and the roster", () => {
    seedRoster();
    managerApi.updateMember("sarah.chen@co.com", { source: "added" });
    const a = analyticsOf("sarah.chen@co.com");
    expect(a.data_available).toBe(false);
    for (const w of a.weeks) {
      expect(w).toMatchObject({ focus_minutes: 0, meeting_minutes: 0, free_minutes: 0, data_available: false });
    }
    const zero = { focus_minutes: 0, meeting_minutes: 0, free_minutes: 0, data_available: false };
    expect(wireOf("sarah.chen@co.com").this_week).toEqual(zero);
    expect(wireOf("sarah.chen@co.com").last_week).toEqual(zero);
  });
});

describe("PAC-152: trendPct is engine.TrendPct", () => {
  it("0 when both are 0, 200 when only the prior is 0", () => {
    expect(trendPct(0, 0)).toBe(0);
    expect(trendPct(5, 0)).toBe(200);
  });

  it("caps at +200 and -200", () => {
    expect(trendPct(1000, 100)).toBe(200);
    expect(trendPct(300, 100)).toBe(200);
    expect(trendPct(-500, 100)).toBe(-200);
  });

  it("rounds halves away from zero, like Go's math.Round", () => {
    // (60 - 64) / 64 * 100 = -6.25 -> -6.3 (Math.round would give -6.2).
    expect(trendPct(60, 64)).toBe(-6.3);
    // (68 - 64) / 64 * 100 = 6.25 -> 6.3.
    expect(trendPct(68, 64)).toBe(6.3);
  });
});

describe("PAC-152: scan-confirm stores the seeds as detected", () => {
  it("each selected seed is source auto with its own flag and data", () => {
    seedRoster();
    const team = managerApi.listTeam();
    for (const seed of SEED_MEMBERS) {
      const m = team.find((x) => x.email === seed.email)!;
      expect(m).toMatchObject({
        source: "auto",
        is_paceday_user: seed.is_paceday_user,
        data_available: seed.data_available,
      });
    }
    // So the "On Paceday" branch does appear in the demo.
    expect(demoManagerOps.analytics("", TEAM).some((a) => a.is_paceday_user && a.weeks.some((w) => w.focus_minutes > 0))).toBe(true);
  });

  it("an address already on the roster is not overwritten", () => {
    managerApi.addMember({ email: "miguel.alvarez@co.com", cadence: "monthly" });
    seedRoster();
    const m = managerApi.listTeam().find((x) => x.email === "miguel.alvarez@co.com")!;
    expect(m.source).toBe("manual");
  });
});
