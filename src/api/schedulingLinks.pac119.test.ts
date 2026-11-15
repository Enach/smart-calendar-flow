/**
 * PAC-119 (contract §7.1): the link create's Idempotency-Key at the API layer
 * and the create 409's oneOf. [unit] The demo create (AC-24) is tested in
 * src/demo/LinkEditDrawer.pac119.test.tsx, since only src/demo imports demo code.
 */
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import { ApiHttpError } from "./client";
import { linkCreateConflict, newBookingAttemptKey, schedulingLinksApi } from "./schedulingLinks";

const fetchMock = vi.fn<typeof fetch>();
const KEY = "3f0c2a8e-1d4b-4c6a-9e7f-0123456789ab";
const KEY_FORMAT = /^[A-Za-z0-9_-]{16,255}$/;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}
const BACKEND_LINK = {
  id: "l1", owner_id: "u1", slug: "intro", title: "Intro", duration_options: [30], days_of_week: [1],
  window_start_time: "09:00", window_end_time: "17:00", buffer_before: 0, buffer_after: 0, min_notice_minutes: 0,
  usage_type: "reusable" as const, uses_count: 0, active: true,
  hosts: [{ user_id: "u1", email: "owner@co.com", is_owner: true, status: "accepted" }],
  created_at: "2026-01-01T00:00:00Z", is_owner: true,
};
const INPUT = {
  title: "Intro", slug: "", durations: [30], days: ["mon" as const], window_start: "09:00", window_end: "17:00",
  buffer_before: 0, buffer_after: 0, min_notice_minutes: 0, usage_type: "reusable" as const,
};

function headersOf(call: Parameters<typeof fetch>): Record<string, string> {
  return ((call[1]?.headers ?? {}) as Record<string, string>);
}
function callsTo(method: string, path: string) {
  return fetchMock.mock.calls.filter(
    ([input, init]) => (init?.method ?? "GET") === method && new URL(String(input), window.location.origin).pathname === path,
  );
}

describe("createLink and updateLink headers (contract §7.1)", () => {
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

  it("AC-16: a keyed create sends the key as the Idempotency-Key header, and the body never carries it", async () => {
    await schedulingLinksApi.createLink(INPUT, KEY);
    const [post] = callsTo("POST", "/api/scheduling-links/");
    expect(headersOf(post)["Idempotency-Key"]).toBe(KEY);
    expect(String(post[1]?.body)).not.toContain(KEY);
    expect(JSON.parse(String(post[1]?.body))).not.toHaveProperty("Idempotency-Key");
  });

  it("a create without a key sends no Idempotency-Key header (today's request)", async () => {
    await schedulingLinksApi.createLink(INPUT);
    const [post] = callsTo("POST", "/api/scheduling-links/");
    expect(headersOf(post)).not.toHaveProperty("Idempotency-Key");
  });

  it("AC-18: updateLink never sends the header", async () => {
    await schedulingLinksApi.updateLink("l1", { title: "Renamed" });
    for (const call of fetchMock.mock.calls) expect(headersOf(call)).not.toHaveProperty("Idempotency-Key");
    expect(callsTo("PATCH", "/api/scheduling-links/l1")).toHaveLength(1);
  });

  it("the key generator keeps PAC-82's format: a v4 UUID inside the contract's 16..255 [A-Za-z0-9_-]", () => {
    const keys = new Set(Array.from({ length: 50 }, () => newBookingAttemptKey()));
    expect(keys.size).toBe(50);
    for (const k of keys) {
      expect(k).toMatch(KEY_FORMAT);
      expect(k).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    }
  });
});

describe("the create 409 oneOf (contract §1.3)", () => {
  const L = "7b0e7c1e-4a49-4d7e-9a43-2f4e0a6b5c11";

  it("discriminates on `error`", () => {
    expect(linkCreateConflict(new ApiHttpError(409, { error: "slug already exists" }))).toEqual({ error: "slug already exists" });
    expect(linkCreateConflict(new ApiHttpError(409, { error: "idempotency key already used", link_id: L }))).toEqual({
      error: "idempotency key already used", link_id: L,
    });
    expect(linkCreateConflict(new ApiHttpError(409, { error: "idempotency key expired", link_id: L }))).toEqual({
      error: "idempotency key expired", link_id: L,
    });
    expect(linkCreateConflict(new ApiHttpError(409, { error: "idempotency key already used by a deleted link" }))).toEqual({
      error: "idempotency key already used by a deleted link",
    });
  });

  it("is strict: a body matching no variant, another status or another error is null (today's handling)", () => {
    // A link refusal without its link_id, a deleted refusal naming a link, an unknown text, an extra field.
    expect(linkCreateConflict(new ApiHttpError(409, { error: "idempotency key already used" }))).toBeNull();
    expect(linkCreateConflict(new ApiHttpError(409, { error: "idempotency key already used by a deleted link", link_id: L }))).toBeNull();
    expect(linkCreateConflict(new ApiHttpError(409, { error: "Slug already taken" }))).toBeNull();
    expect(linkCreateConflict(new ApiHttpError(409, { error: "slug already exists", extra: 1 }))).toBeNull();
    expect(linkCreateConflict(new ApiHttpError(409, { error: "idempotency key expired", link_id: "not-a-uuid" }))).toBeNull();
    expect(linkCreateConflict(new ApiHttpError(422, { error: "slug already exists" }))).toBeNull();
    expect(linkCreateConflict(new Error("409"))).toBeNull();
  });
});
