/**
 * PAC-135: `SuggestedSlot.score` is the backend's integer sum of points (no
 * fixed range, may be negative), not a 0–1 fraction. Both suggestion surfaces
 * draw the bar relative to the best slot in the answer, clamped to 0–100 %;
 * drawing `score * 100` would fill every bar. The demo answers on the same
 * integer scale, so it passes the generated strict schema.
 */
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

vi.mock("@/contexts/useAuth", () => ({ useAuth: () => ({ isDemo: false }) }));

import { ScheduleSuggestModal } from "./ScheduleSuggestModal";
import { NLPConfirmModal } from "./NLPConfirmModal";
import { api } from "@/api/client";
import { ScheduleSuggestions } from "@/api/generated/schemas";
import { bestScore, scoreBarPercent } from "@/lib/scoreBar";

const fetchMock = vi.fn<typeof fetch>();
const json = (body: unknown) =>
  new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });

// Backend-scale scores, on a Wednesday: 09:00 is a morning (+40) early-week
// (+10) slot = 50; 12:00 is early-week (+10) inside one preferred_times range
// (+25) = 35; 15:00 is early afternoon (+20) early-week (+10) inside an avoid_times
// range (-40) = -10.
const slot = (h: number, score: number) => ({
  start: `2026-11-18T${String(h).padStart(2, "0")}:00:00Z`,
  end: `2026-11-18T${String(h).padStart(2, "0")}:30:00Z`,
  score,
  reasons: [`Reason ${h}`],
});
const SLOTS = [slot(9, 50), slot(12, 35), slot(15, -10)];

/** The drawn width of each bar, in render order. */
function barWidths(): string[] {
  return screen.getAllByRole("meter").map((m) => (m.firstElementChild as HTMLElement).style.width);
}

describe("PAC-135: scoreBarPercent", () => {
  it("draws the best slot full and the others in proportion", () => {
    expect(scoreBarPercent(50, 50)).toBe(100);
    expect(scoreBarPercent(25, 50)).toBe(50);
    expect(scoreBarPercent(10, 30)).toBe(33);
  });
  it("clamps to 0–100", () => {
    expect(scoreBarPercent(-10, 50)).toBe(0);
    expect(scoreBarPercent(80, 50)).toBe(100);
  });
  it("draws every bar empty when no slot scored above zero", () => {
    expect(scoreBarPercent(0, 0)).toBe(0);
    expect(scoreBarPercent(-5, -5)).toBe(0);
    expect(scoreBarPercent(-30, -5)).toBe(0);
    expect(scoreBarPercent(10, -Infinity)).toBe(0);
  });
  it("bestScore is the highest score, wherever it sits", () => {
    expect(bestScore([{ score: 10 }, { score: 45 }, { score: -3 }])).toBe(45);
    expect(bestScore([])).toBe(-Infinity);
  });
});

describe("PAC-135: the Suggest a time modal draws backend-scale scores", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
    sessionStorage.removeItem("paceday:demo");
  });
  afterAll(() => vi.unstubAllGlobals());

  it("bars of different widths, relative to the best slot, clamped at 0", async () => {
    fetchMock.mockImplementation(async (u) => {
      const path = new URL(String(u), window.location.origin).pathname;
      if (path === "/api/schedule/suggest") return json({ slots: SLOTS, unknown_attendees: [] });
      return json({});
    });
    render(
      <QueryClientProvider client={new QueryClient()}>
        <ScheduleSuggestModal
          defaultRangeStart="2026-11-18T08:00:00Z"
          defaultRangeEnd="2026-11-18T18:00:00Z"
          onClose={() => {}}
        />
      </QueryClientProvider>,
    );
    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "Sync" } });
    fireEvent.change(screen.getByLabelText("Attendees"), { target: { value: "bo@co.com" } });
    fireEvent.click(screen.getByRole("button", { name: /find slots/i }));
    await waitFor(() => expect(screen.getByText("Reason 15")).toBeInTheDocument());

    expect(barWidths()).toEqual(["100%", "70%", "0%"]);
    expect(screen.getAllByRole("meter").map((m) => m.getAttribute("aria-valuenow"))).toEqual(["100", "70", "0"]);
  });
});

describe("PAC-135: the NLP confirm modal draws backend-scale scores", () => {
  it("bars of different widths, relative to the best slot, clamped at 0", () => {
    render(
      <NLPConfirmModal
        parseResult={{ intent: "schedule_meeting", title: "Sync", suggested_slots: SLOTS }}
        onClose={() => {}}
        onConfirm={() => {}}
      />,
    );
    expect(barWidths()).toEqual(["100%", "70%", "0%"]);
  });
});

describe("PAC-135: the demo scores on the backend's integer scale", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
    sessionStorage.setItem("paceday:demo", "1");
  });
  afterEach(() => sessionStorage.removeItem("paceday:demo"));

  it("passes the generated strict ScheduleSuggestions schema, with distinct integer scores", async () => {
    const res = await api.scheduleSuggest({
      duration_minutes: 30,
      attendees: ["ana@co.com"],
      range_start: "2030-03-04T08:00:00Z",
      range_end: "2030-03-08T18:00:00Z",
      title: "Sync",
    });
    expect(() => ScheduleSuggestions.parse(res)).not.toThrow();
    const scores = res.slots.map((s) => s.score);
    expect(scores.length).toBeGreaterThan(1);
    for (const s of scores) expect(Number.isInteger(s)).toBe(true);
    const best = bestScore(res.slots);
    const widths = res.slots.map((s) => scoreBarPercent(s.score, best));
    expect(widths[0]).toBe(100);
    expect(new Set(widths).size).toBe(widths.length);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
