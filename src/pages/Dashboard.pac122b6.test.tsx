/**
 * PAC-122 batch 6, SF-050 (Dashboard half): a typed focus request ("block
 * focus time") always said "Focus time scheduled", whatever the run answered.
 * The run's `createdBlocks` and `errors[]` now decide the message.
 *
 * SF-058 (batch 6b): the Today agenda filtered the displayed range's events
 * for today. The Dashboard now tells it whether today is on screen.
 *
 * SF-057 (batch 6b review): the event drawer is told when the settings read
 * is still pending, so reschedule suggestions say the working hours are
 * loading, not that they could not be loaded.
 */
import { act, render, waitFor } from "@testing-library/react";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";

const bar = vi.hoisted(() => ({ onSubmit: null as null | ((text: string) => Promise<void> | void) }));
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), info: vi.fn() }));
const agenda = vi.hoisted(() => ({ todayShown: undefined as boolean | undefined }));
const cal = vi.hoisted(() => ({
  range: null as null | { start: Date; end: Date },
  fired: false,
  click: null as null | Record<string, unknown>,
}));
const drawer = vi.hoisted(() => ({ props: null as null | Record<string, unknown> }));
const settingsState = vi.hoisted(() => ({ data: undefined as unknown, isLoading: false }));

vi.mock("@/hooks/useToast", () => ({ toast }));
vi.mock("@fullcalendar/react", async () => {
  const { useEffect } = await import("react");
  function FullCalendarStub(props: { datesSet?: (arg: unknown) => void; eventClick?: (arg: unknown) => void }) {
    // Fires once, as a navigation to `cal.range` (or a click on `cal.click`) would.
    useEffect(() => {
      if (cal.fired) return;
      if (cal.click) {
        cal.fired = true;
        props.eventClick?.({ event: { extendedProps: { raw: cal.click } } });
        return;
      }
      if (!cal.range) return;
      cal.fired = true;
      const { start, end } = cal.range;
      props.datesSet?.({ start, end, view: { currentStart: start, title: "Elsewhere", type: "timeGridWeek" } });
    }, [props]);
    return null;
  }
  return { default: FullCalendarStub };
});
vi.mock("@/components/Navbar", () => ({ Navbar: () => null }));
vi.mock("@/components/NLPBar", () => ({
  NLPBar: (props: { onSubmit: (text: string) => Promise<void> | void }) => {
    bar.onSubmit = props.onSubmit;
    return null;
  },
}));
vi.mock("@/components/NLPConfirmModal", () => ({ NLPConfirmModal: () => null }));
vi.mock("@/components/ScheduleSuggestModal", () => ({ ScheduleSuggestModal: () => null }));
vi.mock("@/components/ConnectionStatus", () => ({ ConnectionStatus: () => null }));
vi.mock("@/components/TodayAgenda", () => ({
  TodayAgenda: (props: { todayShown?: boolean }) => {
    agenda.todayShown = props.todayShown;
    return null;
  },
}));
vi.mock("@/components/FocusStats", () => ({ FocusStats: () => null }));
vi.mock("@/components/QuickActions", () => ({ QuickActions: () => null }));
vi.mock("@/components/EventDrawer", () => ({
  EventDrawer: (props: Record<string, unknown>) => {
    drawer.props = props;
    return null;
  },
}));
vi.mock("@/components/ServerStatusBanner", () => ({ ServerStatusBanner: () => null }));
vi.mock("@/components/QuickCreatePopover", () => ({ QuickCreatePopover: () => null }));
vi.mock("@/contexts/useAuth", () => ({ useAuth: () => ({ isDemo: false }) }));
vi.mock("@/hooks/useSettings", () => ({ useSettings: () => settingsState }));

import Dashboard from "./Dashboard";

const fetchMock = vi.fn<typeof fetch>();
const json = (body: unknown) =>
  new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });

