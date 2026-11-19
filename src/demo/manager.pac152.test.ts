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
import { beforeEach, describe, expect, it } from "vitest";

import { managerApi, type MemberAnalytics } from "@/api/manager";
import type { ManagerMemberWire } from "@/contracts/managerTeam";
import { teamsApi } from "@/api/teams";
import { demoManagerOps, SEED_MEMBERS } from "./manager";
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
  return Math.round(t * 10) / 10;
}

beforeEach(() => {
  localStorage.clear();
});

describe("PAC-152: unflagged demo rows take the estimate branch", () => {
  it("Miguel and Tom (and every scanned row) show no focus, and free time is 2400 minus meetings", () => {
    seedRoster();
    const rows = demoManagerOps.analytics("", TEAM);
    expect(rows.length).toBe(SEED_MEMBERS.length);
    for (const row of rows) {
      expect(row.is_paceday_user).toBe(false);
      for (const w of row.weeks) {
        expect(w.focus_minutes).toBe(0);
        expect(w.free_minutes).toBe(Math.max(0, 2400 - w.meeting_minutes));
      }
    }
    // The ticket's two names, explicitly.
    for (const email of ["miguel.alvarez@co.com", "tom.becker@co.com"]) {
      const a = analyticsOf(email);
      expect(a.weeks.some((w) => w.meeting_minutes > 0)).toBe(true);
      expect(a.weeks.every((w) => w.focus_minutes === 0)).toBe(true);
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
    managerApi.updateMember("sarah.chen@co.com", { is_paceday_user: true });
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
    for (const m of SEED_MEMBERS) {
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

describe("PAC-152: the Teams demo does not borrow an estimate's zero focus", () => {
  it("a Paceday team member with an unflagged Manager row keeps focus time in team analytics", () => {
    teamsApi.setCurrentUserEmail("you@paceday.com");
    const teamId = teamsApi.createTeam("Demo squad").id;
    managerApi.addMember({ email: "you@paceday.com", cadence: "weekly" });
    const managed = analyticsOf("you@paceday.com");
    expect(managed.is_paceday_user).toBe(false);
    const view = demoTeamsOps.teamAnalytics(teamId);
    const week = managed.weeks.find((w) => w.week_start === view.week_start);
    // The Manager week is found, so the team row reads its meeting time...
    expect(week).toBeDefined();
    const row = view.rows.find((r) => r.email === "you@paceday.com")!;
    expect(row.meeting_minutes).toBe(week!.meeting_minutes);
    // ...but not its estimate's zero focus.
    expect(row.kind).toBe("paceday");
    expect(row.focus_minutes).toBeGreaterThan(0);
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
