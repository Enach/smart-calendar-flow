/**
 * PAC-129 AC-36 through the page: team Find a time navigates to /app with the
 * attendees in navigation state (never in the address); the Dashboard puts
 * them in the scheduling prefill and says where the prefill came from.
 */
import { render, waitFor } from "@testing-library/react";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";

const bar = vi.hoisted(() => ({ initial: undefined as string | undefined }));

vi.mock("@fullcalendar/react", () => ({ default: () => null }));
vi.mock("@/components/Navbar", () => ({ Navbar: () => null }));
vi.mock("@/components/NLPBar", () => ({
  NLPBar: (props: { initialValue?: string }) => {
    bar.initial = props.initialValue;
    return null;
  },
}));
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

import { toast } from "@/hooks/useToast";
import Dashboard from "./Dashboard";

const fetchMock = vi.fn<typeof fetch>();

function renderAt(entry: { pathname: string; search: string; state?: unknown }) {
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter initialEntries={[entry]}>
        <Dashboard />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("PAC-129 AC-36: the Dashboard reads Find a time's attendees from navigation state", () => {
  beforeEach(() => {
    bar.initial = undefined;
    fetchMock.mockReset();
    fetchMock.mockImplementation(async () => new Response("[]", { status: 200, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);
  });
  afterAll(() => {
    vi.unstubAllGlobals();
  });

  it("prefills every attendee from state, with no address in the URL, and names Find a time", async () => {
    const info = vi.spyOn(toast, "info");
    renderAt({
      pathname: "/app",
      search: "?title=Platform+sync&duration=60&start=2030-03-04T14%3A00%3A00Z",
      state: { attendees: ["max@co.example", "pat@ext.example"] },
    });
    await waitFor(() => expect(bar.initial).toBe("Schedule 60m Platform sync with max@co.example, pat@ext.example"));
    expect(info).toHaveBeenCalledWith("Prefilled from your team's Find a time — review and confirm a slot.");
  });

  it("a Manager link still prefills from the address and says so", async () => {
    const info = vi.spyOn(toast, "info");
    renderAt({ pathname: "/app", search: "?title=1%3A1&attendees=a%40b.example&duration=30" });
    await waitFor(() => expect(bar.initial).toBe("Schedule 30m 1:1 with a@b.example"));
    expect(info).toHaveBeenCalledWith("Prefilled from the Manager dashboard — review and confirm a slot.");
  });
});
