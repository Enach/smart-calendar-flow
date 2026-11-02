/**
 * PAC-83 AC-7 (and AC-3, AC-9, AC-13, AC-15b, AC-15d, AC-25 at the API layer):
 * no operation ever answers with invented data after a failure, and nothing
 * switches the tab into a "preview" state. The operation list is derived from
 * API_OPERATIONS and the modules' exports, never hand-kept.
 */
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import * as clientModule from "./client";
import * as schedulingLinksModule from "./schedulingLinks";
import * as teamsModule from "./teams";
import * as managerModule from "./manager";
import { ApiRequestCancelledError, ApiUnreachableError, CLIENT_REQUEST_BOUND_MS } from "./client";
import { API_OPERATIONS, NOT_OPERATIONS } from "./operations";
import { OPERATION_EFFECTS } from "./effects";
import { isDemoSession } from "./demoGate";
import type { Settings, MoveProposal, ParseResult } from "./types";

const TEAM = "11111111-1111-4111-8111-111111111111";
const SETTINGS = { work_start: "09:00", work_end: "18:00", llm_provider: "openai", llm_model: "gpt-4o-mini" } as Settings;
const PROPOSAL = { eventId: "evt-1", title: "Sync", currentStart: "2026-11-02T10:00:00Z", currentEnd: "2026-11-02T10:30:00Z", proposedStart: "2026-11-02T09:30:00Z", proposedEnd: "2026-11-02T10:00:00Z", reason: "x" } as unknown as MoveProposal;
const PARSE = { intent: "schedule_meeting", title: "Sync", suggested_slots: [{ start: "2026-11-02T09:00:00Z", end: "2026-11-02T09:30:00Z", score: 1, reasons: [] }] } as unknown as ParseResult;
const LINK = {
  title: "Intro", slug: "intro", durations: [30], days: ["mon" as const], window_start: "09:00", window_end: "17:00",
  buffer_before: 0, buffer_after: 0, min_notice_minutes: 0, usage_type: "reusable" as const, co_host_emails: [],
};

/**
 * Sample arguments for every registered operation. A missing sample or a
 * stale one fails the test. Each operation's effect lives in one place,
 * src/api/effects.ts, which the UI reads through effectOf().
 */
