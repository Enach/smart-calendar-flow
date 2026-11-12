/**
 * PAC-88 on the public booking page (web half of contract section 3): the
 * default zone, the switcher, displayed-zone days, transition days, the
 * confirmation, memory of the choice, a host zone change, a refused zone, and
 * link-zone mode against a server without PAC-88.
 *
 * The fake server groups offered starts by the contract's rule (section 2.1)
 * with the request's display_time_zone; the page itself never regroups.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import PublicBooking from "./PublicBooking";
import { ApiHttpError } from "@/api/client";
import { schedulingLinksApi, type PublicSlotsAnswer, type PublicSlotsParams } from "@/api/schedulingLinks";
import type { BookingConfirmation, PublicLinkInfo } from "@/api/types";
import { groupStartsByDay, wallTimeInZone } from "@/lib/timeZone";

const MINUS = "−";
const norm = (s: string | null | undefined) => (s ?? "").replace(/\s/g, " ").trim();

const PARIS_LINK: PublicLinkInfo = {
  slug: "intro",
  title: "Intro call",
  durations: [30, 60],
  hosts: [{ email: "host@co.com", name: "Host" }],
  min_notice_minutes: 0,
  usage_type: "reusable",
  coverage: { total: 1, checked: 1 },
  time_zone: "Europe/Paris",
  booking_horizon_days: 60,
};

/** The 15-minute grid of 30-minute starts in [from, to) of one link day (server rule). */
function gridStarts(day: string, from: [number, number], to: [number, number], zone: string): string[] {
  const out: string[] = [];
  for (let m = from[0] * 60 + from[1]; m + 30 <= to[0] * 60 + to[1]; m += 15) {
    const t = wallTimeInZone(day, Math.floor(m / 60), m % 60, zone);
    if (t) out.push(t.toISOString());
  }
  return [...new Set(out)];
}

/** A PAC-88 server's answer for `offered` starts (contract sections 2.1 and 2.5). */
function answer(offered: string[], linkZone: string, p: PublicSlotsParams, extraDates: string[] = []): PublicSlotsAnswer {
  const zone = p.displayTimeZone || linkZone;
  const byDay = groupStartsByDay(offered, zone);
  const base = { time_zone: linkZone, display_time_zone: zone, range_from: p.date ?? p.from, range_to: p.date ?? p.to };
  const minutes = p.duration ?? 30;
  if (p.date) {
    const slots = (byDay.get(p.date) ?? []).map((start) => ({ start, end: new Date(new Date(start).getTime() + minutes * 60_000).toISOString() }));
    return { ...base, available_dates: [], slots };
  }
  const days = [...new Set([...byDay.keys(), ...extraDates])].filter((k) => k >= p.from! && k <= p.to!).sort();
  return { ...base, slots: [], available_dates: days };
}

function serve(offered: string[], linkZone = "Europe/Paris", extraDates: string[] = []) {
  const calls: PublicSlotsParams[] = [];
  vi.spyOn(schedulingLinksApi, "getPublicSlots").mockImplementation(async (_slug, p) => {
    calls.push(p);
    return answer(offered, linkZone, p, extraDates);
  });
  return calls;
}

function linkIs(info: PublicLinkInfo) {
  return vi.spyOn(schedulingLinksApi, "getPublicLink").mockResolvedValue(info);
}

const realResolvedOptions = Intl.DateTimeFormat.prototype.resolvedOptions;
function browserIn(zone: string) {
  vi.spyOn(Intl.DateTimeFormat.prototype, "resolvedOptions").mockImplementation(function (this: Intl.DateTimeFormat) {
    return { ...realResolvedOptions.call(this), timeZone: zone };
  });
}

function at(iso: string) {
  vi.useFakeTimers({ toFake: ["Date"], now: new Date(iso) });
}

function renderPage(slug = "intro") {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[`/book/${slug}`]}>
        <Routes>
          <Route path="/book/:slug" element={<PublicBooking />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function dayCell(key: string): HTMLElement {
  const [y, m, d] = key.split("-").map(Number);
  const month = new Date(Date.UTC(y!, m! - 1, d!)).toLocaleString("en-US", { month: "long", timeZone: "UTC" });
  return within(screen.getByRole("grid")).getByRole("button", { name: new RegExp(`${month} ${d}(st|nd|rd|th)?,? ${y}`) });
}

async function pickDay(key: string) {
  const cell = await waitFor(() => {
    const c = dayCell(key);
    expect(c).not.toBeDisabled();
    return c;
  });
  fireEvent.click(cell);
}

/** The time buttons: their accessible names carry date, time, zone and offset. */
const timeButtons = () => screen.queryAllByRole("button", { name: /, \d{1,2}:\d{2}\s[AP]M, / });
const shownTimes = () => timeButtons().map((b) => norm(b.textContent));
const label = () => norm(screen.getByTestId("booking-tz-label").textContent);
const announcer = () => norm(screen.getByTestId("booking-tz-announcer").textContent);

function chooseZone(zone: string) {
  const box = screen.getByRole("combobox", { name: "Time zone" });
  fireEvent.change(box, { target: { value: zone } });
  fireEvent.click(screen.getByRole("option", { name: (n) => n.startsWith(`${zone} (`) }));
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  sessionStorage.clear();
  localStorage.clear();
});

