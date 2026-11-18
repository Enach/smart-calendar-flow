/**
 * PAC-129 wire tests: teams.ts against the contract (rev 1.2), parsed strictly
 * with the generated zod schemas. Each test names the AC or SF it pins.
 */
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import { ApiHttpError } from "./client";
import { managerApi } from "./manager";
import { managerRosterSchema } from "@/contracts/managerTeam";
import { analyticsRowsWithoutOwner, teamsApi } from "./teams";

const fetchMock = vi.fn<typeof fetch>();
const TEAM_ID = "11111111-1111-4111-8111-111111111111";
const OWNER_ID = "22222222-2222-4222-8222-222222222222";
const M_ID = "33333333-3333-4333-8333-333333333333";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(status === 204 ? null : JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}
const urlOf = (call: number) => new URL(String(fetchMock.mock.calls[call][0]));
const methodOf = (call: number) => fetchMock.mock.calls[call][1]?.method;
const bodyOf = (call: number) => {
  const raw = fetchMock.mock.calls[call][1]?.body;
  return raw ? JSON.parse(String(raw)) : undefined;
};

const TEAM = { id: TEAM_ID, name: "Platform", createdBy: OWNER_ID, createdAt: "2026-01-01T00:00:00Z" };
const OWNER_PERSON = { email: "owner@co.example", name: "Olive", kind: "paceday", userId: OWNER_ID, role: "owner", invitation: null };
const M_PERSON = { email: "m@co.example", name: "Max", kind: "paceday", userId: M_ID, role: "member", invitation: null };
const PAT = { email: "pat@ext.example", name: "Pat", kind: "added", userId: null, role: null, invitation: null };
const SAM = { email: "sam@acme.example", name: "Sam", kind: "added", userId: null, role: null, invitation: { expiresAt: "2026-12-01T00:00:00Z" } };

function detail(people: unknown[]) {
  return {
    team: TEAM,
    members: [
      { teamId: TEAM_ID, userId: OWNER_ID, role: "owner", joinedAt: "2026-01-01T00:00:00Z", name: "Olive", email: "owner@co.example" },
      { teamId: TEAM_ID, userId: M_ID, role: "member", joinedAt: "2026-01-02T00:00:00Z", name: "Max", email: "m@co.example" },
    ],
    people,
  };
}

function serveTeam(people: unknown[]) {
  fetchMock.mockImplementation(async (input) => {
    const path = new URL(String(input)).pathname;
    if (path.endsWith("/no-meeting-zones")) return jsonResponse([]);
    return jsonResponse(detail(people));
  });
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  localStorage.clear();
});

afterAll(() => {
  vi.unstubAllGlobals();
});

describe("getTeam: the member list is `people`, both kinds (contract §3.7, §9.1)", () => {
  it("AC-1/AC-2: lists an added person by kind, never derived from userId or a domain guess", async () => {
    serveTeam([OWNER_PERSON, M_PERSON, PAT, { ...PAT, email: "pat@paceday.com", name: "" }]);
    const team = await teamsApi.remote.get(TEAM_ID);
    expect(team!.members.map((m) => [m.email, m.kind])).toEqual([
      ["owner@co.example", "paceday"],
      ["m@co.example", "paceday"],
      ["pat@ext.example", "added"],
      // A paceday.com address is still an added person: no account is guessed.
      ["pat@paceday.com", "added"],
    ]);
    expect(team!.members[2]).toEqual({ email: "pat@ext.example", display_name: "Pat", kind: "added", role: null, invitation: null });
    // No name: the address is shown, nothing is derived from it.
    expect(team!.members[3].display_name).toBe("pat@paceday.com");
    expect(team!.owner_email).toBe("owner@co.example");
  });

  it("shows the invitation only when the server sends it (owners only, m-6)", async () => {
    serveTeam([OWNER_PERSON, SAM, PAT]);
    const team = await teamsApi.remote.get(TEAM_ID);
    expect(team!.members[1].invitation).toEqual({ expires_at: "2026-12-01T00:00:00Z" });
    expect(team!.members[2].invitation).toBeNull();
  });

  it("is strict: an unknown key or a missing `people` throws instead of showing a partial list", async () => {
    serveTeam([{ ...PAT, extra: 1 }]);
    await expect(teamsApi.remote.get(TEAM_ID)).rejects.toThrow();
    fetchMock.mockImplementation(async (input) =>
      new URL(String(input)).pathname.endsWith("/no-meeting-zones") ? jsonResponse([]) : jsonResponse({ team: TEAM, members: [] }),
    );
    await expect(teamsApi.remote.get(TEAM_ID)).rejects.toThrow();
  });

  it("AC-6 (SF-039): a failed member read is an error, never an empty team", async () => {
    fetchMock.mockImplementation(async () => jsonResponse({ error: "internal" }, 500));
    await expect(teamsApi.remote.get(TEAM_ID)).rejects.toBeInstanceOf(ApiHttpError);
  });
});

