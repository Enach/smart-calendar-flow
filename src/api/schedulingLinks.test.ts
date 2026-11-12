import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { isApiHttpError, isApiUnreachableError } from "./client";
import { publicBookingDisplayUrl, publicBookingUrl, schedulingLinksApi, validateLinkForm } from "./schedulingLinks";
import type { LinkUsageType, Weekday } from "./types";

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

  it("invites only new co-hosts when a link is saved, never existing ones", async () => {
    const posted: string[] = [];
    fetchMock.mockImplementation(async (input, init) => {
      const path = requestPath(input);
      if (path === "/api/scheduling-links/l1/hosts") {
        posted.push(JSON.parse(String(init?.body)).email);
        return jsonResponse({}, 201);
      }
      if (path === "/api/scheduling-links/l1" && init?.method === "PATCH") return jsonResponse({});
      if (path === "/api/scheduling-links/l1") {
        return jsonResponse({
          ...BACKEND_LINK,
          hosts: [
            { email: "owner@co.com", is_owner: true, status: "accepted" },
            { email: "Accepted@co.com", status: "accepted" },
          ],
        });
      }
      return jsonResponse({ id: "u1", email: "owner@co.com" });
    });

    await schedulingLinksApi.updateLink("l1", {
      title: "Renamed",
      co_host_emails: ["accepted@co.com", "new@co.com"],
    });
    expect(posted).toEqual(["new@co.com"]);
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
  });

  // Inverted (PAC-83 spec §2.5).
  it("rejects with ApiUnreachableError when the backend is unreachable (no preview links)", async () => {
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));
    await expect(schedulingLinksApi.listLinks()).rejects.toSatisfy(isApiUnreachableError);
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

  it("displays exactly the URL that is copied, minus the scheme", () => {
    expect(publicBookingDisplayUrl("intro-chat", "https://app.test/")).toBe("app.test/book/intro-chat");
    expect(publicBookingDisplayUrl("intro-chat", "http://localhost:8080")).toBe("localhost:8080/book/intro-chat");
    expect(`https://${publicBookingDisplayUrl("x", "https://staging.example.com")}`).toBe(
      publicBookingUrl("x", "https://staging.example.com"),
    );
  });
});

describe("strict backend validation alignment (422)", () => {
  const base = {
    title: "Intro",
    slug: "",
    durations: [30],
    days: ["mon"] as Weekday[],
    window_start: "09:00",
    window_end: "17:00",
    buffer_before: 0,
    buffer_after: 0,
    min_notice_minutes: 0,
    usage_type: "reusable" as LinkUsageType,
    max_uses: undefined as number | undefined,
    co_host_emails: [] as string[],
  };

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterAll(() => vi.unstubAllGlobals());

  const cases: Array<[string, Partial<typeof base>]> = [
    ["empty durations", { durations: [] }],
    ["empty days", { days: [] as Weekday[] }],
    ["inverted window", { window_start: "18:00", window_end: "09:00" }],
    ["negative buffer_before", { buffer_before: -5 }],
    ["negative buffer_after", { buffer_after: -5 }],
    ["negative min_notice_minutes", { min_notice_minutes: -1 }],
    ["invalid usage_type", { usage_type: "weird" as never }],
    ["recurring without max_uses", { usage_type: "recurring" as LinkUsageType, max_uses: 0 }],
  ];

  for (const [name, patch] of cases) {
    it(`rejects ${name} before hitting the network`, async () => {
      expect(() => schedulingLinksApi.createLink({ ...base, ...patch })).toThrow();
      expect(fetchMock).not.toHaveBeenCalled();
    });
  }

  it("omits slug on create so the backend generates it", async () => {
    let body: Record<string, unknown> = {};
    fetchMock.mockImplementation(async (input, init) => {
      const path = requestPath(input);
      if (path === "/api/scheduling-links/" && init?.method === "POST") {
        body = JSON.parse(String(init?.body));
        return jsonResponse({ ...BACKEND_LINK, id: "new" });
      }
      if (path === "/api/scheduling-links/new") return jsonResponse({ ...BACKEND_LINK, id: "new" });
      return jsonResponse({ id: "u1", email: "owner@co.com" });
    });

    await schedulingLinksApi.createLink(base);
    expect(body.slug).toBeUndefined();
    expect(body.duration_options).toEqual([30]);
    expect(body.days_of_week).toEqual([1]);
  });

  it("surfaces a backend 422 instead of falling back to mocks", async () => {
    fetchMock.mockImplementation(async () =>
      jsonResponse({ detail: "window_start must be before window_end" }, 422),
    );
    await expect(schedulingLinksApi.createLink(base)).rejects.toSatisfy((e: unknown) => isApiHttpError(e));
  });

  it("keeps the created server link usable when the list refetch fails", async () => {
    const created = { ...BACKEND_LINK, id: "new", slug: "server-slug" };
    fetchMock.mockImplementation(async (input, init) => {
      const path = requestPath(input);
      if (path === "/api/scheduling-links/" && init?.method === "POST") return jsonResponse(created);
      if (path === "/api/scheduling-links/new") return jsonResponse(created);
      if (path === "/api/auth/me") return jsonResponse({ id: "u1", email: "owner@co.com" });
      return jsonResponse({ id: "u1", email: "owner@co.com" });
    });

    const saved = await schedulingLinksApi.createLink(base);
    // The server-generated slug is what the UI renders — never a fabricated one.
    expect(saved.slug).toBe("server-slug");
    expect(saved.id).toBe("new");

    // The subsequent list refetch fails with an HTTP error: it must stay an
    // error (no demo links) while the created link above remains valid data.
    fetchMock.mockImplementation(async () => jsonResponse({ detail: "boom" }, 500));
    await expect(schedulingLinksApi.listLinks()).rejects.toSatisfy((e: unknown) => isApiHttpError(e));
  });
});


