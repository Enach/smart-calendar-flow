/**
 * PAC-122 batch 6b, SF-024 (API half): a write that succeeded and whose
 * follow-up re-read failed was reported as a failed write, so the user
 * retried it (a second createTeam creates a second team). The write's
 * success now survives: the operation rejects with SavedButNotReadError,
 * which says the write happened and carries the re-read's error.
 */
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import { SavedButNotReadError } from "./savedButNotRead";
import { teamsApi } from "./teams";
import { managerApi } from "./manager";

const TEAM = "11111111-1111-4111-8111-111111111111";
const fetchMock = vi.fn<typeof fetch>();
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

function calls(method: string, path: string) {
  return fetchMock.mock.calls.filter(
    ([i, init]) => (init?.method ?? "GET") === method && new URL(String(i), window.location.origin).pathname === path,
  );
}

describe("PAC-122 SF-024: a failed re-read after a successful write", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterAll(() => vi.unstubAllGlobals());

  it("createTeam: the team was created; the error says so and the POST is sent once", async () => {
    fetchMock.mockImplementation(async (i, init) => {
      const path = new URL(String(i), window.location.origin).pathname;
      if (path === "/api/teams/" && init?.method === "POST") return json({ team: { id: TEAM, name: "Platform" } }, 201);
      return json({ error: "internal error" }, 500);
    });
    const err = await teamsApi.remote.createTeam("Platform").catch((e) => e);
    expect(err).toBeInstanceOf(SavedButNotReadError);
    expect((err as SavedButNotReadError).cause).toBeDefined();
    expect(calls("POST", "/api/teams/")).toHaveLength(1);
  });

  it("manager addMember: the person was added; the error says so", async () => {
    fetchMock.mockImplementation(async (i, init) => {
      const path = new URL(String(i), window.location.origin).pathname;
      if (path === "/api/manager/team/members" && init?.method === "POST") return json({}, 201);
      return json({ error: "internal error" }, 500);
    });
    const err = await managerApi.remote.addMember({ email: "b@co.com", cadence: "weekly" }, TEAM).catch((e) => e);
    expect(err).toBeInstanceOf(SavedButNotReadError);
    expect(calls("POST", "/api/manager/team/members")).toHaveLength(1);
  });

  it("manager updateMember: the change was saved; the error says so", async () => {
    fetchMock.mockImplementation(async (i, init) => {
      const path = new URL(String(i), window.location.origin).pathname;
      if (path === "/api/manager/team/members/b%40co.com" && init?.method === "PATCH") return json({});
      return json({ error: "internal error" }, 500);
    });
    const err = await managerApi.remote.updateMember("b@co.com", { cadence: "weekly" }, TEAM).catch((e) => e);
    expect(err).toBeInstanceOf(SavedButNotReadError);
  });

  it("a failed write is still the write's own error", async () => {
    fetchMock.mockResolvedValue(json({ error: "internal error" }, 500));
    const err = await teamsApi.remote.createTeam("Platform").catch((e) => e);
    expect(err).not.toBeInstanceOf(SavedButNotReadError);
  });
});
