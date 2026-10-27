import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import { ApiHttpError, setMockMode } from "./client";
import type { components } from "./generated/types";
import { normalizeInvite, teamInvitesApi, teamKeys, teamsApi } from "./teams";

type TeamInvitePreview = components["schemas"]["TeamInvitePreview"];

// The exact GET /api/teams/invites/{token} body the backend sends (PAC-34, AC-1).
const preview: TeamInvitePreview = {
  teamName: "Platform",
  inviterName: "Ines Inviter",
  email: "A@B.com",
  team_id: "5f0c2a8e-0b7a-4d9e-9c43-0d6c1f6f1a11",
  expires_at: "2026-11-03T10:00:00.123456Z",
  inviter_email: "ines@co.com",
};

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
  it("maps the contract's TeamInvitePreview onto the page model (PAC-34 AC-2)", () => {
    expect(normalizeInvite(preview, "tok")).toEqual({
      token: "tok",
      team_id: "5f0c2a8e-0b7a-4d9e-9c43-0d6c1f6f1a11",
      team_name: "Platform",
      invited_email: "a@b.com",
      inviter_name: "Ines Inviter",
      inviter_email: "ines@co.com",
      expires_at: "2026-11-03T10:00:00.123456Z",
    });
  });

  it("keeps an unreadable inviter as absent, never as a string", () => {
    const out = normalizeInvite({ ...preview, inviterName: "", inviter_email: null }, "tok");
    expect(out.inviter_name).toBeNull();
    expect(out.inviter_email).toBeNull();
  });
});

describe("team invite endpoints", () => {
  it("GETs /api/teams/invites/:token", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(preview));
    const invite = await teamInvitesApi.get("abc123");
    expect(String(fetchMock.mock.calls[0][0])).toContain("/api/teams/invites/abc123");
    expect(invite.team_name).toBe("Platform");
    expect(invite.team_id).toBe(preview.team_id);
    expect(invite.expires_at).toBe(preview.expires_at);
    expect(invite.inviter_email).toBe("ines@co.com");
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
    fetchMock.mockImplementation(async () =>
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
