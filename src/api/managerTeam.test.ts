import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import { ApiHttpError, setMockMode } from "./client";
import {
  managerApi,
  managerKeys,
  normalizeAnalytics,
  normalizeGaps,
  validateCadencePatch,
  validateMemberInput,
} from "./manager";
import {
  teamKeys,
  teamsApi,
  validateAvailabilityQuery,
  validateTeamEmail,
  validateTeamName,
  validateZoneInput,
} from "./teams";

const fetchMock = vi.fn<typeof fetch>();

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function urlOf(call: number): URL {
  return new URL(String(fetchMock.mock.calls[call][0]));
}

function bodyOf(call: number): unknown {
  const raw = fetchMock.mock.calls[call][1]?.body;
  return raw ? JSON.parse(String(raw)) : undefined;
}

beforeEach(() => {
  setMockMode(false);
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  localStorage.clear();
});

afterAll(() => {
  vi.unstubAllGlobals();
});

describe("manager validation", () => {
  it("rejects an invalid email", () => {
    expect(validateMemberInput({ email: "nope", cadence: "weekly" })).toMatch(/valid email/i);
  });

  it("rejects an unknown cadence", () => {
    expect(validateMemberInput({ email: "a@b.com", cadence: "yearly" })).toMatch(/valid cadence/i);
  });

  it("requires custom cadence days in range", () => {
    expect(validateMemberInput({ email: "a@b.com", cadence: "custom" })).toMatch(/whole number/i);
    expect(validateMemberInput({ email: "a@b.com", cadence: "custom", custom_cadence_days: 0 })).toBeTruthy();
    expect(validateMemberInput({ email: "a@b.com", cadence: "custom", custom_cadence_days: 400 })).toBeTruthy();
    expect(validateMemberInput({ email: "a@b.com", cadence: "custom", custom_cadence_days: 14 })).toBeNull();
  });

  it("validates a cadence-only patch", () => {
    expect(validateCadencePatch("custom", 1.5)).toBeTruthy();
    expect(validateCadencePatch("monthly")).toBeNull();
  });
});

describe("manager response normalization", () => {
  it("maps gaps onto the UI shape with defaults", () => {
    expect(
      normalizeGaps({
        gaps: [
          { member_email: "sam@co.com", display_name: "Sam", cadence: "weekly", last_one_on_one_at: null, days_overdue: 4 },
          { member_email: "kim@co.com" },
        ],
      }),
    ).toEqual([
      { email: "sam@co.com", display_name: "Sam", cadence: "weekly", last_one_on_one: null, days_overdue: 4 },
      { email: "kim@co.com", display_name: "kim", cadence: "none", last_one_on_one: null, days_overdue: 0 },
    ]);
  });

  it("normalizes analytics members with flat week metrics", () => {
    const out = normalizeAnalytics(
      { members: [{ email: "sam@co.com", meeting_minutes: 300, focus_minutes: 120, is_paceday_user: true }] },
      "2026-05-04",
    );
    expect(out[0].weeks).toEqual([
      { week_start: "2026-05-04", meeting_minutes: 300, focus_minutes: 120, free_minutes: 0 },
    ]);
    expect(out[0].is_paceday_user).toBe(true);
  });

  it("prefers a nested weeks array when present", () => {
    const out = normalizeAnalytics(
      { members: [{ email: "a@b.com", weeks: [{ week_start: "2026-04-27", focus_minutes: 60 }] }] },
      "2026-05-04",
    );
    expect(out[0].weeks).toHaveLength(1);
    expect(out[0].weeks[0]).toEqual({
      week_start: "2026-04-27",
      meeting_minutes: 0,
      focus_minutes: 60,
      free_minutes: 0,
    });
  });

  it("returns an empty list when members are missing", () => {
    expect(normalizeAnalytics({}, "2026-05-04")).toEqual([]);
    expect(normalizeGaps(undefined)).toEqual([]);
  });
});