describe("addTeamPerson (contract §3.1)", () => {
  it("POSTs email (lowercased) and the trimmed name, and answers the entry", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(PAT, 201));
    const person = await teamsApi.remote.addPerson(TEAM_ID, "  Pat@Ext.Example ", "  Pat ");
    expect(methodOf(0)).toBe("POST");
    expect(urlOf(0).pathname).toBe(`/api/teams/${TEAM_ID}/people`);
    expect(bodyOf(0)).toEqual({ email: "pat@ext.example", name: "Pat" });
    expect(person).toEqual({ email: "pat@ext.example", display_name: "Pat", kind: "added", role: null, invitation: null });
  });

  it("AC-4: a repeat (200) answers the existing entry the same way", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(PAT, 200));
    expect((await teamsApi.remote.addPerson(TEAM_ID, "pat@ext.example")).email).toBe("pat@ext.example");
    expect(bodyOf(0)).toEqual({ email: "pat@ext.example" });
  });

  it("AC-5/AC-23: a 422 is the caller's error, carrying the server's exact text", async () => {
    const text = "this team has reached its limit of 50 members; remove someone before adding another";
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: text }, 422));
    const err = await teamsApi.remote.addPerson(TEAM_ID, "x@ext.example").catch((e) => e);
    expect(err).toBeInstanceOf(ApiHttpError);
    expect((err as ApiHttpError).data).toEqual({ error: text });
  });

  it("refuses an invalid address before any request", async () => {
    await expect(teamsApi.remote.addPerson(TEAM_ID, "nope")).rejects.toThrow(/valid email/);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("inviteTeamMember (contract §3.3, AC-18, AC-21)", () => {
  const invitation = {
    id: "44444444-4444-4444-8444-444444444444",
    teamId: TEAM_ID,
    inviteeEmail: "sam@acme.example",
    invitedBy: OWNER_ID,
    token: "tok",
    status: "pending",
    createdAt: "2026-11-24T00:00:00Z",
    expiresAt: "2026-12-01T00:00:00Z",
  };

  it("AC-21 (SF-051): the typed name reaches the server", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ outcome: "added_and_invited", invitation, person: SAM }, 201));
    const out = await teamsApi.remote.inviteMember(TEAM_ID, "Sam@Acme.example", " Sam ");
    expect(bodyOf(0)).toEqual({ email: "sam@acme.example", name: "Sam" });
    expect(out).toEqual({
      outcome: "added_and_invited",
      person: { email: "sam@acme.example", display_name: "Sam", kind: "added", role: null, invitation: { expires_at: "2026-12-01T00:00:00Z" } },
    });
  });

  it.each(["invited", "already_pending"] as const)("reads outcome %s", async (outcome) => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ outcome, invitation, person: SAM }, outcome === "invited" ? 201 : 200));
    expect((await teamsApi.remote.inviteMember(TEAM_ID, "sam@acme.example")).outcome).toBe(outcome);
  });

  it("reads already_member with a null invitation", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ outcome: "already_member", invitation: null, person: M_PERSON }, 200));
    const out = await teamsApi.remote.inviteMember(TEAM_ID, "m@co.example");
    expect(out.outcome).toBe("already_member");
    expect(out.person.kind).toBe("paceday");
  });
});

