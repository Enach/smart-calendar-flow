/**
 * PAC-130 (contract clockwise-like contracts/features/PAC-130.md §5, §1, spec
 * AC-14, AC-16, D-4, D-8):
 *
 * - the Manager demo's add never guesses `is_paceday_user` from a domain;
 * - the live add never depends on `member_user_id` (always null and
 *   deprecated): what the web shows after an add is the roster re-read;
 * - the web's strict generated schema still parses a PAC-130 add answer.
 */
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import { ManagerTeamMemberGoStruct } from "./generated/schemas";
import { managerApi } from "./manager";

const fetchMock = vi.fn<typeof fetch>();
const teamID = "11111111-1111-4111-8111-111111111111";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

const ADD_ANSWER = {
  id: "33333333-3333-4333-8333-333333333333",
  manager_user_id: "44444444-4444-4444-8444-444444444444",
  member_email: "hold@ext.example",
  member_user_id: null,
  display_name: "Hold",
  source: "manual",
  cadence: "weekly",
  cadence_custom_days: null,
  last_one_on_one_at: null,
  created_at: "2026-11-19T10:00:00Z",
  updated_at: "2026-11-19T10:00:00Z",
};

const rosterWith = (isPaceday: boolean) => ({
  team_id: teamID,
  members: [
    {
      email: "hold@ext.example",
      display_name: "Hold",
      source: "manual",
      cadence: "weekly",
      cadence_custom_days: null,
      last_one_on_one_at: null,
      is_paceday_user: isPaceday,
      this_week: { focus_minutes: 0, meeting_minutes: 240, free_minutes: 2160, data_available: true },
      last_week: { focus_minutes: 0, meeting_minutes: 300, free_minutes: 2100, data_available: true },
      focus_trend_pct: 0,
    },
  ],
});

beforeEach(() => {
  localStorage.clear();
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});
afterAll(() => vi.unstubAllGlobals());

describe("PAC-130 AC-14: the Manager demo add never guesses the flag", () => {
  it("a paceday.com address is not flagged", () => {
    const { member } = managerApi.addMember({ email: "x@paceday.com", cadence: "weekly" });
    expect(member.is_paceday_user).toBe(false);
  });

  it("nor is any other address", () => {
    for (const email of ["y@PACEDAY.COM", "z@demo.paceday.com", "w@co.example"]) {
      expect(managerApi.addMember({ email, cadence: "weekly" }).member.is_paceday_user).toBe(false);
    }
  });
});

describe("PAC-130 D-4: the live add does not depend on member_user_id", () => {
  it("the flag shown after an add is the roster's, never the add answer's account id", async () => {
    // Even an (old-server) add answer carrying an account id does not make
    // the person "On Paceday": only the re-read roster decides.
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ ...ADD_ANSWER, member_user_id: "55555555-5555-4555-8555-555555555555" }, 201))
      .mockResolvedValueOnce(jsonResponse(rosterWith(false)));
    const { member } = await managerApi.remote.addMember({ email: "hold@ext.example", cadence: "weekly" }, teamID);
    expect(member.is_paceday_user).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[1][0])).toContain("/manager/team");
    expect(fetchMock.mock.calls[1][1]?.method ?? "GET").toBe("GET");
  });

  it("a null account id in the add answer still shows the roster's flag", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(ADD_ANSWER, 201)).mockResolvedValueOnce(jsonResponse(rosterWith(true)));
    const { member } = await managerApi.remote.addMember({ email: "hold@ext.example", cadence: "weekly" }, teamID);
    expect(member.is_paceday_user).toBe(true);
  });
});

describe("PAC-130 AC-16 (web half): the strict generated schema parses the PAC-130 add answer", () => {
  it("member_user_id null is valid, and the key is still required", () => {
    expect(ManagerTeamMemberGoStruct.parse(ADD_ANSWER).member_user_id).toBeNull();
    const withoutKey: Record<string, unknown> = { ...ADD_ANSWER };
    delete withoutKey.member_user_id;
    expect(() => ManagerTeamMemberGoStruct.parse(withoutKey)).toThrow();
  });
});
