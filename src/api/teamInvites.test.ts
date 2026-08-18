import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import { ApiHttpError, setMockMode } from "./client";
import { normalizeInvite, teamInvitesApi, teamKeys, teamsApi } from "./teams";

const fetchMock = vi.fn<typeof fetch>();

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

beforeEach(() => {
  setMockMode(false);
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  localStorage.clear();
});

afterAll(() => {
  vi.unstubAllGlobals();
});

describe("team invite normalization", () => {
  it("accepts camelCase and snake_case payloads", () => {
    expect(normalizeInvite({ teamId: "t1", teamName: "Platform", invitedEmail: "A@B.com" }, "tok")).toEqual({
      token: "tok",
      team_id: "t1",
      team_name: "Platform",
      invited_email: "a@b.com",
      inviter_email: undefined,
      expires_at: undefined,
    });
    expect(normalizeInvite({ team_id: "t2", team_name: "Design", email: "c@d.com" }, "tok2").team_id).toBe("t2");
  });
});

describe("team invite endpoints", () => {
  it("GETs /api/teams/invites/:token", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ teamId: "t1", teamName: "Platform", email: "a@b.com" }));
    const invite = await teamInvitesApi.get("abc123");
    expect(String(fetchMock.mock.calls[0][0])).toContain("/api/teams/invites/abc123");
    expect(invite.team_name).toBe("Platform");
  });

  it("POSTs the accept endpoint and surfaces the server message on mismatch", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ ok: true }));
    await teamInvitesApi.accept("abc123");
    expect(String(fetchMock.mock.calls[0][0])).toContain("/api/teams/invites/abc123/accept");
    expect(fetchMock.mock.calls[0][1]?.method).toBe("POST");

    fetchMock.mockResolvedValueOnce(jsonResponse({ error: "This invitation was sent to someone else." }, 403));
    await expect(teamInvitesApi.accept("abc123")).rejects.toBeInstanceOf(ApiHttpError);
  });

  it("never falls back to demo data on an HTTP error", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: "gone" }, 410));
    await expect(teamInvitesApi.get("abc123")).rejects.toBeInstanceOf(ApiHttpError);
  });
});

describe("multiple formal teams", () => {
  it("keeps every team returned by GET /api/teams/ and only switches the active one", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse([
        { id: "t1", name: "Team A", members: [] },
        { id: "t2", name: "Team B", members: [] },
      ]),
    );
    const teams = await teamsApi.remote.list();
    expect(teams.map((t) => t.id)).toEqual(["t1", "t2"]);

    teamsApi.setActiveTeam("t2");
    expect(teamsApi.activeTeamId()).toBe("t2");
    const again = await teamsApi.remote.list();
    expect(again).toHaveLength(2);
  });

  it("exposes a stable invite query key", () => {
    expect(teamKeys.invite("tok")).toEqual(["team-invite", "tok"]);
  });
});
