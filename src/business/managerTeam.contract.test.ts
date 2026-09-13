import { describe, expect, it } from "vitest";

import { normalizeRemoteMember } from "@/api/manager";
import type { ManagerRosterWire } from "@/contracts/managerTeam";
import { applyManagerTeamResult, loadingManagerTeam, managerTeamFromRoster } from "./managerTeam";

function roster(teamId: string, count: number, dataAvailable: boolean): ManagerRosterWire {
  const week = { focus_minutes: 0, meeting_minutes: 0, free_minutes: 0, data_available: dataAvailable };
  return {
    team_id: teamId,
    members: Array.from({ length: count }, (_, index) => ({
      email: `person${index}@example.com`, display_name: `Person ${index}`, source: "auto",
      cadence: "weekly", last_one_on_one_at: null, is_paceday_user: false,
      cadence_custom_days: null,
      this_week: week, last_week: week, focus_trend_pct: 0,
    })),
  };
}

describe("manager-team business contract", () => {
  it("shows ten external members as degraded, never empty", () => {
    const state = managerTeamFromRoster("team-a", roster("team-a", 10, false), normalizeRemoteMember);
    expect(state.status).toBe("degraded");
    expect(state.members).toHaveLength(10);
  });

  it("distinguishes empty, ready, inconsistent, loading, and error", () => {
    expect(managerTeamFromRoster("team-a", roster("team-a", 0, true), normalizeRemoteMember).status).toBe("empty");
    expect(managerTeamFromRoster("team-a", roster("team-a", 1, true), normalizeRemoteMember).status).toBe("ready");
    expect(managerTeamFromRoster("team-a", roster("team-b", 1, true), normalizeRemoteMember).status).toBe("inconsistent");
    expect(loadingManagerTeam("team-a").status).toBe("loading");
  });

  it("does not let a late team-A result replace active team B", () => {
    const current = loadingManagerTeam("team-b");
    const lateA = managerTeamFromRoster("team-a", roster("team-a", 10, false), normalizeRemoteMember);
    expect(applyManagerTeamResult(current, "team-b", lateA)).toBe(current);
  });
});
