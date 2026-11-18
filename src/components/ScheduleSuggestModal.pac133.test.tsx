/**
 * PAC-133 OQ-6 / AC-27: the "Suggest a time" modal names the attendees whose
 * availability the server could not read (`unknown_attendees`), and never
 * presents them as free. An empty list shows nothing extra; an absent list (a
 * server from before PAC-133) is read as []. The demo answers in the new shape.
 */
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

vi.mock("@/contexts/useAuth", () => ({ useAuth: () => ({ isDemo: false }) }));

import { ScheduleSuggestModal } from "./ScheduleSuggestModal";
import { api } from "@/api/client";
import { ScheduleSuggestions } from "@/api/generated/schemas";

const fetchMock = vi.fn<typeof fetch>();
const json = (body: unknown) =>
  new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });

const SLOT = { start: "2026-11-19T09:00:00Z", end: "2026-11-19T09:30:00Z", score: 90, reasons: ["No conflicts"] };
const UNKNOWN_LINE = "schedule-suggest-unknown-attendees";

async function search(answer: Record<string, unknown>, attendees = "bo@co.com, eve@gmail.com") {
  fetchMock.mockImplementation(async (u) => {
    const path = new URL(String(u), window.location.origin).pathname;
    if (path === "/api/schedule/suggest") return json(answer);
    return json({});
  });
  render(
    <QueryClientProvider client={new QueryClient()}>
      <ScheduleSuggestModal
        defaultRangeStart="2026-11-19T08:00:00Z"
        defaultRangeEnd="2026-11-19T18:00:00Z"
        onClose={() => {}}
      />
    </QueryClientProvider>,
  );
  fireEvent.change(screen.getByLabelText("Title"), { target: { value: "Sync" } });
  fireEvent.change(screen.getByLabelText("Attendees"), { target: { value: attendees } });
  fireEvent.click(screen.getByRole("button", { name: /find slots/i }));
  await waitFor(() => expect(screen.getByRole("button", { name: /refresh suggestions/i })).toBeInTheDocument());
}

describe("PAC-133 AC-27: unknown attendees in the Suggest a time modal", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
    sessionStorage.removeItem("paceday:demo");
  });
  afterEach(() => sessionStorage.removeItem("paceday:demo"));
  afterAll(() => vi.unstubAllGlobals());

  it("names every unknown attendee as one whose availability could not be checked", async () => {
    await search({ slots: [SLOT], unknown_attendees: ["eve@gmail.com", "team@co.com"] });
    const line = screen.getByTestId(UNKNOWN_LINE);
    expect(line).toHaveTextContent("Couldn't check availability for: eve@gmail.com, team@co.com.");
    // Never presented as free: the line says their calendars were not counted.
    expect(line).toHaveTextContent("These times don't account for their calendars.");
    expect(line.textContent).not.toMatch(/\bfree\b|available\b/i);
    // The slot itself is still offered.
    expect(screen.getByText(/No conflicts/)).toBeInTheDocument();
  });

  it("still names them when no slot was found", async () => {
    await search({ slots: [], unknown_attendees: ["eve@gmail.com"] });
    expect(screen.getByText(/No slots found in this range/)).toBeInTheDocument();
    expect(screen.getByTestId(UNKNOWN_LINE)).toHaveTextContent("eve@gmail.com");
  });

  it("an empty list shows nothing extra", async () => {
    await search({ slots: [SLOT], unknown_attendees: [] });
    expect(screen.queryByTestId(UNKNOWN_LINE)).toBeNull();
    expect(screen.queryByText(/Couldn't check availability/)).toBeNull();
  });

  it("an absent list (a server from before PAC-133) is read as [] and shows nothing extra", async () => {
    await search({ slots: [SLOT] });
    expect(screen.queryByTestId(UNKNOWN_LINE)).toBeNull();
  });

  it("a new search replaces the previous list", async () => {
    await search({ slots: [SLOT], unknown_attendees: ["eve@gmail.com"] });
    expect(screen.getByTestId(UNKNOWN_LINE)).toBeInTheDocument();
    fetchMock.mockImplementation(async () => json({ slots: [SLOT], unknown_attendees: [] }));
    fireEvent.click(screen.getByRole("button", { name: /refresh suggestions/i }));
    await waitFor(() => expect(screen.queryByTestId(UNKNOWN_LINE)).toBeNull());
  });
});

describe("PAC-133: the demo's suggestions answer has the server's shape", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
    sessionStorage.setItem("paceday:demo", "1");
  });
  afterEach(() => sessionStorage.removeItem("paceday:demo"));

  it("names the attendees the demo cannot read, as sent and in request order, and puts no coverage on slots", async () => {
    const res = await api.scheduleSuggest({
      duration_minutes: 30,
      attendees: ["Bo@Gmail.com", "ana@co.com", "sam@outlook.com", "Bo@Gmail.com"],
      range_start: "2030-03-04T08:00:00Z",
      range_end: "2030-03-08T18:00:00Z",
      title: "Sync",
    });
    expect(Object.keys(res).sort()).toEqual(["slots", "unknown_attendees"]);
    expect(res.unknown_attendees).toEqual(["Bo@Gmail.com"]);
    expect(() => ScheduleSuggestions.shape.unknown_attendees.parse(res.unknown_attendees)).not.toThrow();
    expect(res.slots.length).toBeGreaterThan(0);
    for (const s of res.slots) expect(Object.keys(s).sort()).toEqual(["end", "reasons", "score", "start"]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("answers an empty list when every attendee is readable", async () => {
    const res = await api.scheduleSuggest({
      duration_minutes: 30,
      attendees: ["ana@co.com"],
      range_start: "2030-03-04T08:00:00Z",
      range_end: "2030-03-08T18:00:00Z",
      title: "Sync",
    });
    expect(res.unknown_attendees).toEqual([]);
  });
});