async function askForFocus(run: Record<string, unknown>) {
  fetchMock.mockImplementation(async (u) => {
    const path = new URL(String(u), window.location.origin).pathname;
    if (path === "/api/nlp/parse") return json({ intent: "schedule_focus" });
    if (path === "/api/focus/run") return json(run);
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
  await waitFor(() => expect(bar.onSubmit).not.toBeNull());
  await act(async () => {
    await bar.onSubmit!("block focus time this week");
  });
}

describe("PAC-122 SF-050: the Dashboard reports what a typed focus request did", () => {
  beforeEach(() => {
    cal.range = null;
    bar.onSubmit = null;
    toast.success.mockReset();
    toast.error.mockReset();
    toast.info.mockReset();
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterAll(() => vi.unstubAllGlobals());

  it("a run with failed days is an error, never 'Focus time scheduled'", async () => {
    await askForFocus({
      weekStart: "2026-11-16T00:00:00Z",
      createdBlocks: [],
      skippedDays: [],
      totalMinutes: 0,
      errors: ["2026-11-18: read existing focus minutes: boom"],
    });
    expect(toast.error).toHaveBeenCalledWith("No focus block was created. Problems on 1 day: 2026-11-18.");
    expect(toast.success).not.toHaveBeenCalledWith("Focus time scheduled");
  });

  it("a run that created nothing says so", async () => {
    await askForFocus({ weekStart: "2026-11-16T00:00:00Z", createdBlocks: [], skippedDays: ["2026-11-16"], totalMinutes: 0, errors: [] });
    expect(toast.info).toHaveBeenCalledWith("No focus block was created this week.");
    expect(toast.success).not.toHaveBeenCalledWith("Focus time scheduled");
  });

  it("a run that created blocks counts them", async () => {
    await askForFocus({
      weekStart: "2026-11-16T00:00:00Z",
      createdBlocks: [{ google_event_id: "g1", start_time: "2026-11-16T08:00:00Z", end_time: "2026-11-16T09:30:00Z", date: "2026-11-16" }],
      skippedDays: [],
      totalMinutes: 90,
      errors: [],
    });
    expect(toast.success).toHaveBeenCalledWith("Created 1 focus block");
  });
});

describe("PAC-122 SF-058: the Dashboard tells the Today agenda whether today is on screen", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockImplementation(async (u) => {
      const path = new URL(String(u), window.location.origin).pathname;
      if (path === "/api/auth/status") return json({ connected: true, provider: "google" });
      return json([]);
    });
  });
  afterAll(() => vi.unstubAllGlobals());

  function renderDashboard() {
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <MemoryRouter>
          <Dashboard />
        </MemoryRouter>
      </QueryClientProvider>,
    );
  }

  it("today on screen: todayShown is true", async () => {
    cal.range = null;
    renderDashboard();
    await waitFor(() => expect(agenda.todayShown).toBe(true));
  });

  it("another week on screen: todayShown is false", async () => {
    const start = new Date();
    start.setDate(start.getDate() + 21);
    cal.range = { start, end: new Date(start.getTime() + 7 * 86_400_000) };
    cal.fired = false;
    renderDashboard();
    await waitFor(() => expect(agenda.todayShown).toBe(false));
  });
});

describe("PAC-122 SF-057: the event drawer is told when the working hours are still loading", () => {
  const EVENT = { id: "ev", title: "Sync", start: "2026-11-16T10:00:00Z", end: "2026-11-16T10:30:00Z" };
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockImplementation(async (u) => {
      const path = new URL(String(u), window.location.origin).pathname;
      if (path === "/api/auth/status") return json({ connected: true, provider: "google" });
      return json([]);
    });
    drawer.props = null;
    cal.range = null;
    cal.click = EVENT;
    cal.fired = false;
  });
  afterAll(() => {
    cal.click = null;
    settingsState.isLoading = false;
    vi.unstubAllGlobals();
  });

  it.each([true, false])("settings loading = %s is passed as hoursLoading", async (loading) => {
    settingsState.isLoading = loading;
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <MemoryRouter>
          <Dashboard />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    await waitFor(() => expect(drawer.props).not.toBeNull());
    expect(drawer.props?.hoursLoading).toBe(loading);
    expect(drawer.props?.workStart).toBeUndefined();
  });
});
