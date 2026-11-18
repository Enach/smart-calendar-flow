/**
 * PAC-122 batch 6, SF-052: the new-link drawer previewed `/book/<slug from
 * the title>`, but the create sent no slug and the server generated another
 * one. Sending the previewed slug is not the fix: slugs are global (deleted
 * links keep theirs), so a common title would fail with a 409 the drawer has
 * no field to recover from. The create keeps sending no slug, the server
 * assigns the address, and the drawer claims no address before that
 * (pinned in src/components/links/LinkEditDrawer.sf052.test.tsx).
 */
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import { schedulingLinksApi } from "./schedulingLinks";

const fetchMock = vi.fn<typeof fetch>();

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}
const BACKEND_LINK = {
  id: "l1", owner_id: "u1", slug: "ana-30", title: "Intro call", duration_options: [30], days_of_week: [1],
  window_start_time: "09:00", window_end_time: "17:00", buffer_before: 0, buffer_after: 0, min_notice_minutes: 0,
  usage_type: "reusable" as const, uses_count: 0, active: true,
  hosts: [{ user_id: "u1", email: "owner@co.com", is_owner: true, status: "accepted" }],
  created_at: "2026-01-01T00:00:00Z", is_owner: true,
};
const INPUT = {
  title: "Intro call", slug: "intro-call", durations: [30], days: ["mon" as const], window_start: "09:00", window_end: "17:00",
  buffer_before: 0, buffer_after: 0, min_notice_minutes: 0, usage_type: "reusable" as const,
};

function bodyOf(method: string, path: string): Record<string, unknown> {
  const call = fetchMock.mock.calls.find(
    ([input, init]) => (init?.method ?? "GET") === method && new URL(String(input), window.location.origin).pathname === path,
  );
  expect(call).toBeDefined();
  return JSON.parse(String(call![1]?.body));
}

describe("PAC-122 SF-052: the server assigns a new link's address", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockImplementation(async (input, init) => {
      const path = new URL(String(input), window.location.origin).pathname;
      if (path === "/api/auth/me") return jsonResponse({ id: "u1", email: "owner@co.com" });
      if ((init?.method ?? "GET") === "POST") return jsonResponse(BACKEND_LINK, 201);
      return jsonResponse(BACKEND_LINK);
    });
  });
  afterAll(() => vi.unstubAllGlobals());

  it("the create sends no slug, so a common title never meets a taken slug", async () => {
    const res = await schedulingLinksApi.createLink(INPUT);
    expect(bodyOf("POST", "/api/scheduling-links/")).not.toHaveProperty("slug");
    // The address is the one the server assigned.
    expect(res.link.slug).toBe("ana-30");
  });

  it("an edit never sends a slug", async () => {
    await schedulingLinksApi.updateLink("l1", { title: "Renamed", slug: "renamed" });
    expect(bodyOf("PATCH", "/api/scheduling-links/l1")).not.toHaveProperty("slug");
  });
});
