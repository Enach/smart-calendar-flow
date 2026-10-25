import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { api, ApiUnreachableError, isUsingMocks, requestApi, setMockMode, withFallback } from "./client";

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
// 12-hour calendar for a user who had chosen 24-hour.
describe("requests aborted because the page is being left", () => {
  beforeEach(() => {
    returnToPage();
    setMockMode(false);
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    returnToPage();
    setMockMode(false);
  });

  afterAll(() => {
    vi.unstubAllGlobals();
  });

  it("do not switch the session to preview data", async () => {
    fetchMock.mockImplementationOnce(async () => {
      leavePage();
      throw new TypeError("Failed to fetch");
    });
    await expect(withFallback(() => requestApi<string>("GET", "/settings"), () => "preview")).rejects.not.toBeInstanceOf(
      ApiUnreachableError,
    );
    expect(isUsingMocks()).toBe(false);
    expect(sessionStorage.getItem("clockwise:mock-mode")).not.toBe("1");
  });

  it("do not make the health probe report the backend offline", async () => {
    fetchMock.mockImplementationOnce(async () => {
      leavePage();
      throw new TypeError("Failed to fetch");
    });
    await expect(api.health()).rejects.toThrow();
    expect(isUsingMocks()).toBe(false);
  });

  it("still fall back to preview data when the backend is unreachable on a page that stays", async () => {
    leavePage();
    returnToPage(); // restored from the back/forward cache
    fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    const value = await withFallback(() => requestApi<string>("GET", "/settings"), () => "preview");
    expect(value).toBe("preview");
    expect(isUsingMocks()).toBe(true);
  });
});
