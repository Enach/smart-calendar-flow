import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  api,
  API_MESSAGES,
  apiErrorMessage,
  apiFailureMessage,
  ApiGatewayError,
  ApiHttpError,
  ApiRateLimitedError,
  ApiRequestCancelledError,
  ApiUnreachableError,
  classifyApiFailure,
  CLIENT_REQUEST_BOUND_MS,
  HEALTH_PROBE_BOUND_MS,
  isBudgetExpired,
  parseRetryAfterMs,
  RATE_LIMIT_DEFAULT_RETRY_MS,
  rateLimitRetryAfterMs,
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

  it("health reports the failure message, worded from the status (PAC-69), not from the server's string", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ error: "database unavailable" }, 503));
    const err = await api.health().catch((e) => e);
    expect(err).toBeInstanceOf(ApiHttpError);
    expect((err as ApiHttpError).status).toBe(503);
    expect(apiErrorMessage(err)).toBe(API_MESSAGES.serverProblem);
    expect(apiErrorMessage(err)).not.toMatch(/database/i);
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

  it("classifies in precedence: cancelled, budget, too-large, rate-limited, lost, http", () => {
    expect(classifyApiFailure(new ApiRequestCancelledError())).toBe("cancelled");
    expect(classifyApiFailure(new ApiHttpError(503, { error: "request timed out" }))).toBe("budget");
    expect(classifyApiFailure(new ApiHttpError(413))).toBe("too-large");
    expect(classifyApiFailure(new ApiHttpError(429))).toBe("rate-limited");
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

/**
 * PAC-69: the backend wraps every 5xx in the `{ error }` envelope with a fixed
 * developer-facing text (`internal error`). A user can do nothing with it, so
 * any status >= 500 is worded from the status alone — the same principle
 * NEW-booking-rate-limit applied to 429s.
 */
describe("PAC-69: a >= 500 answer is worded from its status, never from its body", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterAll(() => {
    vi.unstubAllGlobals();
  });

  /** The server's fixed 5xx envelope, the dev proxy's text/plain 5xx, and a bodiless 5xx. */
  const BODIES = {
    json: (status: number) => jsonResponse({ error: "internal error" }, status),
    text: (status: number) => new Response("internal error", { status, headers: { "content-type": "text/plain" } }),
    empty: (status: number) => new Response(null, { status }),
  } as const;

  it.each([500, 502, 503])(
    "a %i with a JSON {error} envelope says the generic sentence, not the server's text",
    async (status) => {
      fetchMock.mockResolvedValueOnce(BODIES.json(status));
      const err = await requestApi("GET", "/calendar/events").catch((e) => e);
      expect(err).toBeInstanceOf(ApiHttpError);
      expect(classifyApiFailure(err)).toBe("http");
      expect(apiErrorMessage(err)).toBe(API_MESSAGES.serverProblem);
      expect(apiErrorMessage(err, "write")).toBe(API_MESSAGES.serverProblem);
      expect(apiErrorMessage(err)).not.toMatch(/internal error/i);
    },
  );

  // A non-JSON or empty 5xx never reaches apiErrorMessage's HTTP branch at all:
  // interpretResponse raises ApiGatewayError, classified "lost". Asserted here
  // so the matrix is complete and the two paths stay distinct.
  it.each([
    [500, "text"],
    [500, "empty"],
    [502, "text"],
    [502, "empty"],
    [503, "text"],
    [503, "empty"],
  ] as const)("a %i with a %s body is a gateway error, and its wording is still not the server's text", async (status, shape) => {
    fetchMock.mockResolvedValueOnce(BODIES[shape](status));
    const err = await requestApi("GET", "/calendar/events").catch((e) => e);
    expect(err).toBeInstanceOf(ApiGatewayError);
    expect(classifyApiFailure(err)).toBe("lost");
    expect(apiErrorMessage(err)).toBe(API_MESSAGES.lostRead);
    expect(apiErrorMessage(err)).not.toMatch(/internal error/i);
  });

  // Raised without going through interpretResponse (a 5xx ApiHttpError built
  // directly, as callers and other modules do), with every body shape.
  it.each([500, 502, 503])("an ApiHttpError(%i) is worded from the status whatever its data", (status) => {
    for (const data of [{ error: "internal error" }, { message: "upstream" }, { detail: "boom" }, "internal error", undefined]) {
      expect(apiErrorMessage(new ApiHttpError(status, data))).toBe(API_MESSAGES.serverProblem);
    }
  });

  it("the budget 503 keeps its own wording (classified before the HTTP branch)", () => {
    const budget = new ApiHttpError(503, { error: "request timed out" });
    expect(classifyApiFailure(budget)).toBe("budget");
    expect(apiErrorMessage(budget)).toBe(API_MESSAGES.budgetRead);
  });

  it("4xx handling is unchanged: a {error} body is still shown word for word", () => {
    expect(apiErrorMessage(new ApiHttpError(422, { error: "email is invalid" }))).toBe("email is invalid");
    expect(apiErrorMessage(new ApiHttpError(400, { error: "slug is taken" }))).toBe("slug is taken");
    expect(apiErrorMessage(new ApiHttpError(409, { message: "already booked" }))).toBe("already booked");
    expect(apiErrorMessage(new ApiHttpError(404, { detail: "no such link" }))).toBe("no such link");
    // And a 4xx with no body keeps its status wording.
    expect(apiErrorMessage(new ApiHttpError(401))).toMatch(/sign in/i);
    expect(apiErrorMessage(new ApiHttpError(403))).toBe("You don't have permission to do this.");
    expect(apiErrorMessage(new ApiHttpError(418))).toBe("Request failed (418).");
    // The boundary itself: 499 reads its body, 500 does not.
    expect(apiErrorMessage(new ApiHttpError(499, { error: "client closed request" }))).toBe("client closed request");
    expect(apiErrorMessage(new ApiHttpError(500, { error: "client closed request" }))).toBe(API_MESSAGES.serverProblem);
  });
});

/**
 * NEW-booking-rate-limit (clockwise-like#332): the api repo's per-client
 * limiter. `createPublicBooking` and `getPublicBookingSlots` are the only two
 * public booking operations that declare a 429 (src/api/generated/types.ts:
 * `BookingCreateRateLimited`, `BookingSlotsRateLimited`); `getPublicLinkInfo`
 * declares 200, 404, 410 and 500 only, so nothing here is mapped for it.
 */
describe("NEW-booking-rate-limit: the 429 and its Retry-After", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterAll(() => {
    vi.unstubAllGlobals();
  });

  function rateLimited(retryAfter?: string): Response {
    return new Response(JSON.stringify({ error: "rate limit exceeded" }), {
      status: 429,
      headers: { "content-type": "application/json", ...(retryAfter === undefined ? {} : { "retry-after": retryAfter }) },
    });
  }

  it("Retry-After: 30 is honoured as sent, not replaced by the client's default", async () => {
    fetchMock.mockResolvedValueOnce(rateLimited("30"));
    const err = await requestApi("POST", "/book/intro", { name: "A" }).catch((e) => e);
    expect(err).toBeInstanceOf(ApiRateLimitedError);
    expect((err as ApiRateLimitedError).retryAfterMs).toBe(30_000);
    expect((err as ApiRateLimitedError).retryAfterFromServer).toBe(true);
    expect(rateLimitRetryAfterMs(err)).toBe(30_000);
    // Still an ApiHttpError with its status, so every existing 429 branch holds.
    expect(err).toBeInstanceOf(ApiHttpError);
    expect((err as ApiHttpError).status).toBe(429);
  });

  // Defensive tolerance only: this API declares Retry-After `required`,
  // `type: integer`, delta-seconds, and never sends an HTTP-date. Reading the
  // other RFC 9110 form costs two lines and keeps a rewriting proxy from
  // silently pushing every 429 onto the fallback.
  it("tolerates the HTTP-date form rather than falling back", async () => {
    const at = new Date(Date.now() + 45_000);
    fetchMock.mockResolvedValueOnce(rateLimited(at.toUTCString()));
    const err = await requestApi("GET", "/book/intro/slots").catch((e) => e);
    expect(err).toBeInstanceOf(ApiRateLimitedError);
    const ms = (err as ApiRateLimitedError).retryAfterMs;
    // The header has whole-second resolution, so allow the rounding either way.
    expect(ms).toBeGreaterThan(43_000);
    expect(ms).toBeLessThanOrEqual(45_000);
    expect((err as ApiRateLimitedError).retryAfterFromServer).toBe(true);
  });

  it("no Retry-After at all falls back to the client's default, and says so", async () => {
    // PAC-163 listed `Retry-After` in Access-Control-Expose-Headers, so every
    // deployment can read it, cross-origin ones (API_BASE_URL /
    // VITE_API_BASE_URL) included. What is left for the fallback to cover is a
    // server or proxy that sent no usable value at all.
    fetchMock.mockResolvedValueOnce(rateLimited());
    const err = await requestApi("GET", "/book/intro/slots").catch((e) => e);
    expect(err).toBeInstanceOf(ApiRateLimitedError);
    expect((err as ApiRateLimitedError).retryAfterMs).toBe(RATE_LIMIT_DEFAULT_RETRY_MS);
    expect((err as ApiRateLimitedError).retryAfterFromServer).toBe(false);
  });

  it("classifies as its own kind, after too-large and before lost", async () => {
    fetchMock.mockResolvedValueOnce(rateLimited("30"));
    const err = await requestApi("GET", "/book/intro/slots").catch((e) => e);
    expect(classifyApiFailure(err)).toBe("rate-limited");
    // By status alone, as 413 is: a 429 raised anywhere else maps the same.
    expect(classifyApiFailure(new ApiHttpError(429, { error: "rate limit exceeded" }))).toBe("rate-limited");
    expect(rateLimitRetryAfterMs(new ApiHttpError(429))).toBe(RATE_LIMIT_DEFAULT_RETRY_MS);
    expect(rateLimitRetryAfterMs(new ApiHttpError(409))).toBeNull();
  });

  it("words the wait per effect and never shows the server's string", async () => {
    fetchMock.mockResolvedValueOnce(rateLimited("30"));
    const err = await requestApi("POST", "/book/intro", { name: "A" }).catch((e) => e);
    expect(apiFailureMessage(err, "booking")).toEqual({ message: API_MESSAGES.rateLimitedBooking, retry: false });
    expect(apiFailureMessage(err, "read")).toEqual({ message: API_MESSAGES.rateLimitedRead, retry: true });
    expect(apiFailureMessage(err, "write")).toEqual({ message: API_MESSAGES.rateLimitedWrite, retry: false });
    for (const effect of ["read", "write", "booking"] as const) {
      const { message } = apiFailureMessage(err, effect);
      expect(message).not.toMatch(/rate limit|429|too many|throttl/i);
      // Never the not-found / no-longer-available shape.
      expect(message).not.toMatch(/doesn't exist|no longer|not found|unavailable/i);
    }
  });

  it.each([
    ["absent", undefined, null],
    ["empty", "   ", null],
    ["a word", "soon", null],
    ["negative", "-5", null],
    ["fractional", "30.5", null],
    ["absurdly long", "86400", null],
    ["an HTTP-date beyond the ceiling", new Date(Date.now() + 86_400_000).toUTCString(), null],
    ["zero", "0", 0],
    ["an HTTP-date already past", new Date(Date.now() - 60_000).toUTCString(), 0],
    ["the booking limiter's ceiling", "600", 600_000],
  ])("parses %s", (_name, raw, expected) => {
    expect(parseRetryAfterMs(raw as string | undefined)).toBe(expected);
  });
});