describe("link bookings", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterAll(() => vi.unstubAllGlobals());

  it("maps GET /scheduling-links/:id/bookings", async () => {
    fetchMock.mockImplementation(async (input) => {
      expect(requestPath(input)).toBe("/api/scheduling-links/l1/bookings");
      // The server's SchedulingLinkBookingRecord, exactly (contract booking.yaml).
      return jsonResponse([
        {
          id: "b1",
          link_id: "l1",
          booker_name: "Zoe",
          booker_email: "zoe@co.com",
          start_time: "2026-02-02T09:00:00Z",
          end_time: "2026-02-02T09:30:00Z",
          status: "confirmed",
          notes: "",
          created_at: "2026-01-30T12:00:00Z",
        },
      ]);
    });
    const res = await schedulingLinksApi.listBookings("l1");
    expect(res).toHaveLength(1);
    expect(res[0].start).toBe("2026-02-02T09:00:00Z");
    expect(res[0].end).toBe("2026-02-02T09:30:00Z");
    expect(res[0].duration_minutes).toBe(30);
    expect(res[0].booker_email).toBe("zoe@co.com");
  });

  it("accepts an object-wrapped bookings payload", async () => {
    fetchMock.mockImplementation(async () =>
      jsonResponse({ bookings: [{ id: "b2", start: "2026-02-02T09:00:00Z", end: "2026-02-02T10:00:00Z", booker_name: "A", booker_email: "a@co.com" }] }),
    );
    const res = await schedulingLinksApi.listBookings("l1");
    expect(res[0].duration_minutes).toBe(60);
  });
});