describe("removeTeamPerson (contract §3.2, AC-15, SF-089)", () => {
  it("DELETEs by address, percent-encoded, for either kind", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(null, 204));
    await teamsApi.remote.removeMember(TEAM_ID, "Pat+x@Ext.Example");
    expect(methodOf(0)).toBe("DELETE");
    expect(String(fetchMock.mock.calls[0][0])).toContain(`/api/teams/${TEAM_ID}/people/pat%2Bx%40ext.example`);
  });

  it("a 404 'person not found' is an error, never a silent success", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: "person not found" }, 404));
    const err = await teamsApi.remote.removeMember(TEAM_ID, "ghost@ext.example").catch((e) => e);
    expect(err).toBeInstanceOf(ApiHttpError);
    expect((err as ApiHttpError).status).toBe(404);
  });
});

describe("getTeamAvailability counts (AC-10, SF-054)", () => {
  it("uses the server's free/unknown/total per slot; unknown is never free", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        slots: [{ start: "2026-11-23T14:00:00Z", end: "2026-11-23T15:00:00Z", quality_score: 100, free_count: 3, unknown_count: 3, total_count: 6 }],
      }),
    );
    const [slot] = await teamsApi.remote.findSlots(TEAM_ID, "2026-11-23", 60);
    expect(slot).toMatchObject({ free_count: 3, unknown_count: 3, total_count: 6 });
  });

  it("rejects a slot without counts (strict)", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ slots: [{ start: "2026-11-23T14:00:00Z", end: "2026-11-23T15:00:00Z", quality_score: 100 }] }));
    await expect(teamsApi.remote.findSlots(TEAM_ID, "2026-11-23", 60)).rejects.toThrow();
  });
});

describe("getFormalTeamAnalytics (AC-16, AC-17, SF-053, SF-041)", () => {
  const raw = {
    week_start: "2026-10-05",
    avg_meeting_minutes: 600,
    avg_focus_minutes: 300,
    member_breakdown: [],
    people: [
      { email: "owner@co.example", name: "Olive", kind: "paceday", userId: OWNER_ID, figures: "measured", meeting_minutes: 600, focus_minutes: 300, focus_score: 33 },
      { email: "alex@co.example", name: "Alex", kind: "paceday", userId: M_ID, figures: "measured", meeting_minutes: 120, focus_minutes: 480, focus_score: 80 },
      { email: "alex@ext.example", name: "Alex", kind: "added", userId: null, figures: "measured", meeting_minutes: 300, focus_minutes: null, focus_score: null },
      { email: "p2@co.example", name: "P2", kind: "paceday", userId: "55555555-5555-4555-8555-555555555555", figures: "no_data", meeting_minutes: null, focus_minutes: null, focus_score: null },
      { email: "x@ext.example", name: "X", kind: "added", userId: null, figures: "withheld", meeting_minutes: null, focus_minutes: null, focus_score: null },
    ],
  };

  it("attributes each row by its own email, even with two members named Alex; invents no free time", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(raw));
    const view = await teamsApi.remote.teamAnalytics(TEAM_ID, "2026-10-07");
    expect(urlOf(0).searchParams.get("date")).toBe("2026-10-07");
    // The week label is the server's week_start: the week asked for, not the current one.
    expect(view.week_start).toBe("2026-10-05");
    expect(view.avg_meeting_minutes).toBe(600);
    const byEmail = Object.fromEntries(view.rows.map((r) => [r.email, r]));
    expect(byEmail["alex@co.example"]).toMatchObject({ kind: "paceday", meeting_minutes: 120, focus_minutes: 480, focus_score: 80 });
    expect(byEmail["alex@ext.example"]).toMatchObject({ kind: "added", meeting_minutes: 300, focus_minutes: null, focus_score: null });
    expect(byEmail["p2@co.example"]).toMatchObject({ figures: "no_data", meeting_minutes: null });
    expect(byEmail["x@ext.example"]).toMatchObject({ figures: "withheld", meeting_minutes: null });
    for (const row of view.rows) expect(row).not.toHaveProperty("free_minutes");
    expect(view).not.toHaveProperty("weeks");
  });

  it("the owner-excluding filter drops only the owner's row", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(raw));
    const view = await teamsApi.remote.teamAnalytics(TEAM_ID, "2026-10-07");
    const rows = analyticsRowsWithoutOwner(view.rows, ["Owner@Co.Example"]);
    expect(rows.map((r) => r.email)).toEqual(["alex@co.example", "alex@ext.example", "p2@co.example", "x@ext.example"]);
  });
});

