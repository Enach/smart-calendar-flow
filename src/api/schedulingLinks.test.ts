import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { isApiHttpError, isUsingMocks, setMockMode } from "./client";
import { publicBookingUrl, schedulingLinksApi, validateLinkForm } from "./schedulingLinks";
import type { Weekday } from "./types";

const fetchMock = vi.fn<typeof fetch>();

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}
function emptyResponse(status = 204): Response {
  return new Response(null, { status });
}
function requestPath(input: RequestInfo | URL): string {
  return new URL(String(input), window.location.origin).pathname;
}

const BACKEND_LINK = {
  id: "l1",
  owner_id: "u1",
  slug: "intro",
  title: "Intro",
  duration_options: [15, 30],
  days_of_week: [1, 3, 5],
  window_start_time: "09:00",
  window_end_time: "17:00",
  buffer_before: 5,
  buffer_after: 10,
  min_notice_minutes: 60,
  usage_type: "reusable" as const,
  uses_count: 2,
  active: true,
  hosts: [{ user_id: "u1", email: "owner@co.com", is_owner: true, status: "accepted" }],
  created_at: "2026-01-01T00:00:00Z",
  is_owner: true,
};

describe("scheduling links contract", () => {
  beforeEach(() => {
    setMockMode(false);
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterAll(() => vi.unstubAllGlobals());

  it("normalizes backend field names on list and splits owned/shared", async () => {
    fetchMock.mockImplementation(async (input) => {
      const path = requestPath(input);
      if (path === "/api/scheduling-links/") {
        return jsonResponse({
          owned: [BACKEND_LINK],
          shared: [{ ...BACKEND_LINK, id: "l2", owner_id: "u9", is_owner: false, my_status: "accepted" }],
        });
      }
      return jsonResponse({ id: "u1", email: "owner@co.com" });
    });

    const res = await schedulingLinksApi.listLinks();
    expect(res.owned).toHaveLength(1);
    expect(res.shared).toHaveLength(1);
    expect(res.owned[0]).toMatchObject({
      durations: [15, 30],
      days: ["mon", "wed", "fri"],
      window_start: "09:00",
      window_end: "17:00",
      min_notice_minutes: 60,
      uses_count: 2,
    });
  });

  it("sends the frozen backend body names when creating a link", async () => {
    fetchMock.mockImplementation(async (input, init) => {
      const path = requestPath(input);
      if (path === "/api/scheduling-links/" && init?.method === "POST") return jsonResponse(BACKEND_LINK);
      if (path === "/api/scheduling-links/l1/hosts") return jsonResponse({ ok: true });
      if (path === "/api/scheduling-links/l1") return jsonResponse(BACKEND_LINK);
      return jsonResponse({ id: "u1", email: "owner@co.com" });
    });

    await schedulingLinksApi.createLink({
      title: "Intro",
      slug: "intro",
      durations: [15, 30],
      days: ["mon", "wed", "fri"] as Weekday[],
      window_start: "09:00",
      window_end: "17:00",
      buffer_before: 5,
      buffer_after: 10,
      min_notice_minutes: 60,
      usage_type: "reusable",
      co_host_emails: ["mate@co.com"],
    });

    const post = fetchMock.mock.calls.find(
      ([input, init]) => requestPath(input) === "/api/scheduling-links/" && init?.method === "POST",
    );
    const body = JSON.parse(String(post?.[1]?.body));
    expect(body).toMatchObject({
      title: "Intro",
      duration_options: [15, 30],
      days_of_week: [1, 3, 5],
      window_start_time: "09:00",
      window_end_time: "17:00",
      buffer_before: 5,
      buffer_after: 10,
      min_notice_minutes: 60,
      usage_type: "reusable",
    });
    expect(body).not.toHaveProperty("durations");
    expect(body).not.toHaveProperty("days");
    expect(body).not.toHaveProperty("slug");

    const hostCall = fetchMock.mock.calls.find(([input]) => requestPath(input) === "/api/scheduling-links/l1/hosts");
    expect(JSON.parse(String(hostCall?.[1]?.body))).toEqual({ email: "mate@co.com" });
  });

  it("returns the server response after an update, not the local form state", async () => {
    fetchMock.mockImplementation(async (input, init) => {
      const path = requestPath(input);
      if (path === "/api/scheduling-links/l1" && init?.method === "PATCH") return jsonResponse({});
      if (path === "/api/scheduling-links/l1") return jsonResponse({ ...BACKEND_LINK, title: "Server title" });
      return jsonResponse({ id: "u1", email: "owner@co.com" });
    });

    const updated = await schedulingLinksApi.updateLink("l1", { title: "Local title" });
    expect(updated.title).toBe("Server title");
  });

  it("handles 204 responses on delete and leave without a JSON parse error", async () => {
    fetchMock.mockResolvedValue(emptyResponse(204));
    await expect(schedulingLinksApi.deleteLink("l1")).resolves.toBeUndefined();
    await expect(schedulingLinksApi.leaveLink("l1")).resolves.toBeUndefined();
    expect(isUsingMocks()).toBe(false);
  });

  it("surfaces real HTTP errors instead of falling back to demo data", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ detail: "Slug already taken" }, 409));
    await expect(
      schedulingLinksApi.createLink({
        title: "Intro",
        slug: "intro",
        durations: [30],
        days: ["mon"] as Weekday[],
        window_start: "09:00",
        window_end: "17:00",
        buffer_before: 0,
        buffer_after: 0,
        min_notice_minutes: 0,
        usage_type: "reusable",
        co_host_emails: [],
      }),
    ).rejects.toSatisfy((e: unknown) => isApiHttpError(e) && e.status === 409);
    expect(isUsingMocks()).toBe(false);
  });

  it("falls back to preview data only when the backend is unreachable", async () => {
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));
    const res = await schedulingLinksApi.listLinks();
    expect(res.owned.length + res.shared.length).toBeGreaterThan(0);
    expect(isUsingMocks()).toBe(true);
  });

  it("uses the documented host-invite endpoints", async () => {
    fetchMock.mockResolvedValue(emptyResponse(204));
    await schedulingLinksApi.acceptInvite("l7");
    await schedulingLinksApi.declineInvite("l7");
    expect(requestPath(fetchMock.mock.calls[0][0])).toBe("/api/scheduling-links/host-invites/l7/accept");
    expect(requestPath(fetchMock.mock.calls[1][0])).toBe("/api/scheduling-links/host-invites/l7/decline");
  });
});