describe("public booking contract", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterAll(() => vi.unstubAllGlobals());

  it("maps GET /book/:slug metadata including duration_options and coverage", async () => {
    fetchMock.mockImplementation(async (input) => {
      expect(requestPath(input)).toBe("/api/book/intro");
      return jsonResponse({
        slug: "intro",
        title: "Intro",
        duration_options: [15, 45],
        hosts: [{ email: "owner@co.com", name: "Owner" }],
        min_notice_minutes: 120,
        usage_type: "single_use",
        coverage: { total: 2, checked: 1 },
      });
    });
    const info = await schedulingLinksApi.getPublicLink("intro");
    expect(info).toMatchObject({
      slug: "intro",
      durations: [15, 45],
      min_notice_minutes: 120,
      usage_type: "single_use",
      coverage: { total: 2, checked: 1 },
    });
    expect(info.hosts[0].email).toBe("owner@co.com");
  });

  it("sends date and duration query params and accepts a bare slot array", async () => {
    let url = "";
    fetchMock.mockImplementation(async (input) => {
      url = String(input);
      return jsonResponse([{ start: "2026-03-02T09:00:00Z", end: "2026-03-02T09:30:00Z" }]);
    });
    const res = await schedulingLinksApi.getPublicSlots("intro", { date: "2026-03-02", duration: 30 });
    expect(url).toContain("/api/book/intro/slots");
    expect(url).toContain("date=2026-03-02");
    expect(url).toContain("duration=30");
    expect(res.slots).toHaveLength(1);
    expect(res.available_dates).toEqual([]);
  });

  it("accepts the envelope form of the slots response", async () => {
    fetchMock.mockImplementation(async () =>
      jsonResponse({ slots: [{ start: "2026-03-02T09:00:00Z", end: "2026-03-02T09:30:00Z" }], available_dates: ["2026-03-02"] }),
    );
    const res = await schedulingLinksApi.getPublicSlots("intro", { date: "2026-03-02", duration: 30 });
    expect(res.available_dates).toEqual(["2026-03-02"]);
    expect(res.slots).toHaveLength(1);
  });

  // PAC-88 (contract section 3.1): the "no date, no request" shortcut is gone;
  // a request without a date is the overview, which needs from and to, so a
  // call with neither never reaches the server (no whole-horizon read).
  it("never sends a listing without a date or from/to", async () => {
    await expect(schedulingLinksApi.getPublicSlots("intro", {})).rejects.toThrow(/date, or from and to/);
    await expect(schedulingLinksApi.getPublicSlots("intro", { from: "2027-03-01" })).rejects.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  // PAC-88 (contract section 3.1): the mapper keeps the link's zone and horizon.
  it("keeps time_zone and booking_horizon_days from GET /book/:slug", async () => {
    fetchMock.mockImplementation(async () =>
      jsonResponse({ slug: "intro", title: "Intro", durations: [30], hosts: [], time_zone: "Europe/Paris", booking_horizon_days: 90 }),
    );
    const info = await schedulingLinksApi.getPublicLink("intro");
    expect(info.time_zone).toBe("Europe/Paris");
    expect(info.booking_horizon_days).toBe(90);
  });

  it("PAC-88: sends display_time_zone with the overview's from/to, never with date, and returns the four PAC-88 keys", async () => {
    const urls: URL[] = [];
    fetchMock.mockImplementation(async (input) => {
      urls.push(new URL(String(input)));
      return jsonResponse({
        slots: [],
        available_dates: ["2027-03-01"],
        time_zone: "Europe/Paris",
        display_time_zone: "Asia/Tokyo",
        range_from: "2027-02-28",
        range_to: "2027-04-10",
      });
    });
    const res = await schedulingLinksApi.getPublicSlots("intro", { from: "2027-02-28", to: "2027-04-10", duration: 30, displayTimeZone: "Asia/Tokyo" });
    expect(Object.fromEntries(urls[0]!.searchParams)).toEqual({
      display_time_zone: "Asia/Tokyo",
      from: "2027-02-28",
      to: "2027-04-10",
      duration: "30",
    });
    expect(res).toEqual({
      slots: [],
      available_dates: ["2027-03-01"],
      time_zone: "Europe/Paris",
      display_time_zone: "Asia/Tokyo",
      range_from: "2027-02-28",
      range_to: "2027-04-10",
    });

    await schedulingLinksApi.getPublicSlots("intro", { date: "2027-03-01", from: "2027-02-28", to: "2027-04-10", displayTimeZone: "Europe/Paris" });
    expect(Object.fromEntries(urls[1]!.searchParams)).toEqual({ display_time_zone: "Europe/Paris", date: "2027-03-01" });
  });

  it("PAC-88: an older server's answer has no PAC-88 keys, and the client says so rather than inventing them", async () => {
    fetchMock.mockImplementation(async () => jsonResponse({ slots: [], available_dates: ["2027-03-01"] }));
    const res = await schedulingLinksApi.getPublicSlots("intro", { from: "2027-02-28", to: "2027-04-10", displayTimeZone: "Asia/Tokyo" });
    expect(res.display_time_zone).toBeUndefined();
    expect(res.time_zone).toBeUndefined();
    expect(res.available_dates).toEqual(["2027-03-01"]);
  });

  it("posts the frozen booking body names", async () => {
    let body: Record<string, unknown> = {};
    fetchMock.mockImplementation(async (input, init) => {
      expect(requestPath(input)).toBe("/api/book/intro");
      body = JSON.parse(String(init?.body));
      return jsonResponse({
        id: "b1",
        link_slug: "intro",
        title: "Intro",
        start: "2026-03-02T09:00:00Z",
        end: "2026-03-02T09:30:00Z",
        booker_name: "Zoe",
        booker_email: "zoe@co.com",
      });
    });
    const conf = await schedulingLinksApi.bookSlot("intro", {
      start: "2026-03-02T09:00:00Z",
      duration_minutes: 30,
      name: "Zoe",
      email: "zoe@co.com",
      notes: "hi",
    });
    expect(Object.keys(body).sort()).toEqual(["duration", "email", "end", "name", "notes", "start"]);
    expect(body).toMatchObject({ name: "Zoe", email: "zoe@co.com", duration: 30, end: "2026-03-02T09:30:00.000Z" });
    expect(conf.duration_minutes).toBe(30);
  });

  it.each([404, 409, 410, 422, 400])("surfaces HTTP %i instead of falling back to mocks", async (status) => {
    fetchMock.mockImplementation(async () => jsonResponse({ error: `boom ${status}` }, status));
    const err = await schedulingLinksApi
      .bookSlot("intro", { start: "2026-03-02T09:00:00Z", duration_minutes: 30, name: "Z", email: "z@co.com" })
      .catch((e) => e);
    expect(isApiHttpError(err)).toBe(true);
    expect((err as { status: number }).status).toBe(status);
  });

  it("never fakes a booking confirmation when the backend is unreachable, and sends it once", async () => {
    fetchMock.mockImplementation(async () => {
      throw new TypeError("Failed to fetch");
    });
    const input = { start: "2030-03-04T09:00:00Z", duration_minutes: 30, name: "Z", email: "z@co.com" };
    const err = await schedulingLinksApi.bookSlot("intro-chat", input).catch((e) => e);
    expect(isApiUnreachableError(err)).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // A leftover flag of the removed preview mode changes nothing (AC-9, AC-15b).
    sessionStorage.setItem("clockwise:mock-mode", "1");
    const again = await schedulingLinksApi.bookSlot("intro-chat", input).catch((e) => e);
    expect(isApiUnreachableError(again)).toBe(true);
    sessionStorage.removeItem("clockwise:mock-mode");
  });

  it("books against demo data in an explicit demo session", async () => {
    sessionStorage.setItem("paceday:demo", "1");
    const conf = await schedulingLinksApi.bookSlot("intro-chat", {
      start: "2030-03-04T09:00:00Z",
      duration_minutes: 30,
      name: "Demo",
      email: "demo@co.com",
    });
    expect(conf.link_slug).toBe("intro-chat");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  // Inverted (PAC-83 spec §2.5, AC-12): a demo seed slug gets no demo link when the server is unreachable.
  it("never shows the demo link for a demo seed slug when the backend is unreachable", async () => {
    fetchMock.mockImplementation(async () => {
      throw new TypeError("Failed to fetch");
    });
    await expect(schedulingLinksApi.getPublicLink("intro-chat")).rejects.toSatisfy(isApiUnreachableError);
    await expect(schedulingLinksApi.getPublicSlots("intro-chat", { date: "2030-03-04", duration: 30 })).rejects.toSatisfy(isApiUnreachableError);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

// PAC-72 revision 2: the link's booking horizon (D-1) and refusal message
// (D-2/D-5) on the owner's link reads and writes.
describe("PAC-72 booking horizon and refusal message", () => {
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

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterAll(() => vi.unstubAllGlobals());

  it("validates the horizon against the contract's 1..365 and the refusal choice", () => {
    expect(validateLinkForm({ ...base, booking_horizon_days: 1 })).toBeNull();
    expect(validateLinkForm({ ...base, booking_horizon_days: 365, refusal_message: "specific" })).toBeNull();
    for (const bad of [0, 366, -3, 2.5, Number.NaN]) {
      expect(validateLinkForm({ ...base, booking_horizon_days: bad })).toMatch(/between 1 and 365 days/);
    }
    expect(validateLinkForm({ ...base, refusal_message: "loud" as never })).toMatch(/refused/i);
  });

  it("reads the settings and the zone, defaulting to 60 / generic when absent", async () => {
    fetchMock.mockImplementation(async (input) => {
      if (requestPath(input) === "/api/scheduling-links/") {
        return jsonResponse({
          owned: [{ ...BACKEND_LINK, booking_horizon_days: 14, refusal_message: "specific", time_zone: "Europe/Paris" }],
          shared: [{ ...BACKEND_LINK, id: "l2", owner_id: "u9", is_owner: false }],
        });
      }
      return jsonResponse({ id: "u1", email: "owner@co.com" });
    });
    const res = await schedulingLinksApi.listLinks();
    expect(res.owned[0]).toMatchObject({ booking_horizon_days: 14, refusal_message: "specific", time_zone: "Europe/Paris" });
    expect(res.shared[0]).toMatchObject({ booking_horizon_days: 60, refusal_message: "generic" });
  });

  it("sends the settings on create, and omits them when not chosen", async () => {
    const bodies: Array<Record<string, unknown>> = [];
    fetchMock.mockImplementation(async (input, init) => {
      const path = requestPath(input);
      if (path === "/api/scheduling-links/" && init?.method === "POST") {
        bodies.push(JSON.parse(String(init?.body)));
        return jsonResponse({ ...BACKEND_LINK, id: "new" });
      }
      if (path === "/api/scheduling-links/new") return jsonResponse({ ...BACKEND_LINK, id: "new" });
      return jsonResponse({ id: "u1", email: "owner@co.com" });
    });
    const create = { ...base, slug: "", co_host_emails: [] as string[] };
    await schedulingLinksApi.createLink({ ...create, booking_horizon_days: 90, refusal_message: "specific" });
    await schedulingLinksApi.createLink(create);
    expect(bodies[0]).toMatchObject({ booking_horizon_days: 90, refusal_message: "specific" });
    expect(bodies[1]).not.toHaveProperty("booking_horizon_days");
    expect(bodies[1]).not.toHaveProperty("refusal_message");
  });

  it("an edit of another field sends the stored settings back unchanged; an edit of them sends the new values", async () => {
    const patches: Array<Record<string, unknown>> = [];
    const stored = { ...BACKEND_LINK, booking_horizon_days: 21, refusal_message: "specific" as const };
    fetchMock.mockImplementation(async (input, init) => {
      if (init?.method === "PATCH") {
        patches.push(JSON.parse(String(init?.body)));
        return jsonResponse(stored);
      }
      if (requestPath(input) === "/api/scheduling-links/l1") return jsonResponse(stored);
      return jsonResponse({ id: "u1", email: "owner@co.com" });
    });
    await schedulingLinksApi.updateLink("l1", { title: "Renamed" });
    await schedulingLinksApi.updateLink("l1", { booking_horizon_days: 5, refusal_message: "generic" });
    expect(patches[0]).toMatchObject({ title: "Renamed", booking_horizon_days: 21, refusal_message: "specific" });
    expect(patches[1]).toMatchObject({ booking_horizon_days: 5, refusal_message: "generic" });
  });

  it("refuses an out-of-range horizon before the network", () => {
    expect(() =>
      schedulingLinksApi.createLink({ ...base, slug: "", co_host_emails: [], booking_horizon_days: 400 }),
    ).toThrow(/between 1 and 365 days/);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