describe("PAC-88 default zone", () => {
  it("AC-1: a Paris link in a Tokyo browser shows Europe/Paris with the day's offset and Paris times; every request sends display_time_zone", async () => {
    at("2027-01-04T10:00:00Z");
    browserIn("Asia/Tokyo");
    linkIs(PARIS_LINK);
    const calls = serve(gridStarts("2027-01-11", [9, 0], [17, 0], "Europe/Paris"));
    renderPage();
    await screen.findByRole("heading", { name: "Intro call" });
    expect(label()).toBe("Europe/Paris (UTC+01:00)");
    expect(screen.getByTestId("booking-tz-use-mine")).toHaveTextContent("Use my time zone (Asia/Tokyo)");
    await pickDay("2027-01-11");
    await waitFor(() => expect(timeButtons()).toHaveLength(31));
    expect(shownTimes()[0]).toBe("9:00 AM");
    expect(shownTimes().at(-1)).toBe("4:30 PM");
    expect(calls.length).toBeGreaterThanOrEqual(2);
    for (const c of calls) {
      expect(c.displayTimeZone).toBe("Europe/Paris");
      expect(!!c.date !== !!(c.from && c.to)).toBe(true);
    }
    // AC-27: nothing announced on load.
    expect(announcer()).toBe("");
  });

  it("AC-3: an owner without a zone shows UTC, whatever the browser (and a server before PAC-72 states none)", async () => {
    at("2027-01-04T10:00:00Z");
    browserIn("America/New_York");
    linkIs({ ...PARIS_LINK, time_zone: "UTC" });
    serve(gridStarts("2027-01-11", [9, 0], [10, 0], "UTC"), "UTC");
    const { unmount } = renderPage();
    await screen.findByRole("heading", { name: "Intro call" });
    expect(label()).toBe("UTC (UTC+00:00)");
    await pickDay("2027-01-11");
    await waitFor(() => expect(shownTimes()[0]).toBe("9:00 AM"));
    unmount();

    linkIs({ ...PARIS_LINK, time_zone: undefined });
    renderPage();
    await screen.findByRole("heading", { name: "Intro call" });
    expect(label()).toBe("UTC (UTC+00:00)");
  });

  it("AC-4: a link-info 500 shows the PAC-83 error with retry, no time and no zone label", async () => {
    vi.spyOn(schedulingLinksApi, "getPublicLink").mockRejectedValue(new ApiHttpError(500, { error: "internal error" }));
    const slots = vi.spyOn(schedulingLinksApi, "getPublicSlots");
    renderPage();
    expect(await screen.findByRole("heading", { name: /couldn't load this link/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /try again/i })).toBeInTheDocument();
    expect(screen.queryByTestId("booking-tz-label")).not.toBeInTheDocument();
    expect(timeButtons()).toHaveLength(0);
    expect(slots).not.toHaveBeenCalled();
  });

  it("AC-5: a link zone the browser cannot format is shown as UTC, and the switcher stays available", async () => {
    at("2027-01-04T10:00:00Z");
    linkIs({ ...PARIS_LINK, time_zone: "Mars/Olympus_Mons" });
    const calls = serve(gridStarts("2027-01-11", [9, 0], [10, 0], "UTC"), "Mars/Olympus_Mons");
    renderPage();
    await screen.findByRole("heading", { name: "Intro call" });
    expect(label()).toBe("UTC (UTC+00:00)");
    await pickDay("2027-01-11");
    await waitFor(() => expect(shownTimes()[0]).toBe("9:00 AM"));
    expect(calls.every((c) => c.displayTimeZone === "UTC")).toBe(true);
    expect(screen.getByRole("combobox", { name: "Time zone" })).not.toHaveAttribute("aria-disabled");
  });

  it("AC-33: the demo source shows the demo link's zone label like a real link", async () => {
    sessionStorage.setItem("paceday:demo", "1");
    renderPage("intro-chat");
    await screen.findByRole("heading", { name: "Intro chat" });
    expect(label()).toMatch(/^Europe\/Paris \(UTC\+0[12]:00\)$/);
  });
});

describe("PAC-88 switcher on the page", () => {
  it("AC-7: 'Use my time zone' shows every time in the browser's zone and announces it; absent when the browser is in the link's zone", async () => {
    at("2027-01-04T10:00:00Z");
    browserIn("America/New_York");
    linkIs(PARIS_LINK);
    const calls = serve(gridStarts("2027-01-11", [9, 0], [10, 0], "Europe/Paris"));
    const { unmount } = renderPage();
    await screen.findByRole("heading", { name: "Intro call" });
    fireEvent.click(screen.getByTestId("booking-tz-use-mine"));
    expect(label()).toBe(`America/New_York (UTC${MINUS}05:00)`);
    expect(announcer()).toBe(`Times are now shown in America/New_York, UTC${MINUS}05:00.`);
    expect(screen.queryByTestId("booking-tz-use-mine")).not.toBeInTheDocument();
    await pickDay("2027-01-11");
    await waitFor(() => expect(shownTimes()).toEqual(["3:00 AM", "3:15 AM", "3:30 AM"]));
    expect(calls.at(-1)!.displayTimeZone).toBe("America/New_York");
    unmount();

    vi.restoreAllMocks();
    browserIn("Europe/Paris");
    linkIs(PARIS_LINK);
    serve([]);
    renderPage();
    await screen.findByRole("heading", { name: "Intro call" });
    expect(screen.queryByTestId("booking-tz-use-mine")).not.toBeInTheDocument();
  });

  it("AC-8: after switching to Asia/Tokyo, one action returns to the link's zone", async () => {
    at("2027-01-04T10:00:00Z");
    linkIs(PARIS_LINK);
    serve([]);
    renderPage();
    await screen.findByRole("heading", { name: "Intro call" });
    chooseZone("Asia/Tokyo");
    expect(label()).toBe("Asia/Tokyo (UTC+09:00)");
    fireEvent.click(screen.getByTestId("booking-tz-back-to-host"));
    expect(label()).toBe("Europe/Paris (UTC+01:00)");
    expect(screen.queryByTestId("booking-tz-back-to-host")).not.toBeInTheDocument();
  });

  it("AC-9 / AC-24: booking after a switch sends the offered start string and the same body; the 409 is the same", async () => {
    at("2027-01-04T10:00:00Z");
    linkIs(PARIS_LINK);
    serve(["2027-01-11T08:00:00Z"]);
    const book = vi
      .spyOn(schedulingLinksApi, "bookSlot")
      .mockRejectedValue(new ApiHttpError(409, { error: "slot is no longer available" }));
    renderPage();
    await screen.findByRole("heading", { name: "Intro call" });

    async function bookFirstTime() {
      fireEvent.click((await waitFor(() => { const b = timeButtons(); expect(b.length).toBe(1); return b; }))[0]!);
      fireEvent.change(screen.getByLabelText("Name", { exact: true }), { target: { value: "Booker" } });
      fireEvent.change(screen.getByLabelText("Email", { exact: true }), { target: { value: "booker@co.com" } });
      fireEvent.click(screen.getByRole("button", { name: /confirm booking/i }));
      return (await screen.findByRole("alert")).textContent;
    }

    await pickDay("2027-01-11");
    const firstRefusal = await bookFirstTime();
    chooseZone("Asia/Tokyo");
    // The selected day is still selectable in Tokyo: it stays selected (AC-14).
    await waitFor(() => expect(shownTimes()).toEqual(["5:00 PM"]));
    const secondRefusal = await bookFirstTime();

    expect(book).toHaveBeenCalledTimes(2);
    expect(book.mock.calls[0]).toEqual(book.mock.calls[1]);
    expect(book.mock.calls[0]![1].start).toBe("2027-01-11T08:00:00Z");
    expect(Object.keys(book.mock.calls[0]![1]).sort()).toEqual(["duration_minutes", "email", "name", "notes", "start"]);
    expect(secondRefusal).toBe(firstRefusal);
  });

  it("AC-27: time buttons are named with date, time, zone and offset", async () => {
    at("2027-01-04T10:00:00Z");
    linkIs(PARIS_LINK);
    serve(["2027-01-11T08:00:00Z"]);
    renderPage();
    await screen.findByRole("heading", { name: "Intro call" });
    chooseZone("Asia/Tokyo");
    await pickDay("2027-01-11");
    const [btn] = await waitFor(() => { const b = timeButtons(); expect(b).toHaveLength(1); return b; });
    expect(norm(btn!.getAttribute("aria-label"))).toBe("Monday, January 11, 2027, 5:00 PM, Asia/Tokyo UTC+09:00");
    expect(btn!.className).toContain("min-h-[44px]");
    const region = screen.getByTestId("booking-tz-announcer");
    expect(region).toHaveAttribute("role", "status");
    expect(region).toHaveAttribute("aria-live", "polite");
  });
});

describe("PAC-88 days of the displayed zone", () => {
  it("AC-10: a Monday-only Paris link shown in Pacific/Auckland lists Monday 9:00-11:45 PM and Tuesday 12:00-4:30 AM, no other day", async () => {
    at("2027-01-04T00:00:00Z");
    linkIs({ ...PARIS_LINK, durations: [30] });
    serve(gridStarts("2027-01-11", [9, 0], [17, 0], "Europe/Paris"));
    renderPage();
    await screen.findByRole("heading", { name: "Intro call" });
    chooseZone("Pacific/Auckland");
    await pickDay("2027-01-11");
    await waitFor(() => expect(timeButtons()).toHaveLength(12));
    expect(shownTimes()[0]).toBe("9:00 PM");
    expect(shownTimes().at(-1)).toBe("11:45 PM");
    await pickDay("2027-01-12");
    await waitFor(() => expect(timeButtons()).toHaveLength(19));
    expect(shownTimes()[0]).toBe("12:00 AM");
    expect(shownTimes().at(-1)).toBe("4:30 AM");
    for (const other of ["2027-01-10", "2027-01-13", "2027-01-18", "2027-01-19"]) expect(dayCell(other)).toBeDisabled();
  });

  it("AC-12 / AC-29: a Tokyo visitor at Paris's Tuesday 16:05 reaches 16:15 and 16:30 Paris under Wednesday; days before Tokyo's today are not selectable", async () => {
    at("2027-01-12T15:05:00Z");
    browserIn("Asia/Tokyo");
    linkIs(PARIS_LINK);
    // Paris Tuesday 09:00-17:00, notice 0: only 16:15 and 16:30 are still offered today.
    const offered = ["2027-01-12T15:15:00Z", "2027-01-12T15:30:00Z"];
    // The fake server also lists 2027-01-12 in Tokyo: the page must still refuse a day before today.
    const calls = serve(offered, "Europe/Paris", ["2027-01-12"]);
    renderPage();
    await screen.findByRole("heading", { name: "Intro call" });
    fireEvent.click(screen.getByTestId("booking-tz-use-mine"));
    await pickDay("2027-01-13");
    await waitFor(() => expect(shownTimes()).toEqual(["12:15 AM", "12:30 AM"]));
    expect(dayCell("2027-01-12")).toBeDisabled();
    expect(calls.at(-1)).toMatchObject({ date: "2027-01-13", displayTimeZone: "Asia/Tokyo" });
  });

  it("AC-13: an overview with no date leaves no day selectable (never 'every future day')", async () => {
    at("2027-01-04T10:00:00Z");
    linkIs(PARIS_LINK);
    const calls = serve([]);
    renderPage();
    await screen.findByRole("heading", { name: "Intro call" });
    await waitFor(() => expect(calls.length).toBe(1));
    await waitFor(() => {
      const enabled = within(screen.getByRole("grid"))
        .getAllByRole("button")
        .filter((b) => !b.hasAttribute("disabled"));
      expect(enabled).toHaveLength(0);
    });
  });

  it("AC-14: a switch keeps a still-selectable day (times re-listed), and drops one that is not, announcing 'pick a date'", async () => {
    at("2027-01-04T10:00:00Z");
    linkIs(PARIS_LINK);
    // Paris Monday 22:00-23:30: Monday in Auckland? no (Tuesday); in New York, yes.
    serve(gridStarts("2027-01-11", [22, 0], [23, 30], "Europe/Paris"));
    renderPage();
    await screen.findByRole("heading", { name: "Intro call" });
    await pickDay("2027-01-11");
    await waitFor(() => expect(shownTimes()[0]).toBe("10:00 PM"));
    chooseZone("America/New_York");
    await waitFor(() => expect(shownTimes()[0]).toBe("4:00 PM"));
    expect(screen.getByText("Monday, January 11, 2027")).toBeInTheDocument();

    chooseZone("Pacific/Auckland");
    await waitFor(() => expect(screen.getByText("Select a date to see available times.")).toBeInTheDocument());
    expect(timeButtons()).toHaveLength(0);
    expect(announcer()).toBe("Times are now shown in Pacific/Auckland, UTC+13:00. Monday, January 11, 2027 has no times in Pacific/Auckland. Pick a date.");
    expect(dayCell("2027-01-12")).not.toBeDisabled();
  });

  it("AC-15: on the details step a switch re-renders the chosen time in the new zone and keeps the typed details", async () => {
    at("2027-01-04T10:00:00Z");
    linkIs(PARIS_LINK);
    serve(["2027-01-11T08:00:00Z"]);
    renderPage();
    await screen.findByRole("heading", { name: "Intro call" });
    await pickDay("2027-01-11");
    fireEvent.click((await waitFor(() => { const b = timeButtons(); expect(b).toHaveLength(1); return b; }))[0]!);
    fireEvent.change(screen.getByLabelText("Name", { exact: true }), { target: { value: "Kept Name" } });
    expect(screen.getByText(/Monday, January 11, 2027 · 9:00\sAM – 9:30\sAM/)).toBeInTheDocument();
    chooseZone("Asia/Tokyo");
    expect(screen.getByText(/Monday, January 11, 2027 · 5:00\sPM – 5:30\sPM/)).toBeInTheDocument();
    expect(screen.getAllByText("Asia/Tokyo (UTC+09:00)").length).toBeGreaterThan(0);
    expect(screen.getByLabelText("Name", { exact: true })).toHaveValue("Kept Name");
    expect(screen.getByRole("button", { name: /confirm booking/i })).toBeInTheDocument();
  });

  it("AC-16: a failed day listing is an error with retry and no time; after the retry exactly the day's set", async () => {
    at("2027-01-04T10:00:00Z");
    linkIs(PARIS_LINK);
    const offered = gridStarts("2027-01-11", [9, 0], [10, 0], "Europe/Paris");
    let failDay = true;
    vi.spyOn(schedulingLinksApi, "getPublicSlots").mockImplementation(async (_s, p) => {
      if (p.date && failDay) throw new ApiHttpError(503, { error: "service unavailable" });
      return answer(offered, "Europe/Paris", p);
    });
    renderPage();
    await screen.findByRole("heading", { name: "Intro call" });
    await pickDay("2027-01-11");
    const notice = await screen.findByTestId("api-error");
    expect(timeButtons()).toHaveLength(0);
    expect(screen.queryByText(/no time available/i)).not.toBeInTheDocument();
    failDay = false;
    fireEvent.click(within(notice).getByTestId("api-error-retry"));
    await waitFor(() => expect(shownTimes()).toEqual(["9:00 AM", "9:15 AM", "9:30 AM"]));
    expect(screen.queryByTestId("api-error")).not.toBeInTheDocument();
  });

  it("AC-16a: a failed overview leaves no day selectable and shows the PAC-83 error with retry; a 429 keeps the rate-limit text", async () => {
    at("2027-01-04T10:00:00Z");
    linkIs(PARIS_LINK);
    const offered = gridStarts("2027-01-11", [9, 0], [10, 0], "Europe/Paris");
    let failure: unknown = new ApiHttpError(500, { error: "internal error" });
    vi.spyOn(schedulingLinksApi, "getPublicSlots").mockImplementation(async (_s, p) => {
      if (!p.date && failure) throw failure;
      return answer(offered, "Europe/Paris", p);
    });
    renderPage();
    await screen.findByRole("heading", { name: "Intro call" });
    const notice = await screen.findByTestId("api-error");
    expect(dayCell("2027-01-11")).toBeDisabled();
    failure = new ApiHttpError(429, { error: "rate limit exceeded" });
    fireEvent.click(within(notice).getByTestId("api-error-retry"));
    expect(await screen.findByText(/too many requests for available times/i)).toBeInTheDocument();
    failure = null;
    fireEvent.click(screen.getByTestId("api-error-retry"));
    await pickDay("2027-01-11");
    expect(screen.queryByTestId("api-error")).not.toBeInTheDocument();
  });

  it("AC-16b: one overview per visible grid, from/to at most 42 days, re-issued per month; never a date-less request without from/to", async () => {
    at("2027-01-04T10:00:00Z");
    linkIs(PARIS_LINK);
    const calls = serve([]);
    renderPage();
    await screen.findByRole("heading", { name: "Intro call" });
    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0]).toMatchObject({ from: "2026-12-27", to: "2027-02-06", displayTimeZone: "Europe/Paris", duration: 30 });
    for (let i = 0; i < 3; i++) fireEvent.click(screen.getByRole("button", { name: /next month/i }));
    await waitFor(() => expect(calls).toHaveLength(4));
    expect(calls.map((c) => c.from)).toEqual(["2026-12-27", "2027-01-31", "2027-02-28", "2027-03-28"]);
    for (const c of calls) {
      expect(c.date).toBeUndefined();
      const span = (new Date(`${c.to}T00:00:00Z`).getTime() - new Date(`${c.from}T00:00:00Z`).getTime()) / 86_400_000;
      expect(span).toBe(41);
    }
  });
});

describe("PAC-88 transition days", () => {
  it("AC-17: New York spring-forward Sunday shows no 2:xx, and each time its own offset", async () => {
    at("2027-03-01T12:00:00Z");
    linkIs({ ...PARIS_LINK, time_zone: "America/New_York" });
    serve(gridStarts("2027-03-14", [1, 0], [4, 0], "America/New_York"), "America/New_York");
    renderPage();
    await screen.findByRole("heading", { name: "Intro call" });
    await pickDay("2027-03-14");
    await waitFor(() => expect(timeButtons().length).toBeGreaterThan(0));
    expect(shownTimes().some((t) => t.startsWith("2:"))).toBe(false);
    const names = timeButtons().map((b) => norm(b.getAttribute("aria-label")));
    expect(names[0]).toMatch(new RegExp(`1:00 AM, America/New_York UTC${MINUS}05:00$`));
    expect(names.at(-1)).toMatch(new RegExp(`3:30 AM, America/New_York UTC${MINUS}04:00$`));
    expect(screen.getAllByText(`UTC${MINUS}05:00`).length).toBeGreaterThan(0);
    expect(screen.getAllByText(`UTC${MINUS}04:00`).length).toBeGreaterThan(0);
  });

  it("AC-18: a UTC link's Sunday 05:00-07:00 in New York on 2027-11-07 lists seven times, repeated ones told apart by offset and name", async () => {
    at("2027-11-01T12:00:00Z");
    linkIs({ ...PARIS_LINK, time_zone: "UTC" });
    serve(gridStarts("2027-11-07", [5, 0], [7, 0], "UTC"), "UTC");
    renderPage();
    await screen.findByRole("heading", { name: "Intro call" });
    chooseZone("America/New_York");
    await pickDay("2027-11-07");
    await waitFor(() => expect(timeButtons()).toHaveLength(7));
    expect(shownTimes()).toEqual(["1:00 AM", "1:15 AM", "1:30 AM", "1:45 AM", "1:00 AM", "1:15 AM", "1:30 AM"]);
    const names = timeButtons().map((b) => norm(b.getAttribute("aria-label")));
    expect(new Set(names).size).toBe(7);
    expect(names[0]).toMatch(new RegExp(`UTC${MINUS}04:00$`));
    expect(names[4]).toMatch(new RegExp(`UTC${MINUS}05:00$`));
  });

  it("AC-20: the label shows the selected later day's offset, not today's", async () => {
    at("2027-03-20T12:00:00Z");
    linkIs(PARIS_LINK);
    serve(gridStarts("2027-04-05", [9, 0], [10, 0], "Europe/Paris"));
    renderPage();
    await screen.findByRole("heading", { name: "Intro call" });
    expect(label()).toBe("Europe/Paris (UTC+01:00)");
    await pickDay("2027-04-05");
    expect(label()).toBe("Europe/Paris (UTC+02:00)");
  });
});

describe("PAC-88 confirmation and memory of the choice", () => {
  const confirmed = (start: string, end: string): BookingConfirmation => ({
    id: "b1",
    link_slug: "intro",
    title: "Intro call",
    start,
    end,
    duration_minutes: 30,
    hosts: [{ email: "host@co.com", name: "Host" }],
    booker_name: "Booker",
    booker_email: "booker@co.com",
  });

  it("AC-21 / AC-30: booked while showing Asia/Tokyo, the confirmation and the file name are in Tokyo; 'Book another time' stays in Tokyo", async () => {
    at("2027-01-04T10:00:00Z");
    linkIs(PARIS_LINK);
    serve(["2027-01-14T23:30:00Z"]);
    vi.spyOn(schedulingLinksApi, "bookSlot").mockResolvedValue(confirmed("2027-01-14T23:30:00Z", "2027-01-15T00:00:00Z"));
    renderPage();
    await screen.findByRole("heading", { name: "Intro call" });
    chooseZone("Asia/Tokyo");
    await pickDay("2027-01-15");
    fireEvent.click((await waitFor(() => { const b = timeButtons(); expect(b).toHaveLength(1); return b; }))[0]!);
    fireEvent.change(screen.getByLabelText("Name", { exact: true }), { target: { value: "Booker" } });
    fireEvent.change(screen.getByLabelText("Email", { exact: true }), { target: { value: "booker@co.com" } });
    fireEvent.click(screen.getByRole("button", { name: /confirm booking/i }));

    await screen.findByRole("heading", { name: /you are confirmed/i });
    expect(screen.getByText("Friday, January 15, 2027")).toBeInTheDocument();
    expect(screen.getByText(/8:30\sAM – 9:00\sAM · 30 min/)).toBeInTheDocument();
    expect(screen.getByText("Asia/Tokyo (UTC+09:00)")).toBeInTheDocument();

    const downloads: string[] = [];
    Object.assign(URL, { createObjectURL: () => "blob:ics", revokeObjectURL: () => undefined });
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
      downloads.push(this.download);
    });
    fireEvent.click(screen.getByRole("button", { name: /add to calendar/i }));
    expect(downloads).toEqual(["intro-2027-01-15.ics"]);

    fireEvent.click(screen.getByRole("button", { name: /book another time/i }));
    await screen.findByRole("heading", { name: "Intro call" });
    expect(label()).toBe("Asia/Tokyo (UTC+09:00)");
  });

  it("AC-25: the chosen zone holds across a duration change, a 409 and a retry; nothing is stored, and a new load opens in the link's zone", async () => {
    at("2027-01-04T10:00:00Z");
    linkIs(PARIS_LINK);
    const calls = serve(["2027-01-11T08:00:00Z"]);
    const setItem = vi.spyOn(Storage.prototype, "setItem");
    vi.spyOn(schedulingLinksApi, "bookSlot").mockRejectedValue(new ApiHttpError(409, { error: "slot is no longer available" }));
    const { unmount } = renderPage();
    await screen.findByRole("heading", { name: "Intro call" });
    chooseZone("Asia/Tokyo");
    fireEvent.click(screen.getByRole("button", { name: "60 min" }));
    await pickDay("2027-01-11");
    fireEvent.click((await waitFor(() => { const b = timeButtons(); expect(b).toHaveLength(1); return b; }))[0]!);
    fireEvent.change(screen.getByLabelText("Name", { exact: true }), { target: { value: "Booker" } });
    fireEvent.change(screen.getByLabelText("Email", { exact: true }), { target: { value: "booker@co.com" } });
    fireEvent.click(screen.getByRole("button", { name: /confirm booking/i }));
    await screen.findByRole("alert");
    expect(label()).toBe("Asia/Tokyo (UTC+09:00)");
    expect(calls.filter((c) => c.duration === 60).every((c) => c.displayTimeZone === "Asia/Tokyo")).toBe(true);
    expect(calls.at(-1)).toMatchObject({ date: "2027-01-11", displayTimeZone: "Asia/Tokyo" });

    expect(setItem).not.toHaveBeenCalled();
    expect(document.cookie).toBe("");
    unmount();

    renderPage();
    await screen.findByRole("heading", { name: "Intro call" });
    expect(label()).toBe("Europe/Paris (UTC+01:00)");
  });
});