const OPERATION_SAMPLES: Record<string, { args: unknown[] }> = {
  "api.freebusy": { args: [{ emails: ["a@co.com"], start_time: "2026-11-02T00:00:00Z", end_time: "2026-11-03T00:00:00Z" }] },
  "api.authStatus": { args: [] },
  "api.integrationAvailability": { args: [] },
  "api.authDisconnect": { args: [] },
  "api.getSettings": { args: [] },
  "api.updateSettings": { args: [SETTINGS] },
  "api.getEvents": { args: ["2026-11-02T00:00:00Z", "2026-11-09T00:00:00Z"] },
  "api.runFocus": { args: ["2026-11-02"] },
  "api.getFocusBlocks": { args: ["2026-11-02"] },
  "api.clearFocusBlocks": { args: ["2026-11-02"] },
  "api.scheduleSuggest": { args: [{ duration_minutes: 30, attendees: [], range_start: "2026-11-02T00:00:00Z", range_end: "2026-11-03T00:00:00Z", title: "x" }] },
  "api.scheduleCreate": { args: [{ title: "x", start: "2026-11-02T09:00:00Z", end: "2026-11-02T09:30:00Z", attendees: [] }] },
  "api.compressionPreview": { args: [{ date: "2026-11-02" }] },
  "api.compressionApply": { args: [{ proposals: [PROPOSAL] }] },
  "api.nlpParse": { args: ["30 min with a@co.com"] },
  "api.nlpConfirm": { args: [PARSE, 0] },
  "api.getAudit": { args: [] },
  "api.listPersonalCalendars": { args: [] },
  "api.addPersonalCalendar": { args: [{ type: "webcal", label: "x", url: "https://x.test/a.ics" }] },
  "api.updatePersonalCalendar": { args: ["1", { enabled: false }] },
  "api.deletePersonalCalendar": { args: ["1"] },
  "api.syncPersonalCalendar": { args: ["1"] },
  "api.llmTest": { args: [SETTINGS] },
  "api.updateEvent": { args: ["e1", { title: "x" }] },
  "api.deleteEvent": { args: ["e1"] },
  "api.searchRooms": { args: ["hel"] },
  "api.suggestAttendees": { args: ["al"] },
  "api.addConference": { args: ["e1", { provider: "google_meet" }] },
  "api.removeConference": { args: ["e1"] },
  "api.conferenceProviders": { args: [] },
  "api.zoomDisconnect": { args: [] },
  "api.microsoftDisconnect": { args: [] },
  "schedulingLinksApi.listLinks": { args: [] },
  "schedulingLinksApi.listInvites": { args: [] },
  "schedulingLinksApi.acceptInvite": { args: ["l1"] },
  "schedulingLinksApi.declineInvite": { args: ["l1"] },
  "schedulingLinksApi.createLink": { args: [LINK] },
  "schedulingLinksApi.updateLink": { args: ["l1", { title: "x" }] },
  "schedulingLinksApi.deleteLink": { args: ["l1"] },
  "schedulingLinksApi.leaveLink": { args: ["l1"] },
  "schedulingLinksApi.listBookings": { args: ["l1"] },
  "schedulingLinksApi.getPublicLink": { args: ["intro-chat"] },
  "schedulingLinksApi.getPublicSlots": { args: ["intro-chat", { date: "2030-03-04", duration: 30 }] },
  "schedulingLinksApi.bookSlot": { args: ["intro-chat", { start: "2030-03-04T09:00:00Z", duration_minutes: 30, name: "Z", email: "z@co.com" }] },
  "teamInvitesApi.get": { args: ["tok"] },
  "teamInvitesApi.accept": { args: ["tok"] },
  "teams.list": { args: [] },
  "teams.get": { args: ["t1"] },
  "teams.createTeam": { args: ["Team"] },
  "teams.renameTeam": { args: ["t1", "Team 2"] },
  "teams.deleteTeam": { args: ["t1"] },
  "teams.inviteMember": { args: ["t1", "b@co.com"] },
  "teams.removeMember": { args: ["t1", "b@co.com"] },
  "teams.addZone": { args: ["t1", { day_of_week: 1, start_min: 540, end_min: 600, label: "x" }] },
  "teams.updateZone": { args: ["t1", "z1", { label: "y" }] },
  "teams.removeZone": { args: ["t1", "z1"] },
  "teams.findSlots": { args: ["t1", "2030-03-04", 30] },
  "teams.teamAnalytics": { args: ["t1"] },
  "manager.getProfile": { args: [] },
  "manager.setProfile": { args: [{ is_manager: true }] },
  "manager.listTeam": { args: [TEAM] },
  "manager.addMember": { args: [{ email: "b@co.com", cadence: "weekly" }, TEAM] },
  "manager.updateMember": { args: ["b@co.com", { cadence: "weekly" }, TEAM] },
  "manager.removeMember": { args: ["b@co.com", TEAM] },
  "manager.detect": { args: [TEAM] },
  "manager.confirmDetect": { args: [TEAM, ["b@co.com"]] },
  "manager.gaps": { args: [TEAM] },
  "manager.analytics": { args: ["2026-11-02", TEAM] },
  "manager.schedulePrefillUrl": { args: ["b@co.com", undefined, TEAM] },
  "standalone.fetchSsoStepupOptions": { args: [] },
  "standalone.fetchOrganizationAI": { args: [] },
  "standalone.patchOrganizationAI": { args: [{ provider: "openai", configurationVersion: 1 }] },
  "standalone.chooseOrganizationAIChoice": { args: [] },
  "standalone.confirmOrganizationAI": { args: [1] },
};

type Fn = (...args: unknown[]) => Promise<unknown>;

