import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import {
  api,
  ApiHttpError,
  apiErrorMessage,
  DEFAULT_AUDIT_LIMIT,
  formatAuditDetails,
  isUsingMocks,
  normalizeAuditEntries,
  setMockMode,
} from "./client";

const fetchMock = vi.fn<typeof fetch>();

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function requestUrl(input: unknown): URL {
  return new URL(String(input));
}

describe("audit log contract", () => {
  beforeEach(() => {
    setMockMode(false);
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterAll(() => {
    vi.unstubAllGlobals();
  });

  it("requests GET /api/audit with the limit query parameter", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse([]));
    await api.getAudit();
    const url = requestUrl(fetchMock.mock.calls[0][0]);
    expect(url.pathname).toBe("/api/audit");
    expect(url.searchParams.get("limit")).toBe(String(DEFAULT_AUDIT_LIMIT));
    expect(fetchMock.mock.calls[0][1]?.method).toBe("GET");
  });

  it("maps the audit response shape", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse([
        { id: 3, action: "focus.run", details: "Created 2 blocks", created_at: "2026-05-04T09:00:00Z" },
      ]),
    );
    await expect(api.getAudit(10)).resolves.toEqual([
      { id: 3, action: "focus.run", details: "Created 2 blocks", created_at: "2026-05-04T09:00:00Z" },
    ]);
    expect(requestUrl(fetchMock.mock.calls[0][0]).searchParams.get("limit")).toBe("10");
  });

  it("returns an empty list for an empty response", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse([]));
    await expect(api.getAudit()).resolves.toEqual([]);
    expect(isUsingMocks()).toBe(false);
  });

  it("renders structured or missing details safely", () => {
    expect(formatAuditDetails({ event: "x", count: 2 })).toBe('{"event":"x","count":2}');
    expect(formatAuditDetails(undefined)).toBe("");
    expect(formatAuditDetails(null)).toBe("");
    expect(normalizeAuditEntries([{ id: "7", created_at: 12 }])).toEqual([
      { id: 7, action: "unknown", details: "", created_at: "" },
    ]);
    expect(normalizeAuditEntries(null)).toEqual([]);
  });

  it.each([401, 403, 500])("surfaces HTTP %i instead of an empty log", async (status) => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: "audit unavailable" }, status));
    const err = await api.getAudit().catch((e) => e);
    expect(err).toBeInstanceOf(ApiHttpError);
    expect(apiErrorMessage(err)).toBe("audit unavailable");
    expect(isUsingMocks()).toBe(false);
  });

  it("falls back to preview entries only when the backend is unreachable", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    const entries = await api.getAudit();
    expect(Array.isArray(entries)).toBe(true);
    expect(isUsingMocks()).toBe(true);
  });

  it("recovers on retry after a failed refetch", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: "boom" }, 500));
    await expect(api.getAudit()).rejects.toBeInstanceOf(ApiHttpError);

    fetchMock.mockResolvedValueOnce(
      jsonResponse([{ id: 1, action: "seed", details: "ok", created_at: "2026-05-04T09:00:00Z" }]),
    );
    await expect(api.getAudit()).resolves.toHaveLength(1);
    expect(isUsingMocks()).toBe(false);
  });
});
