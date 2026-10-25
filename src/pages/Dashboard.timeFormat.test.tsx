import { describe, expect, it, vi } from "vitest";
import { render, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import type { ReactNode } from "react";

import Dashboard from "./Dashboard";
import { TimeFormatValue } from "@/contexts/TimeFormatContext";
import type { TimeFormat } from "@/lib/timeFormat";

// The dashboard's side panels and banners are not under test here: only the
// calendar's hour axis is. Stub them so the test does not depend on their data.
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
vi.mock("@/api/client", () => ({
  api: { authStatus: () => Promise.resolve({ connected: true }) },
  apiErrorMessage: () => "",
}));

function firstAxisLabel(container: HTMLElement): string | undefined {
  return container.querySelector(".fc-timegrid-slot-label-cushion")?.textContent?.trim();
}

function Shell({ tf, qc, children }: { tf: TimeFormat; qc: QueryClient; children: ReactNode }) {
  return (
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <TimeFormatValue value={tf}>{children}</TimeFormatValue>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

// NEW-e2e-pac55-ac10: the user's settings load after the calendar first
// renders, so the format switches from the 12-hour default to 24-hour after
// mount. The hour axis must follow it.
describe("Dashboard hour axis time format", () => {
  it("switches the hour axis to 24-hour when the format arrives after mount", async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { container, rerender } = render(
      <Shell tf="12h" qc={qc}>
        <Dashboard />
      </Shell>,
    );
    await waitFor(() => expect(firstAxisLabel(container)).toMatch(/am/i));

    rerender(
      <Shell tf="24h" qc={qc}>
        <Dashboard />
      </Shell>,
    );
    await waitFor(() => expect(firstAxisLabel(container)).toBe("07:00"));
    const labels = Array.from(container.querySelectorAll(".fc-timegrid-slot-label-cushion")).map((el) => el.textContent?.trim() ?? "");
    expect(labels).toContain("20:00");
    expect(labels.join(" ")).not.toMatch(/am|pm/i);
  });

  it("switches back to 12-hour when the format changes from 24-hour", async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { container, rerender } = render(
      <Shell tf="24h" qc={qc}>
        <Dashboard />
      </Shell>,
    );
    await waitFor(() => expect(firstAxisLabel(container)).toBe("07:00"));

    rerender(
      <Shell tf="12h" qc={qc}>
        <Dashboard />
      </Shell>,
    );
    await waitFor(() => expect(firstAxisLabel(container)).toMatch(/am/i));
  });
});
