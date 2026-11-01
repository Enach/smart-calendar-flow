import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  api,
  API_MESSAGES,
  apiErrorMessage,
  apiFailureMessage,
  ApiGatewayError,
  ApiHttpError,
  ApiRequestCancelledError,
  ApiUnreachableError,
  classifyApiFailure,
  CLIENT_REQUEST_BOUND_MS,
  HEALTH_PROBE_BOUND_MS,
  isBudgetExpired,
  requestApi,
} from "./client";

const fetchMock = vi.fn<typeof fetch>();

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function htmlResponse(status = 200): Response {
  return new Response("<!doctype html><html></html>", {
    status,
    headers: { "content-type": "text/html" },
  });
}

/** A fetch that never answers until its signal aborts (like a real one). */
function hangingFetch(_url: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  return new Promise((_, reject) => {
    init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
  });
}

describe("API error boundary (PAC-83: no invented data after a failure)", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  afterAll(() => {
    vi.unstubAllGlobals();
  });

  it.each([401, 403, 409, 410, 422, 500])(
    "surfaces HTTP %i instead of returning demo data",
    async (status) => {
      fetchMock.mockResolvedValue(jsonResponse({ error: "nope" }, status));
      await expect(api.getEvents("2026-05-04T00:00:00Z", "2026-05-05T00:00:00Z")).rejects.toBeInstanceOf(
        ApiHttpError,
      );
    },
  );

  // Inverted from "falls back to preview data only when the backend is unreachable" (spec §2.5).
  it("rejects with ApiUnreachableError when the backend is unreachable, and the next call goes to the server", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    const err = await api.getSettings().catch((e) => e);
    expect(err).toBeInstanceOf(ApiUnreachableError);
    expect((err as ApiUnreachableError).reason).toBe("network");
    fetchMock.mockResolvedValueOnce(jsonResponse({ workStart: "09:00" }));
    await expect(api.getSettings()).resolves.toMatchObject({ work_start: "09:00" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("treats a non-JSON (SPA index.html) 2xx as unreachable (non-json)", async () => {
    fetchMock.mockResolvedValueOnce(htmlResponse());
    const err = await requestApi("GET", "/settings").catch((e) => e);
    expect(err).toBeInstanceOf(ApiUnreachableError);
    expect((err as ApiUnreachableError).reason).toBe("non-json");
  });

  it("treats a truncated JSON 2xx body as unreachable, never a raw SyntaxError", async () => {
    fetchMock.mockResolvedValueOnce(new Response('{"work', { status: 200, headers: { "content-type": "application/json" } }));
    await expect(requestApi("GET", "/settings")).rejects.toBeInstanceOf(ApiUnreachableError);
  });

  // AC-3 (read family): still waiting at 131 s, lost at the bound.
  it("waits past nginx's 130 s and gives up only at CLIENT_REQUEST_BOUND_MS", async () => {
    vi.useFakeTimers();
    fetchMock.mockImplementation(hangingFetch);
    let settled: unknown = "pending";
    const p = requestApi("GET", "/calendar/events").then(
      (v) => (settled = v),
      (e) => (settled = e),
    );
    await vi.advanceTimersByTimeAsync(131_000);
    expect(settled).toBe("pending");
    await vi.advanceTimersByTimeAsync(CLIENT_REQUEST_BOUND_MS - 131_000);
    await p;
    expect(settled).toBeInstanceOf(ApiUnreachableError);
    expect((settled as ApiUnreachableError).reason).toBe("timeout");
  });

  it("bounds the body read too: headers in time, body stalled → timeout", async () => {
    vi.useFakeTimers();
    fetchMock.mockImplementation(async () => {
      const body = new ReadableStream({ start() {} }); // never enqueues, never closes
      return new Response(body, { status: 200, headers: { "content-type": "application/json" } });
    });
    let settled: unknown = "pending";
    const p = requestApi("GET", "/settings").then(
      (v) => (settled = v),
      (e) => (settled = e),
    );
    await vi.advanceTimersByTimeAsync(131_000);
    expect(settled).toBe("pending");
    await vi.advanceTimersByTimeAsync(CLIENT_REQUEST_BOUND_MS);
    await p;
    expect(settled).toBeInstanceOf(ApiUnreachableError);
  });

  it("AC-1: an answer after 10 s is delivered (no 4 s abort any more)", async () => {
    vi.useFakeTimers();
    fetchMock.mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve(jsonResponse([{ id: "e1", title: "Real", start: "2026-05-04T09:00:00Z", end: "2026-05-04T10:00:00Z" }])), 10_000)),
    );
    const p = api.getEvents("2026-05-04T00:00:00Z", "2026-05-05T00:00:00Z");
    await vi.advanceTimersByTimeAsync(10_000);
    await expect(p).resolves.toMatchObject([{ id: "e1", title: "Real" }]);
  });

  it("maps statuses to actionable messages and never mentions preview or demo data", () => {
    expect(apiErrorMessage(new ApiHttpError(401))).toMatch(/sign in/i);
    expect(apiErrorMessage(new ApiHttpError(409))).toMatch(/conflict/i);
    expect(apiErrorMessage(new ApiHttpError(422, { error: "email is invalid" }))).toBe("email is invalid");
    expect(apiErrorMessage(new ApiUnreachableError())).toBe(API_MESSAGES.lostRead);
    expect(apiErrorMessage(new ApiUnreachableError(), "write")).toBe(API_MESSAGES.lostWrite);
    for (const e of [new ApiUnreachableError(), new ApiUnreachableError("timeout"), new ApiGatewayError(502)]) {
      for (const effect of ["read", "write", "booking"] as const) {
        expect(apiErrorMessage(e, effect)).not.toMatch(/preview|demo/i);
      }
    }
  });

  it("health reports an unreachable backend without inventing an 'ok' and without switching anything", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    await expect(api.health()).resolves.toMatchObject({ reachable: false, status: "unreachable" });
    fetchMock.mockResolvedValueOnce(jsonResponse([]));
    await expect(api.getEvents("2026-05-04T00:00:00Z", "2026-05-05T00:00:00Z")).resolves.toEqual([]);
  });

  it("health treats a non-JSON SPA response as unreachable", async () => {
    fetchMock.mockResolvedValueOnce(htmlResponse());
    await expect(api.health()).resolves.toMatchObject({ reachable: false });
  });

  it("health gives up after HEALTH_PROBE_BOUND_MS (D-2)", async () => {
    vi.useFakeTimers();
    fetchMock.mockImplementation(hangingFetch);
    let settled: unknown = "pending";
    const p = api.health().then((v) => (settled = v));
    await vi.advanceTimersByTimeAsync(HEALTH_PROBE_BOUND_MS - 1);
    expect(settled).toBe("pending");
    await vi.advanceTimersByTimeAsync(1);
    await p;
    expect(settled).toMatchObject({ reachable: false });
  });

  it.each([500, 502, 503])(
    "health surfaces a JSON HTTP %i as an unhealthy backend, not as offline",
    async (status) => {
      fetchMock.mockResolvedValue(jsonResponse({ error: "upstream down" }, status));
      await expect(api.health()).rejects.toBeInstanceOf(ApiHttpError);
    },
  );

  it("health reports the failure message", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ error: "database unavailable" }, 503));
    const err = await api.health().catch((e) => e);
    expect(err).toBeInstanceOf(ApiHttpError);
    expect((err as ApiHttpError).status).toBe(503);
    expect(apiErrorMessage(err)).toBe("database unavailable");
  });
});