describe("Manager roster with added people (contract §5.1, §9.8)", () => {
  it("asks include_added=true and accepts source 'added'", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        team_id: TEAM_ID,
        members: [
          {
            email: "pat@ext.example",
            display_name: "Pat",
            source: "added",
            cadence: "none",
            cadence_custom_days: null,
            last_one_on_one_at: null,
            is_paceday_user: false,
            this_week: { focus_minutes: 0, meeting_minutes: 0, free_minutes: 0, data_available: false },
            last_week: { focus_minutes: 0, meeting_minutes: 0, free_minutes: 0, data_available: false },
            focus_trend_pct: 0,
          },
        ],
      }),
    );
    const roster = await managerApi.remote.listTeam(TEAM_ID);
    expect(urlOf(0).searchParams.get("include_added")).toBe("true");
    expect(urlOf(0).searchParams.get("team_id")).toBe(TEAM_ID);
    expect(roster.members[0].source).toBe("added");
  });

  it("still refuses an unknown source value", () => {
    expect(managerRosterSchema.safeParse({ team_id: TEAM_ID, members: [{ source: "other" }] }).success).toBe(false);
  });

  it("AC-31 (web): a 422 on patch for an added person surfaces the server's exact text", async () => {
    const text = "this person was added to the team without Paceday access; add them with Add person to track 1:1s";
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: text }, 422));
    const err = await managerApi.remote.updateMember("pat@ext.example", { cadence: "weekly" }, TEAM_ID).catch((e) => e);
    expect((err as ApiHttpError).data).toEqual({ error: text });
  });
});

describe("review minor 2: response parsing accepts every address the server accepted", () => {
  // Valid for the server's normaliser (net/mail), refused by zod's email check.
  const ODD = "a&b@x.example";
  const SHORT_TLD = "pat@x.y";

  it("the invite result with such an invitee is read, not thrown", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(
        {
          outcome: "added_and_invited",
          invitation: {
            id: "44444444-4444-4444-8444-444444444444",
            teamId: TEAM_ID,
            inviteeEmail: ODD,
            invitedBy: OWNER_ID,
            token: "tok",
            status: "pending",
            createdAt: "2026-11-24T00:00:00Z",
            expiresAt: "2026-12-01T00:00:00Z",
          },
          person: { email: ODD, name: "", kind: "added", userId: null, role: null, invitation: { expiresAt: "2026-12-01T00:00:00Z" } },
        },
        201,
      ),
    );
    const out = await teamsApi.remote.inviteMember(TEAM_ID, ODD);
    expect(out.person.email).toBe(ODD);
  });

  it("a team whose Paceday member has such an address is read", async () => {
    fetchMock.mockImplementation(async (input) => {
      if (new URL(String(input)).pathname.endsWith("/no-meeting-zones")) return jsonResponse([]);
      return jsonResponse({
        team: TEAM,
        members: [{ teamId: TEAM_ID, userId: OWNER_ID, role: "owner", joinedAt: "2026-01-01T00:00:00Z", name: "Olive", email: SHORT_TLD }],
        people: [{ ...OWNER_PERSON, email: SHORT_TLD }],
      });
    });
    expect((await teamsApi.remote.get(TEAM_ID))!.members[0].email).toBe(SHORT_TLD);
  });

  it("the Manager roster with such an entry is read for the whole team", async () => {
    const entry = (email: string) => ({
      email,
      display_name: email,
      source: "added",
      cadence: "none",
      cadence_custom_days: null,
      last_one_on_one_at: null,
      is_paceday_user: false,
      this_week: { focus_minutes: 0, meeting_minutes: 0, free_minutes: 0, data_available: false },
      last_week: { focus_minutes: 0, meeting_minutes: 0, free_minutes: 0, data_available: false },
      focus_trend_pct: 0,
    });
    fetchMock.mockResolvedValueOnce(jsonResponse({ team_id: TEAM_ID, members: [entry(ODD), entry(SHORT_TLD), entry("ok@co.example")] }));
    const roster = await managerApi.remote.listTeam(TEAM_ID);
    expect(roster.members.map((m) => m.email)).toEqual([ODD, SHORT_TLD, "ok@co.example"]);
  });

  it("request validation is unchanged: the client still refuses a malformed address before sending", async () => {
    await expect(teamsApi.remote.addPerson(TEAM_ID, "no-at-sign")).rejects.toThrow(/valid email/);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