describe("manager request bodies", () => {
  it("posts cadence_custom_days when adding a member", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({}))
      .mockResolvedValueOnce(jsonResponse({ members: [{ email: "sam@co.com", cadence: "custom", cadence_custom_days: 10 }] }));
    await managerApi.remote.addMember({ email: "sam@co.com", cadence: "custom", custom_cadence_days: 10 });
    expect(urlOf(0).pathname).toBe("/api/manager/team/members");
    expect(bodyOf(0)).toMatchObject({ email: "sam@co.com", cadence: "custom", cadence_custom_days: 10 });
  });

  it("requests analytics for the selected week", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ members: [] }));
    await managerApi.remote.analytics("2026-05-04");
    const url = urlOf(0);
    expect(url.pathname).toBe("/api/manager/analytics");
    expect(url.searchParams.get("week")).toBe("2026-05-04");
  });

  it("uses only the server-returned prefill_url", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ prefill_url: "/app?title=1%3A1" }));
    await expect(managerApi.remote.schedulePrefillUrl("sam@co.com", "2026-05-06")).resolves.toBe("/app?title=1%3A1");
    expect(urlOf(0).pathname).toBe("/api/manager/team/members/sam%40co.com/schedule");
    expect(bodyOf(0)).toEqual({ suggested_date: "2026-05-06" });
  });

  it("surfaces a real HTTP error instead of mock data", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: "forbidden" }, 403));
    await expect(managerApi.remote.gaps()).rejects.toBeInstanceOf(ApiHttpError);
  });

  it("exposes stable query keys", () => {
    expect(managerKeys.analytics("2026-05-04")).toEqual(["manager", "analytics", "2026-05-04"]);
    expect(teamKeys.analytics("t1", "2026-05-04")).toEqual(["formal-team-analytics", "t1", "2026-05-04"]);
  });
});

describe("team validation", () => {
  it("requires a team name", () => {
    expect(validateTeamName("  ")).toMatch(/required/i);
    expect(validateTeamName("Platform")).toBeNull();
  });

  it("validates invite emails", () => {
    expect(validateTeamEmail("bad")).toMatch(/valid email/i);
    expect(validateTeamEmail("a@b.com")).toBeNull();
  });

  it("keeps the Monday=1 .. Sunday=7 weekday convention", () => {
    expect(validateZoneInput({ day_of_week: 0, start_min: 540, end_min: 600 })).toMatch(/Monday/);
    expect(validateZoneInput({ day_of_week: 8, start_min: 540, end_min: 600 })).toMatch(/Sunday/);
    expect(validateZoneInput({ day_of_week: 7, start_min: 540, end_min: 600 })).toBeNull();
    expect(validateZoneInput({ day_of_week: 1, start_min: 600, end_min: 540 })).toMatch(/after/i);
  });

  it("validates availability date and duration", () => {
    expect(validateAvailabilityQuery("05/04/2026", 30)).toMatch(/valid date/i);
    expect(validateAvailabilityQuery("2026-05-04", 7)).toBeTruthy();
    expect(validateAvailabilityQuery("2026-05-04", 30)).toBeNull();
  });
});

describe("team request bodies", () => {
  it("sends HH:MM times and dayOfWeek when creating a zone", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ id: "z1", dayOfWeek: 3, startTime: "09:00", endTime: "11:30", label: "Deep work" }),
    );
    await teamsApi.remote.addZone("t1", {
      day_of_week: 3,
      start_min: 540,
      end_min: 690,
      label: "Deep work",
    });
    expect(urlOf(0).pathname).toBe("/api/teams/t1/no-meeting-zones");
    expect(bodyOf(0)).toEqual({ dayOfWeek: 3, startTime: "09:00", endTime: "11:30", label: "Deep work" });
  });

  it("rejects an invalid zone before hitting the network", async () => {
    await expect(
      teamsApi.remote.addZone("t1", { day_of_week: 9, start_min: 540, end_min: 600, label: "x" }),
    ).rejects.toThrow(/Monday|Sunday/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("requests availability with date and duration query parameters", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ slots: [{ start: "2026-05-04T09:00:00Z", end: "2026-05-04T09:30:00Z", quality_score: 88 }] }))
      .mockResolvedValueOnce(jsonResponse({ team: { id: "t1", name: "Platform" }, members: [] }))
      .mockResolvedValueOnce(jsonResponse([]));
    const slots = await teamsApi.remote.findSlots("t1", "2026-05-04", 30);
    const url = urlOf(0);
    expect(url.pathname).toBe("/api/teams/t1/availability");
    expect(url.searchParams.get("date")).toBe("2026-05-04");
    expect(url.searchParams.get("duration")).toBe("30");
    expect(slots[0].score).toBe(88);
  });

  it("surfaces team HTTP errors rather than falling back", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: "conflict" }, 409));
    await expect(teamsApi.remote.createTeam("Platform")).rejects.toBeInstanceOf(ApiHttpError);
  });
});
