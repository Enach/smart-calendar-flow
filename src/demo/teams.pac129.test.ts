/**
 * PAC-129 AC-35 (spec §3.12, contract §9.9): the demo adds, lists, invites,
 * removes and runs Find a time over added people with no request to the
 * backend; an invited person is an added person with a pending invitation;
 * no account is guessed from a domain.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const fb = vi.hoisted(() => ({ emails: [] as string[] }));
vi.mock("@/api/coverageCache", () => ({
  getFreebusy: async (req: { emails: string[] }) => {
    fb.emails = req.emails;
    return {
      start_time: "",
      end_time: "",
      participants: req.emails.map((email) => ({ email, status: email.endsWith("@gmail.com") ? "unknown" : "known", busy: [] })),
      busy: {},
    };
  },
}));

import { ApiHttpError } from "@/api/client";
import { teamsApi } from "@/api/teams";
import { demoTeamsOps } from "./teams";

const fetchMock = vi.fn<typeof fetch>();

describe("AC-35: demo parity for added people", () => {
  let teamId: string;
  beforeEach(() => {
    localStorage.clear();
    vi.stubGlobal("fetch", fetchMock);
    teamsApi.setCurrentUserEmail("you@paceday.com");
    teamId = teamsApi.createTeam("Demo squad").id;
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    fetchMock.mockReset();
  });

  it("add, invite, Find a time and remove work with no request, and nothing is guessed from a domain", async () => {
    const pat = demoTeamsOps.addPerson(teamId, " Pat@Paceday.com ", "Pat");
    expect(pat).toEqual({ email: "pat@paceday.com", display_name: "Pat", kind: "added", role: null, invitation: null });
    // A repeat changes nothing.
    demoTeamsOps.addPerson(teamId, "pat@paceday.com");
    expect(teamsApi.get(teamId)!.members.filter((m) => m.email === "pat@paceday.com")).toHaveLength(1);

    const invited = demoTeamsOps.inviteMember(teamId, "sam@gmail.com", "Sam");
    expect(invited.outcome).toBe("added_and_invited");
    expect(invited.person).toMatchObject({ kind: "added", role: null });
    expect(invited.person.invitation).not.toBeNull();
    expect(demoTeamsOps.inviteMember(teamId, "sam@gmail.com").outcome).toBe("already_pending");
    expect(demoTeamsOps.inviteMember(teamId, "pat@paceday.com").outcome).toBe("invited");
    expect(demoTeamsOps.inviteMember(teamId, "you@paceday.com").outcome).toBe("already_member");

    // The invited person counts in Find a time; unknown is never free.
    const slots = await demoTeamsOps.findSlots(teamId, "2030-03-04", 30);
    expect(fb.emails).toEqual(["you@paceday.com", "pat@paceday.com", "sam@gmail.com"]);
    expect(slots.length).toBeGreaterThan(0);
    for (const s of slots) expect(s).toMatchObject({ total_count: 3, free_count: 2, unknown_count: 1 });

    demoTeamsOps.removeMember(teamId, "sam@gmail.com");
    expect(teamsApi.get(teamId)!.members.map((m) => m.email)).toEqual(["you@paceday.com", "pat@paceday.com"]);
    expect(() => demoTeamsOps.removeMember(teamId, "sam@gmail.com")).toThrow(ApiHttpError);

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("refuses like the server: own address, the cap, the last owner", () => {
    expect(() => demoTeamsOps.addPerson(teamId, "you@paceday.com")).toThrow("you cannot add your own address");
    for (let i = 1; i < 50; i += 1) demoTeamsOps.addPerson(teamId, `p${i}@x.example`);
    expect(() => demoTeamsOps.addPerson(teamId, "late@x.example")).toThrow(/limit of 50 members/);
    expect(() => demoTeamsOps.inviteMember(teamId, "late@x.example")).toThrow(/limit of 50 members/);
    expect(() => demoTeamsOps.removeMember(teamId, "you@paceday.com")).toThrow("the team owner cannot be removed");
  });

  it("analytics: every member's row, the requested week, availability only for added, no free time", () => {
    demoTeamsOps.addPerson(teamId, "pat@x.example", "Pat");
    const view = demoTeamsOps.teamAnalytics(teamId, "2030-03-06");
    expect(view.week_start).toBe("2030-03-04");
    const pat = view.rows.find((r) => r.email === "pat@x.example")!;
    expect(pat).toMatchObject({ kind: "added", figures: "measured", focus_minutes: null, focus_score: null });
    for (const r of view.rows) expect(r).not.toHaveProperty("free_minutes");
  });
});