describe("scheduling link form validation", () => {
  const base = {
    title: "Intro",
    durations: [30],
    days: ["mon"] as Weekday[],
    window_start: "09:00",
    window_end: "17:00",
    buffer_before: 0,
    buffer_after: 0,
    min_notice_minutes: 0,
    usage_type: "reusable" as const,
  };

  it("accepts a valid payload", () => {
    expect(validateLinkForm(base)).toBeNull();
  });

  it("rejects missing title, durations and days", () => {
    expect(validateLinkForm({ ...base, title: "  " })).toMatch(/title/i);
    expect(validateLinkForm({ ...base, durations: [] })).toMatch(/duration/i);
    expect(validateLinkForm({ ...base, days: [] })).toMatch(/day/i);
  });

  it("rejects an inverted window, negative buffers/notice and bad max uses", () => {
    expect(validateLinkForm({ ...base, window_start: "18:00", window_end: "09:00" })).toMatch(/before/i);
    expect(validateLinkForm({ ...base, buffer_before: -5 })).toMatch(/negative/i);
    expect(validateLinkForm({ ...base, min_notice_minutes: -1 })).toMatch(/negative/i);
    expect(validateLinkForm({ ...base, usage_type: "recurring", max_uses: 0 })).toMatch(/maximum/i);
    expect(validateLinkForm({ ...base, usage_type: "recurring", max_uses: 3 })).toBeNull();
  });

  it("builds the public URL deterministically from the slug", () => {
    expect(publicBookingUrl("intro-chat", "https://app.test/")).toBe("https://app.test/book/intro-chat");
  });
});