/** Every registered operation, as "<group>.<name>", from API_OPERATIONS itself. */
function registered(): Array<[string, Fn]> {
  const out: Array<[string, Fn]> = [];
  for (const [group, ops] of Object.entries(API_OPERATIONS)) {
    for (const [name, fn] of Object.entries(ops as Record<string, unknown>)) {
      if (typeof fn !== "function") continue;
      const key = `${group}.${name}`;
      if (NOT_OPERATIONS[key]) continue;
      out.push([key, fn as Fn]);
    }
  }
  return out;
}

const fetchMock = vi.fn<typeof fetch>();
const html = () => new Response("<!doctype html><html></html>", { status: 200, headers: { "content-type": "text/html" } });
const hanging = (_u: RequestInfo | URL, init?: RequestInit) =>
  new Promise<Response>((_, reject) => init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError"))));

describe("AC-7: the operation registry covers every request-making export", () => {
  it("has a sample (with its effect) for every registered operation, and no stale sample", () => {
    const keys = registered().map(([k]) => k).sort();
    expect(keys.filter((k) => !OPERATION_SAMPLES[k])).toEqual([]);
    expect(Object.keys(OPERATION_SAMPLES).filter((k) => !keys.includes(k))).toEqual([]);
  });

  it("has exactly one effect per registered operation in OPERATION_EFFECTS (the UI's source), and no stale one", () => {
    const keys = registered().map(([k]) => k).sort();
    expect(Object.keys(OPERATION_EFFECTS).sort()).toEqual(keys);
    // contract §3.3: POST reads are reads, booking create is the only booking.
    for (const k of ["api.freebusy", "api.scheduleSuggest", "api.compressionPreview", "api.nlpParse", "api.llmTest"]) {
      expect(OPERATION_EFFECTS[k as keyof typeof OPERATION_EFFECTS], k).toBe("read");
    }
    expect(Object.entries(OPERATION_EFFECTS).filter(([, e]) => e === "booking").map(([k]) => k)).toEqual(["schedulingLinksApi.bookSlot"]);
  });

  it("registers or explicitly excludes every exported function and api member of the API modules", () => {
    const registeredFns = new Set<unknown>(registered().map(([, fn]) => fn));
    const unlisted: string[] = [];
    const seen = new Set<unknown>();
    const modules = { client: clientModule, schedulingLinks: schedulingLinksModule, teams: teamsModule, manager: managerModule };
    const check = (key: string, fn: unknown) => {
      if (seen.has(fn)) return; // dedupe by identity (manager.ts re-exports api)
      seen.add(fn);
      if (!registeredFns.has(fn) && !NOT_OPERATIONS[key]) unlisted.push(key);
    };
    for (const [mod, ns] of Object.entries(modules)) {
      for (const [name, value] of Object.entries(ns)) {
        if (typeof value === "function" && !/^[A-Z]/.test(name)) check(`${mod}.${name}`, value);
        if (value && typeof value === "object" && (name === "api" || /Api$/.test(name))) {
          for (const [member, fn] of Object.entries(value)) {
            if (typeof fn === "function") check(`${name}.${member}`, fn);
            if (member === "remote" && fn && typeof fn === "object") {
              for (const [rm, rfn] of Object.entries(fn)) if (typeof rfn === "function") check(`${name}.remote.${rm}`, rfn);
            }
          }
        }
      }
    }
    expect(unlisted).toEqual([]);
  });
});

describe("AC-7: every operation rejects on failure — never mock data — and the next call reaches the server", () => {
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

  const cases = registered();

  it.each(cases)("%s: fetch rejection", async (key, fn) => {
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));
    await expect(fn(...OPERATION_SAMPLES[key].args)).rejects.toBeInstanceOf(ApiUnreachableError);
    const before = fetchMock.mock.calls.length;
    await fn(...OPERATION_SAMPLES[key].args).catch(() => undefined);
    expect(fetchMock.mock.calls.length).toBeGreaterThan(before);
  });

  it.each(cases)("%s: non-JSON 2xx", async (key, fn) => {
    fetchMock.mockImplementation(async () => html());
    const err = await fn(...OPERATION_SAMPLES[key].args).then(
      (v) => ({ resolved: v }),
      (e) => e,
    );
    expect(err).toBeInstanceOf(ApiUnreachableError);
  });

  it.each(cases)("%s: no answer within CLIENT_REQUEST_BOUND_MS", async (key, fn) => {
    vi.useFakeTimers();
    fetchMock.mockImplementation(hanging);
    let settled: unknown = "pending";
    const p = fn(...OPERATION_SAMPLES[key].args).then(
      (v) => (settled = { resolved: v }),
      (e) => (settled = e),
    );
    await vi.advanceTimersByTimeAsync(131_000);
    expect(settled).toBe("pending");
    await vi.advanceTimersByTimeAsync(CLIENT_REQUEST_BOUND_MS);
    await p;
    expect(settled).toBeInstanceOf(ApiUnreachableError);
    expect((settled as ApiUnreachableError).reason).toBe("timeout");
  });
});

