/**
 * PAC-122 batch 6b, SF-057: reschedule suggestions span today and the next
 * business days, but were computed from the displayed range's events only,
 * so a day outside it looked free and busy times were offered. Working hours
 * also defaulted to 09:00-18:00 when the settings read had failed.
 *
 * The suggestions now read the events of their own window, say so when that
 * read fails, and offer nothing without working hours.
 */
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { RescheduleSuggestions } from "./RescheduleSuggestions";
import type { CalendarEvent } from "@/api/types";

const fetchMock = vi.fn<typeof fetch>();
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

/** Local wall-clock time on 2026-11-<day>. */
const at = (day: number, h: number, m = 0) => new Date(2026, 10, day, h, m).toISOString();

function busy(id: string, day: number, h1: number, h2: number) {
  return { id, title: "Busy", start: at(day, h1), end: at(day, h2) };
}

// Monday 16 to Friday 20 November 2026 are busy all working day, except
// Wednesday 18 from 14:00 to 15:00.
const WEEK = [
  busy("m", 16, 9, 18),
  busy("t", 17, 9, 18),
  busy("w1", 18, 9, 14),
  busy("w2", 18, 15, 18),
  busy("th", 19, 9, 18),
  busy("f", 20, 9, 18),
];

const EVENT = { id: "ev", title: "Sync", start: at(16, 10), end: at(16, 10, 30) } as CalendarEvent;

function renderSuggestions(hours: { workStart?: string; workEnd?: string } = { workStart: "09:00", workEnd: "18:00" }) {
  const { workStart, workEnd } = hours;
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <RescheduleSuggestions event={EVENT} workStart={workStart} workEnd={workEnd} onMoved={() => {}} />
    </QueryClientProvider>,
  );
}

describe("PAC-122 SF-057: reschedule suggestions", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 10, 16, 7, 0));
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => vi.useRealTimers());
  afterAll(() => vi.unstubAllGlobals());

  it("read the events of their own window and offer only free times", async () => {
    fetchMock.mockImplementation(async (input) => {
      const url = new URL(String(input), window.location.origin);
      if (url.pathname === "/api/calendar/events") return json(WEEK);
      return json({ error: "not here" }, 404);
    });
    renderSuggestions();
    const slots = await screen.findAllByTestId("reschedule-slot");
    expect(slots.length).toBeGreaterThan(0);
    for (const s of slots) expect(s.textContent).toMatch(/Wed/);
    const read = fetchMock.mock.calls.map(([i]) => new URL(String(i), window.location.origin));
    const events = read.find((u) => u.pathname === "/api/calendar/events");
    expect(events?.searchParams.get("start")).toBe(new Date(2026, 10, 16).toISOString());
    expect(events?.searchParams.get("end")).toBe(new Date(2026, 10, 21).toISOString());
  });

  it("say so when the window's events cannot be read, and offer nothing", async () => {
    fetchMock.mockResolvedValue(json({ error: "internal error" }, 500));
    renderSuggestions();
    expect(await screen.findByRole("alert")).toHaveTextContent(/could not check your calendar/i);
    expect(screen.queryByTestId("reschedule-slot")).not.toBeInTheDocument();
  });

  it("offer nothing without working hours, instead of assuming 09:00-18:00", async () => {
    fetchMock.mockImplementation(async () => json([]));
    renderSuggestions({});
    expect(await screen.findByText(/need your working hours/i)).toBeInTheDocument();
    expect(screen.queryByTestId("reschedule-slot")).not.toBeInTheDocument();
  });
});