describe("PAC-83 error taxonomy (contract §2, §3)", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterAll(() => {
    vi.unstubAllGlobals();
  });

  it("recognises the budget 503 by status AND body, never by status alone", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: "request timed out" }, 503));
    const budget = await requestApi("GET", "/calendar/events").catch((e) => e);
    expect(isBudgetExpired(budget)).toBe(true);
    expect(classifyApiFailure(budget)).toBe("budget");

    fetchMock.mockResolvedValueOnce(jsonResponse({ error: "Zoom OAuth not configured" }, 503));
    const other = await requestApi("GET", "/calendar/events").catch((e) => e);
    expect(isBudgetExpired(other)).toBe(false);
    expect(classifyApiFailure(other)).toBe("http");

    expect(isBudgetExpired(new ApiHttpError(500, { error: "request timed out" }))).toBe(false);
  });

  it.each([502, 503, 504, 524])("an HTML %i is a gateway error (lost), never 'The server had a problem'", async (status) => {
    fetchMock.mockResolvedValueOnce(htmlResponse(status));
    const err = await requestApi("GET", "/calendar/events").catch((e) => e);
    expect(err).toBeInstanceOf(ApiGatewayError);
    expect(classifyApiFailure(err)).toBe("lost");
    const { message, retry } = apiFailureMessage(err, "read");
    expect(message).toBe(API_MESSAGES.lostRead);
    expect(message).not.toMatch(/<|server had a problem/i);
    expect(retry).toBe(true);
  });

  it("a 5xx whose body says JSON but does not parse is a gateway error", async () => {
    fetchMock.mockResolvedValueOnce(new Response("oops", { status: 502, headers: { "content-type": "application/json" } }));
    await expect(requestApi("GET", "/x")).rejects.toBeInstanceOf(ApiGatewayError);
  });

  it("a proxy's JSON 502 is an ApiHttpError (not a gateway error)", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ message: "An invalid response was received from the upstream server" }, 502));
    const err = await requestApi("GET", "/x").catch((e) => e);
    expect(err).toBeInstanceOf(ApiHttpError);
    expect(classifyApiFailure(err)).toBe("http");
  });

  it("413 is 'too large' by status alone, with no retry", async () => {
    fetchMock.mockResolvedValueOnce(htmlResponse(413));
    const err = await requestApi("POST", "/nlp/parse", { text: "x" }).catch((e) => e);
    expect(classifyApiFailure(err)).toBe("too-large");
    expect(apiFailureMessage(err, "write", "the request text")).toEqual({
      message: "This is too large to send. Shorten the request text.",
      retry: false,
    });
  });

  it("classifies in precedence: cancelled, budget, too-large, lost, http", () => {
    expect(classifyApiFailure(new ApiRequestCancelledError())).toBe("cancelled");
    expect(classifyApiFailure(new ApiHttpError(503, { error: "request timed out" }))).toBe("budget");
    expect(classifyApiFailure(new ApiHttpError(413))).toBe("too-large");
    expect(classifyApiFailure(new ApiUnreachableError("timeout"))).toBe("lost");
    expect(classifyApiFailure(new ApiGatewayError(504))).toBe("lost");
    expect(classifyApiFailure(new ApiHttpError(409))).toBe("http");
  });

  it("words each kind per effect (contract §3.3)", () => {
    const budget = new ApiHttpError(503, { error: "request timed out" });
    expect(apiFailureMessage(budget, "read")).toEqual({ message: API_MESSAGES.budgetRead, retry: true });
    expect(apiFailureMessage(budget, "write")).toEqual({
      message: "This took too long and was stopped. Try again. Refresh to check whether it was applied.",
      retry: false,
    });
    expect(apiFailureMessage(budget, "booking")).toEqual({ message: API_MESSAGES.budgetBooking, retry: false });
    const lost = new ApiUnreachableError();
    expect(apiFailureMessage(lost, "write")).toEqual({ message: API_MESSAGES.lostWrite, retry: false });
    expect(apiFailureMessage(lost, "booking")).toEqual({ message: API_MESSAGES.lostBooking, retry: false });
    // Booking create: every 5xx other than the budget 503 is "may have been saved".
    for (const e of [new ApiHttpError(500, { error: "x" }), new ApiHttpError(503, { error: "service unavailable" }), new ApiHttpError(502, { message: "upstream" })]) {
      expect(apiFailureMessage(e, "booking").message).toBe(API_MESSAGES.lostBooking);
    }
    expect(apiFailureMessage(new ApiRequestCancelledError(), "read")).toEqual({ message: "", retry: false });
  });
});