describe("no tab-wide switch (AC-9, AC-13, AC-15b, AC-15d, AC-20, AC-25)", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterAll(() => {
    vi.unstubAllGlobals();
  });

  it("AC-9: a leftover preview-mode flag is cleared at start-up and calls go to the server", async () => {
    sessionStorage.setItem("clockwise:mock-mode", "1");
    vi.resetModules();
    const fresh = await import("./client");
    expect(sessionStorage.getItem("clockwise:mock-mode")).toBeNull();
    fetchMock.mockResolvedValueOnce(new Response("[]", { status: 200, headers: { "content-type": "application/json" } }));
    await expect(fresh.api.getEvents("2026-11-02T00:00:00Z", "2026-11-09T00:00:00Z")).resolves.toEqual([]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("AC-13: a manager call after another page's network failure goes to the server", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    await expect(clientModule.api.getEvents("2026-11-02T00:00:00Z", "2026-11-09T00:00:00Z")).rejects.toBeInstanceOf(ApiUnreachableError);
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ gaps: [] }), { status: 200, headers: { "content-type": "application/json" } }));
    await expect(managerModule.managerApi.remote.gaps(TEAM)).resolves.toEqual([]);
    expect(new URL(String(fetchMock.mock.calls[1][0]), window.location.origin).pathname).toBe("/api/manager/gaps");
  });

  it("AC-15b: with the old flag forced on and no demo session, failures never return demo data", async () => {
    sessionStorage.setItem("clockwise:mock-mode", "1");
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));
    for (const [key, fn] of registered()) {
      await expect(fn(...OPERATION_SAMPLES[key].args), key).rejects.toBeInstanceOf(ApiUnreachableError);
    }
    expect(isDemoSession()).toBe(false);
    sessionStorage.removeItem("clockwise:mock-mode");
  });

  it("AC-15d: in a production build a leftover demo-session flag is ignored — calls go to the server", async () => {
    vi.stubGlobal("__PACEDAY_DEMO_BUILD__", false);
    sessionStorage.setItem("paceday:demo", "1");
    expect(isDemoSession()).toBe(false);
    fetchMock.mockResolvedValueOnce(new Response("[]", { status: 200, headers: { "content-type": "application/json" } }));
    await expect(clientModule.api.getEvents("2026-11-02T00:00:00Z", "2026-11-09T00:00:00Z")).resolves.toEqual([]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("AC-20: a request rejected because the page is being left is cancelled, not lost, and not retried", async () => {
    fetchMock.mockImplementationOnce(async () => {
      window.dispatchEvent(new Event("pagehide"));
      throw new TypeError("Failed to fetch");
    });
    await expect(clientModule.api.getSettings()).rejects.toBeInstanceOf(ApiRequestCancelledError);
    window.dispatchEvent(new Event("pageshow"));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("AC-25: booking create is sent exactly once when the connection drops — nothing resends it later", async () => {
    vi.useFakeTimers();
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));
    await expect(
      schedulingLinksModule.schedulingLinksApi.bookSlot("intro", { start: "2030-03-04T09:00:00Z", duration_minutes: 30, name: "Z", email: "z@co.com" }),
    ).rejects.toBeInstanceOf(ApiUnreachableError);
    window.dispatchEvent(new Event("online"));
    window.dispatchEvent(new Event("focus"));
    await vi.advanceTimersByTimeAsync(10 * 60_000);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });
});