describe("PAC-88 host zone change, refused zone, older server", () => {
  it("AC-26: an answer in a new host zone is not rendered; link info is re-read and the page follows the new zone", async () => {
    at("2027-01-04T10:00:00Z");
    const link = vi
      .spyOn(schedulingLinksApi, "getPublicLink")
      .mockResolvedValueOnce(PARIS_LINK)
      .mockResolvedValue({ ...PARIS_LINK, time_zone: "America/New_York" });
    const calls = serve(gridStarts("2027-01-11", [9, 0], [10, 0], "America/New_York"), "America/New_York");
    renderPage();
    await screen.findByRole("heading", { name: "Intro call" });
    await waitFor(() => expect(label()).toBe(`America/New_York (UTC${MINUS}05:00)`));
    expect(link).toHaveBeenCalledTimes(2);
    await pickDay("2027-01-11");
    await waitFor(() => expect(shownTimes()[0]).toBe("9:00 AM"));
    expect(calls.at(-1)!.displayTimeZone).toBe("America/New_York");
    expect(announcer()).toBe("");
  });

  it("AC-26: when re-reading does not settle the zone, the page says so with a retry instead of listing", async () => {
    at("2027-01-04T10:00:00Z");
    const link = linkIs(PARIS_LINK);
    serve(gridStarts("2027-01-11", [9, 0], [10, 0], "America/New_York"), "America/New_York");
    renderPage();
    await screen.findByRole("heading", { name: "Intro call" });
    expect(await screen.findByText(/host's time zone just changed/i)).toBeInTheDocument();
    expect(dayCell("2027-01-11")).toBeDisabled();
    fireEvent.click(screen.getByTestId("api-error-retry"));
    await waitFor(() => expect(link.mock.calls.length).toBeGreaterThanOrEqual(3));
  });

  it("contract 3.2: a zone the server refuses returns to the zone shown before, says so, and never shows times in it", async () => {
    at("2027-01-04T10:00:00Z");
    linkIs(PARIS_LINK);
    const offered = ["2027-01-11T08:00:00Z"];
    vi.spyOn(schedulingLinksApi, "getPublicSlots").mockImplementation(async (_s, p) => {
      if (p.displayTimeZone === "Asia/Tokyo") throw new ApiHttpError(400, { error: "invalid display_time_zone, use an IANA time zone name" });
      return answer(offered, "Europe/Paris", p);
    });
    renderPage();
    await screen.findByRole("heading", { name: "Intro call" });
    chooseZone("America/New_York");
    chooseZone("Asia/Tokyo");
    const msg = await screen.findByTestId("booking-tz-unsupported");
    expect(msg).toHaveTextContent("Times can't be shown in Asia/Tokyo. Choose another time zone.");
    expect(announcer()).toBe("Times can't be shown in Asia/Tokyo. Choose another time zone.");
    expect(label()).toBe(`America/New_York (UTC${MINUS}05:00)`);
    expect(screen.queryByTestId("api-error")).not.toBeInTheDocument();
    await pickDay("2027-01-11");
    await waitFor(() => expect(shownTimes()).toEqual(["3:00 AM"]));
  });

  it("contract 3.2: any other 400 is a PAC-83 error with retry, never 'no time available'", async () => {
    at("2027-01-04T10:00:00Z");
    linkIs(PARIS_LINK);
    vi.spyOn(schedulingLinksApi, "getPublicSlots").mockRejectedValue(new ApiHttpError(400, { error: "range must not exceed 42 days" }));
    renderPage();
    await screen.findByRole("heading", { name: "Intro call" });
    const notice = await screen.findByTestId("api-error");
    expect(notice).toHaveTextContent("range must not exceed 42 days");
    expect(within(notice).getByTestId("api-error-retry")).toBeInTheDocument();
    expect(screen.queryByText(/no time available/i)).not.toBeInTheDocument();
  });

  it("contract 5: without the display_time_zone echo the page runs in link-zone mode with the switcher disabled", async () => {
    at("2027-01-04T10:00:00Z");
    browserIn("Asia/Tokyo");
    linkIs(PARIS_LINK);
    const calls: PublicSlotsParams[] = [];
    // An older server: ignores display_time_zone/from/to, answers the whole horizon in the link zone.
    vi.spyOn(schedulingLinksApi, "getPublicSlots").mockImplementation(async (_s, p) => {
      calls.push(p);
      if (p.date) return { slots: p.date === "2027-01-11" ? [{ start: "2027-01-11T08:00:00Z", end: "2027-01-11T08:30:00Z" }] : [], available_dates: [] };
      return { slots: [], available_dates: ["2027-01-11"] };
    });
    renderPage();
    await screen.findByRole("heading", { name: "Intro call" });
    const box = screen.getByRole("combobox", { name: "Time zone" });
    await waitFor(() => expect(box).toHaveAttribute("aria-disabled", "true"));
    expect(screen.getByText(/time zone switching is unavailable right now/i)).toBeInTheDocument();
    expect(screen.queryByTestId("booking-tz-use-mine")).not.toBeInTheDocument();
    expect(label()).toBe("Europe/Paris (UTC+01:00)");
    await pickDay("2027-01-11");
    await waitFor(() => expect(shownTimes()).toEqual(["9:00 AM"]));
    expect(calls.at(-1)).toMatchObject({ date: "2027-01-11", displayTimeZone: "Europe/Paris" });
  });

  it("contract 5: an older server's failing date-less read is the PAC-83 error, never every day selectable", async () => {
    at("2027-01-04T10:00:00Z");
    linkIs(PARIS_LINK);
    let first = true;
    vi.spyOn(schedulingLinksApi, "getPublicSlots").mockImplementation(async (_s, p) => {
      if (!p.date && first) {
        first = false;
        return { slots: [], available_dates: ["2027-01-11"] };
      }
      throw new ApiHttpError(503, { error: "request timed out" });
    });
    renderPage();
    await screen.findByRole("heading", { name: "Intro call" });
    expect(await screen.findByTestId("api-error")).toBeInTheDocument();
    expect(dayCell("2027-01-11")).toBeDisabled();
    expect(dayCell("2027-01-12")).toBeDisabled();
  });
});
