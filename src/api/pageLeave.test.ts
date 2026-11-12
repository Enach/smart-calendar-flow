import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { api, ApiRequestCancelledError, ApiUnreachableError, requestApi } from "./client";

const fetchMock = vi.fn<typeof fetch>();

function leavePage() {
  window.dispatchEvent(new Event("pagehide"));
}
function returnToPage() {
  window.dispatchEvent(new Event("pageshow"));
}

// NEW-e2e-pac55-ac10: leaving a page (a full navigation, /settings → /app)
// makes the browser abort its in-flight requests, and the rejection is
// delivered to the page being left, after "pagehide". That is not the backend
// being unreachable. Treating it as such switched the session to preview data
// (persisted in sessionStorage), so the next page showed demo settings — a
// 12-hour calendar for a user who had chosen 24-hour. PAC-83 removed preview
// data altogether; the cancellation is still told apart (AC-20).
describe("requests aborted because the page is being left", () => {
  beforeEach(() => {
    returnToPage();
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    returnToPage();
  });

  afterAll(() => {
    vi.unstubAllGlobals();
  });

  it("are reported as cancelled, never as the backend being unreachable", async () => {
    fetchMock.mockImplementationOnce(async () => {
      leavePage();
      throw new TypeError("Failed to fetch");
    });
    const err = await requestApi<string>("GET", "/settings").catch((e) => e);
    expect(err).toBeInstanceOf(ApiRequestCancelledError);
    expect(err).not.toBeInstanceOf(ApiUnreachableError);
    expect(sessionStorage.getItem("clockwise:mock-mode")).toBeNull();
  });

  it("do not make the health probe report the backend offline", async () => {
    fetchMock.mockImplementationOnce(async () => {
      leavePage();
      throw new TypeError("Failed to fetch");
    });
    await expect(api.health()).rejects.toBeInstanceOf(ApiRequestCancelledError);
  });

  // Inverted (spec §2.5): an unreachable backend on a page that stays is an
  // error — never preview data — and the next call still goes to the server.
  it("reject as unreachable on a page that stays, with no preview data and no tab-wide switch", async () => {
    leavePage();
    returnToPage(); // restored from the back/forward cache
    fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    await expect(requestApi<string>("GET", "/settings")).rejects.toBeInstanceOf(ApiUnreachableError);
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ ok: 1 }), { status: 200, headers: { "content-type": "application/json" } }));
    await expect(requestApi("GET", "/settings")).resolves.toEqual({ ok: 1 });
  });
});
