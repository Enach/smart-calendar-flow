/**
 * PAC-83 AC-1 at the Dashboard: the calendar week answered after 10 s shows the
 * real events; nothing invented is shown meanwhile, and the tab is not marked
 * as in preview or demo mode.
 */
import { act, render, waitFor } from "@testing-library/react";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";

const captured = vi.hoisted(() => ({ events: [] as Array<{ title?: string }>, seen: [] as string[] }));
vi.mock("@fullcalendar/react", () => ({
  default: (props: { events?: Array<{ title?: string }> }) => {
    captured.events = props.events ?? [];
    for (const e of captured.events) if (e.title) captured.seen.push(e.title);
    return null;
  },
}));
vi.mock("@/components/Navbar", () => ({ Navbar: () => null }));
vi.mock("@/components/NLPBar", () => ({ NLPBar: () => null }));
vi.mock("@/components/NLPConfirmModal", () => ({ NLPConfirmModal: () => null }));
vi.mock("@/components/ScheduleSuggestModal", () => ({ ScheduleSuggestModal: () => null }));
vi.mock("@/components/ConnectionStatus", () => ({ ConnectionStatus: () => null }));
vi.mock("@/components/TodayAgenda", () => ({ TodayAgenda: () => null }));
vi.mock("@/components/FocusStats", () => ({ FocusStats: () => null }));
vi.mock("@/components/QuickActions", () => ({ QuickActions: () => null }));
vi.mock("@/components/EventDrawer", () => ({ EventDrawer: () => null }));
vi.mock("@/components/ServerStatusBanner", () => ({ ServerStatusBanner: () => null }));
vi.mock("@/components/QuickCreatePopover", () => ({ QuickCreatePopover: () => null }));
vi.mock("@/contexts/useAuth", () => ({ useAuth: () => ({ isDemo: false }) }));
vi.mock("@/hooks/useSettings", () => ({ useSettings: () => ({ data: undefined }) }));

import Dashboard from "./Dashboard";
import { isDemoSession } from "@/api/demoGate";

const fetchMock = vi.fn<typeof fetch>();
const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });

function weekEvent(title: string) {
  const d = new Date();
  d.setHours(10, 0, 0, 0);
  const end = new Date(d.getTime() + 30 * 60_000);
  return { id: "real-1", title, start: d.toISOString(), end: end.toISOString() };
}

describe("PAC-83 AC-1: Dashboard with a slow calendar read", () => {
  beforeEach(() => {
    captured.events = [];
    captured.seen = [];
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => {
    vi.useRealTimers();
  });
  afterAll(() => {
    vi.unstubAllGlobals();
  });

  it("shows the real events answered after 10 s and never an invented one", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    fetchMock.mockImplementation(async (u) => {
      const path = new URL(String(u), window.location.origin).pathname;
      if (path === "/api/calendar/events") return new Promise((r) => setTimeout(() => r(json([weekEvent("Real planning")])), 10_000));
      if (path === "/api/auth/status") return json({ connected: true, provider: "google" });
      return json([]);
    });
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <MemoryRouter>
          <Dashboard />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(9_000);
    });
    expect(captured.events).toEqual([]);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_500);
    });
    await waitFor(() => expect(captured.events.map((e) => e.title)).toContain("Real planning"));
    // Nothing but the real event was ever handed to the calendar (no seeded week, no demo events).
    expect(new Set(captured.seen)).toEqual(new Set(["Real planning"]));
    expect(sessionStorage.getItem("clockwise:mock-mode")).toBeNull();
    expect(isDemoSession()).toBe(false);
  });
});
