import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { AnalyticsTab } from "./AnalyticsTab";
import { managerApi } from "@/api/manager";
import { teamsApi, type FormalTeam } from "@/api/teams";

const team = { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", name: "Alpha" } as FormalTeam;

function renderTab(activeTeam: FormalTeam | null) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <AnalyticsTab activeTeam={activeTeam} onCreateTeam={() => {}} />
    </QueryClientProvider>,
  );
}

describe("AnalyticsTab", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(teamsApi.remote, "teamAnalytics").mockResolvedValue([
      {
        email: "report@co.com",
        display_name: "Riley Report",
        is_paceday_user: true,
        weeks: [{ week_start: "2026-10-05", meeting_minutes: 240, focus_minutes: 615, free_minutes: 1545 }],
      },
    ]);
  });

  it("shows members' real weekly analytics from the backend, never generated ones", async () => {
    const remote = vi.spyOn(managerApi.remote, "analytics").mockResolvedValue([
      {
        email: "report@co.com",
        is_paceday_user: true,
        data_available: true,
        weeks: [
          { week_start: "2026-10-05", meeting_minutes: 240, focus_minutes: 615, free_minutes: 1545 },
          { week_start: "2026-09-28", meeting_minutes: 300, focus_minutes: 410, free_minutes: 1690 },
        ],
        one_on_ones: [{ date: "2026-10-01", title: "Riley / salary review" }],
      },
    ]);
    const generated = vi.spyOn(managerApi, "analytics");

    renderTab(team);
    fireEvent.click(await screen.findByRole("button", { name: "Members" }));

    await waitFor(() => expect(remote).toHaveBeenCalled());
    const [week, teamId] = remote.mock.calls[0];
    expect(week).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(new Date(`${week}T12:00:00`).getDay()).toBe(1); // a Monday
    expect(teamId).toBe(team.id);

    expect(await screen.findByTitle(/Focus 10h 15m, Meetings 4h/)).toBeInTheDocument();
    expect(screen.getByTitle(/Focus 6h 50m, Meetings 5h/)).toBeInTheDocument();
    expect(generated).not.toHaveBeenCalled();
    // The 1:1 event title is never shown to the manager.
    expect(screen.queryByText(/salary review/)).not.toBeInTheDocument();
    expect(screen.getByText("1:1")).toBeInTheDocument();
  });

  it("shows an empty state, not generated numbers, when there is no team", () => {
    const generated = vi.spyOn(managerApi, "analytics");
    vi.spyOn(managerApi, "listTeam").mockReturnValue([
      {
        email: "someone@co.com",
        display_name: "Someone",
        cadence: "weekly",
        is_paceday_user: true,
        data_available: true,
      } as ReturnType<typeof managerApi.listTeam>[number],
    ]);

    renderTab(null);

    expect(screen.getByText("No team data yet.")).toBeInTheDocument();
    expect(screen.queryByText("Someone")).not.toBeInTheDocument();
    expect(generated).not.toHaveBeenCalled();
  });
});
