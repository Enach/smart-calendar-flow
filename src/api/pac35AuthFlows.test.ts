import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import {
  api,
  canDisconnectCalendar,
  isApiHttpError,
  isApiUnreachableError,
  isCalendarDisconnectUnsupported,
  isUsingMocks,
  requestApi,
  setMockMode,
} from "./client";
import { schedulingLinksApi } from "./schedulingLinks";
import { apiFetch } from "@/lib/api";

// PAC-35 (spec docs/specs/PAC-35.md in the api repo): the client half of the
// sign-in and sign-out repairs.

const fetchMock = vi.fn<typeof fetch>();

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}
function requestPath(input: RequestInfo | URL): string {
  return new URL(String(input), window.location.origin).pathname;
}

const UNSUPPORTED = { error: "disconnecting this kind of calendar is not available yet", provider: "outlook" };

describe("PAC-35 client", () => {
  beforeEach(() => {
    setMockMode(false);
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterAll(() => vi.unstubAllGlobals());

  // AC-12: logout answers 204 with no body; both clients take it as success.
  it("classifies logout's 204 as success in the strict and the lenient client", async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }));
    await expect(requestApi<void>("POST", "/auth/logout")).resolves.toBeUndefined();
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }));
    await expect(apiFetch("/api/auth/logout", { method: "POST" })).resolves.toBeUndefined();
  });

  // AC-17 (web): the 409 is a failure, never success, never "unreachable".
  it("rejects disconnect's 409 as a recognisable failure without switching to preview data", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(UNSUPPORTED, 409));
    const err = await api.authDisconnect().then(
      () => {
        throw new Error("a 409 resolved as success");
      },
      (e: unknown) => e,
    );
    expect(isApiHttpError(err)).toBe(true);
    expect(isApiUnreachableError(err)).toBe(false);
    expect(isCalendarDisconnectUnsupported(err)).toBe(true);
    expect(isUsingMocks()).toBe(false);
  });

  it("does not mistake another 409 or another failure for the unsupported answer", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: "something else" }, 409));
    const other409 = await api.authDisconnect().catch((e: unknown) => e);
    expect(isCalendarDisconnectUnsupported(other409)).toBe(false);

    fetchMock.mockResolvedValueOnce(jsonResponse({ error: "internal error" }, 500));
    const serverError = await api.authDisconnect().catch((e: unknown) => e);
    expect(isCalendarDisconnectUnsupported(serverError)).toBe(false);
    expect(isCalendarDisconnectUnsupported(new Error("x"))).toBe(false);
  });

  it("offers disconnect only for what the server's status calls Google", () => {
    expect(canDisconnectCalendar("google")).toBe(true);
    expect(canDisconnectCalendar(undefined)).toBe(true);
    expect(canDisconnectCalendar("outlook")).toBe(false);
    expect(canDisconnectCalendar("webcal")).toBe(false);
  });

  // AC-13 and AC-14: the picture is read as avatarUrl from the current-user
  // read and shown on the owner's host entry.
  it("puts the current user's avatarUrl on the owner host of their own links", async () => {
    const link = {
      id: "l1",
      owner_id: "u1",
      slug: "intro",
      title: "Intro",
      duration_options: [30],
      days_of_week: [1],
      window_start_time: "09:00",
      window_end_time: "17:00",
      usage_type: "reusable",
      active: true,
      is_owner: true,
      hosts: [] as unknown[],
    };
    const me = {
      id: "u1",
      email: "owner@co.com",
      name: "Owner",
      avatarUrl: "https://img.test/owner.png",
      provider: "google",
      createdAt: "2026-01-01T00:00:00Z",
    };
    fetchMock.mockImplementation(async (input) =>
      requestPath(input) === "/api/scheduling-links/" ? jsonResponse({ owned: [link], shared: [] }) : jsonResponse(me),
    );
    let res = await schedulingLinksApi.listLinks();
    expect(res.owned[0].hosts[0]).toMatchObject({ user_id: "u1", is_owner: true, avatar_url: "https://img.test/owner.png" });

    // The server lists the owner as a host but sends no picture there: the
    // current-user read fills it in.
    link.hosts = [{ user_id: "u1", email: "owner@co.com", is_owner: true, status: "accepted" }];
    res = await schedulingLinksApi.listLinks();
    expect(res.owned[0].hosts).toHaveLength(1);
    expect(res.owned[0].hosts[0].avatar_url).toBe("https://img.test/owner.png");

    // An empty picture stays absent, so initials render.
    me.avatarUrl = "";
    res = await schedulingLinksApi.listLinks();
    expect(res.owned[0].hosts[0].avatar_url).toBeUndefined();
  });
});
