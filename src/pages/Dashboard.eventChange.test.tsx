import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { render, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";

// PAC-29, AC-11 (D-8, API-043): dragging or resizing an all-day event in the
// month view sends bare YYYY-MM-DD dates (exclusive end) taken from the local
// calendar dates, never toISOString(). The zone is set inside the process and
// is east of UTC, where toISOString() of local midnight is the previous day
// (challenger R3-N2).
const zone = vi.hoisted(() => {
  const previous = process.env.TZ;
  process.env.TZ = "Europe/Paris";
  return { previous };
});

type CalendarProps = Record<string, unknown> & {
  eventDrop: (arg: unknown) => Promise<void> | void;
  eventResize: (arg: unknown) => Promise<void> | void;
};
const captured = vi.hoisted(() => ({ props: null as null | Record<string, unknown> }));
vi.mock("@fullcalendar/react", () => ({
  default: (props: Record<string, unknown>) => {
    captured.props = props;
    return null;
  },
}));

const updateEvent = vi.fn();
vi.mock("@/api/client", () => ({
  api: {
    authStatus: () => Promise.resolve({ connected: true }),
    updateEvent: (...args: unknown[]) => updateEvent(...args),
  },
  apiErrorMessage: () => "",
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
vi.mock("@/components/MockBanner", () => ({ MockBanner: () => null }));
vi.mock("@/components/DemoBanner", () => ({ DemoBanner: () => null }));
vi.mock("@/components/QuickCreatePopover", () => ({ QuickCreatePopover: () => null }));
vi.mock("@/contexts/useAuth", () => ({ useAuth: () => ({ isDemo: false }) }));
vi.mock("@/hooks/useSettings", () => ({ useSettings: () => ({ data: undefined }) }));
vi.mock("@/hooks/useCalendarEvents", () => ({
  useCalendarEvents: () => ({ data: [], isLoading: false, isFetching: false, isError: false, error: null, refetch: vi.fn() }),
}));

import Dashboard from "./Dashboard";

async function calendar(): Promise<CalendarProps> {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter>
        <Dashboard />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  await waitFor(() => expect(captured.props).not.toBeNull());
  return captured.props as CalendarProps;
}

/** What FullCalendar hands eventDrop / eventResize: local Date objects. */
function changeArg(event: { allDay: boolean; start: Date; end: Date }) {
  return { event: { id: "evt-1", title: "Offsite", ...event }, revert: vi.fn() };
}

describe("Dashboard drag and resize (PAC-29, AC-11)", () => {
  beforeEach(() => {
    captured.props = null;
    updateEvent.mockReset();
    updateEvent.mockResolvedValue({ id: "evt-1", title: "Offsite", start: "", end: "" });
  });

  afterAll(() => {
    if (zone.previous === undefined) delete process.env.TZ;
    else process.env.TZ = zone.previous;
  });

  it("runs east of UTC", () => {
    expect(new Date(2026, 4, 2).toISOString()).toBe("2026-05-01T22:00:00.000Z");
  });

  it("an all-day event dropped one day later sends bare dates", async () => {
    const cal = await calendar();
    await cal.eventDrop(changeArg({ allDay: true, start: new Date(2026, 4, 2), end: new Date(2026, 4, 3) }));
    expect(updateEvent).toHaveBeenCalledWith("evt-1", { start: "2026-05-02", end: "2026-05-03" }, "none");
  });

  it("an all-day event resized to two days sends bare dates with an exclusive end", async () => {
    const cal = await calendar();
    await cal.eventResize(changeArg({ allDay: true, start: new Date(2026, 4, 1), end: new Date(2026, 4, 3) }));
    expect(updateEvent).toHaveBeenCalledWith("evt-1", { start: "2026-05-01", end: "2026-05-03" }, "none");
  });

  it("a timed event dropped still sends toISOString() date-times", async () => {
    const cal = await calendar();
    const start = new Date(2026, 4, 2, 10, 0);
    const end = new Date(2026, 4, 2, 10, 30);
    await cal.eventDrop(changeArg({ allDay: false, start, end }));
    expect(updateEvent).toHaveBeenCalledWith("evt-1", { start: start.toISOString(), end: end.toISOString() }, "none");
  });
});
