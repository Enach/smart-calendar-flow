/**
 * PAC-122 batch 6, Team page (manager tab) rows.
 *
 * SF-059: the footer read `last_scan_at` from local storage, which nothing
 * writes outside the demo, so it always said "Calendar has not been scanned
 * yet." even after scans. No read of the contract carries the last scan time
 * (only the scan answer's `scanned_at`), so the footer claims nothing until a
 * scan answers in this session, then shows that answer's `scanned_at`.
 *
 * SF-085 (batch 6b): a failed analytics read was not surfaced; every row said
 * "Data unavailable" as if nobody had data. The read's error is shown once,
 * with a retry, and rows say the figures were not loaded.
 *
 * SF-060 (batch 6b): a row gated on the member-level `data_available` (any
 * week measured) and drew an unmeasured selected week as "0m" focus. The
 * row now reads the selected week's own flag.
 *
 * SF-024 (batch 6b, UI half): a write that succeeded and whose re-read failed
 * (SavedButNotReadError) was shown as a failed write and invited a retry
 * (a second team). The dialogs now say the write happened and close.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), info: vi.fn() }));
vi.mock("@/hooks/useToast", () => ({ toast }));

import { managerApi } from "@/api/manager";
import { ApiHttpError } from "@/api/client";
import type { MemberAnalytics, TeamMember } from "@/api/manager";
import type { FormalTeam } from "@/api/teams";
import { AddPersonDialog, CreateTeamDialog, MemberRow, TeamTab } from "./Team";
import { SavedButNotReadError } from "@/api/savedButNotRead";
import { teamsApi } from "@/api/teams";

const TEAM_ID = "6f1c2b9e-3d4a-4e5f-8a7b-0c1d2e3f4a5b";
const TEAM: FormalTeam = {
  id: TEAM_ID,
  name: "Platform",
  created_at: "2026-01-01T00:00:00Z",
  owner_email: "owner@co.example",
  members: [],
  no_meeting_zones: [],
};
const WEEK = { focus_minutes: 120, meeting_minutes: 60, free_minutes: 0, data_available: true };

function renderTab() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const tree = (team: FormalTeam) => (
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <TeamTab activeTeam={team} />
      </MemoryRouter>
    </QueryClientProvider>
  );
  const view = render(tree(TEAM));
  return { switchTo: (team: FormalTeam) => view.rerender(tree(team)) };
}

describe("PAC-122 batch 6, manager tab", () => {
  beforeEach(() => {
    vi.spyOn(managerApi.remote, "listTeam").mockResolvedValue({
      team_id: TEAM_ID,
      members: [
        {
          email: "ana@co.example",
          display_name: "Ana",
          source: "manual",
          cadence: "weekly",
          cadence_custom_days: null,
          last_one_on_one_at: null,
          is_paceday_user: true,
          this_week: WEEK,
          last_week: WEEK,
          focus_trend_pct: 0,
        },
      ],
    });
    vi.spyOn(managerApi.remote, "gaps").mockResolvedValue([]);
    vi.spyOn(managerApi.remote, "analytics").mockResolvedValue([]);
  });
  afterEach(() => vi.restoreAllMocks());

  it("SF-059: claims no scan state it does not know, then shows the scan answer's time", async () => {
    vi.spyOn(managerApi.remote, "detect").mockResolvedValue({
      team_id: TEAM_ID,
      scanned_at: "2026-11-16T10:30:00Z",
      detected: 0,
      eligible: 0,
      assigned: 0,
      skipped: 0,
      candidates: [],
    });
    renderTab();
    const rescan = await screen.findByRole("button", { name: /re-scan calendar for team members/i });
    expect(screen.queryByText(/has not been scanned/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/last scan/i)).not.toBeInTheDocument();
    fireEvent.click(rescan);
    expect(await screen.findByText(/^Last scan: /)).toHaveTextContent(/Nov 16/);
  });

  it("SF-059: the scan time stays with the team it scanned, never shown for another team", async () => {
    const OTHER_ID = "7a2d3c4e-5f60-4718-9a2b-3c4d5e6f7a8b";
    const OTHER: FormalTeam = { ...TEAM, id: OTHER_ID, name: "Mobile" };
    const listTeam = vi.mocked(managerApi.remote.listTeam);
    const roster = await listTeam(TEAM_ID);
    listTeam.mockImplementation(async (teamId: string) => ({ ...roster, team_id: teamId }));
    vi.spyOn(managerApi.remote, "detect").mockResolvedValue({
      team_id: TEAM_ID,
      scanned_at: "2026-11-16T10:30:00Z",
      detected: 0,
      eligible: 0,
      assigned: 0,
      skipped: 0,
      candidates: [],
    });
    const { switchTo } = renderTab();
    fireEvent.click(await screen.findByRole("button", { name: /re-scan calendar for team members/i }));
    expect(await screen.findByText(/^Last scan: /)).toBeInTheDocument();
    switchTo(OTHER);
    await waitFor(() => expect(managerApi.remote.listTeam).toHaveBeenCalledWith(OTHER_ID));
    expect(screen.queryByText(/^Last scan: /)).not.toBeInTheDocument();
    switchTo(TEAM);
    expect(await screen.findByText(/^Last scan: /)).toBeInTheDocument();
  });

  it("SF-085: a failed analytics read is shown once with a retry, and no row says 'Data unavailable'", async () => {
    const analytics = vi.mocked(managerApi.remote.analytics);
    analytics.mockReset();
    analytics.mockRejectedValueOnce(new ApiHttpError(500, { error: "internal error" }, "internal error")).mockResolvedValue([]);
    renderTab();
    const banner = await screen.findByTestId("manager-analytics-error");
    expect(banner).toHaveTextContent("internal error");
    expect(screen.queryByText("Data unavailable")).not.toBeInTheDocument();
    expect(screen.getByText("Figures not loaded")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /retry/i }));
    await waitFor(() => expect(screen.queryByTestId("manager-analytics-error")).not.toBeInTheDocument());
    expect(analytics).toHaveBeenCalledTimes(2);
  });
});

describe("PAC-122 SF-060: a member row reads the selected week's own flag", () => {
  const member: TeamMember = {
    email: "ana@co.example",
    display_name: "Ana",
    cadence: "weekly",
    source: "manual",
    is_paceday_user: true,
    data_available: true,
    added_at: "2026-01-01T00:00:00Z",
  };
  const analytics = (selectedMeasured: boolean): MemberAnalytics => ({
    email: "ana@co.example",
    is_paceday_user: true,
    // Some earlier week was measured, so the member-level flag is true.
    data_available: true,
    one_on_ones: [],
    weeks: [
      { week_start: "2026-11-09", meeting_minutes: 300, focus_minutes: 240, free_minutes: 0, data_available: true },
      { week_start: "2026-11-16", meeting_minutes: 0, focus_minutes: selectedMeasured ? 90 : 0, free_minutes: 0, data_available: selectedMeasured },
    ],
  });
  const row = (a: MemberAnalytics) =>
    render(
      <ul>
        <MemberRow
          member={member}
          analytics={a}
          analyticsLoading={false}
          analyticsFailed={false}
          expanded={false}
          onToggle={() => {}}
          onCadenceChange={() => {}}
          onRemove={() => {}}
          onSchedule={() => {}}
        />
      </ul>,
    );

  it("an unmeasured week is 'Not measured', never '0m' focus", () => {
    row(analytics(false));
    expect(screen.queryByText("0m")).not.toBeInTheDocument();
    expect(screen.getByText("Not measured this week")).toBeInTheDocument();
  });

  it("a measured week shows its focus minutes", () => {
    row(analytics(true));
    expect(screen.getByText("1h 30m")).toBeInTheDocument();
  });
});

describe("PAC-122 SF-024: a write that succeeded, whose re-read failed", () => {
  afterEach(() => vi.restoreAllMocks());
  const client = () => new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });

  it("Create team says the team was created, closes, and never sends a second create", async () => {
    toast.info.mockReset();
    const create = vi.spyOn(teamsApi.remote, "createTeam").mockRejectedValue(new SavedButNotReadError(new Error("x")));
    const onOpenChange = vi.fn();
    render(
      <QueryClientProvider client={client()}>
        <CreateTeamDialog open onOpenChange={onOpenChange} onCreated={() => {}} />
      </QueryClientProvider>,
    );
    fireEvent.change(screen.getByPlaceholderText("Platform team"), { target: { value: "Platform" } });
    fireEvent.click(screen.getByRole("button", { name: /^create team$/i }));
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    expect(toast.info).toHaveBeenCalledWith(expect.stringMatching(/Team "Platform" was created/));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(create).toHaveBeenCalledOnce();
  });

  it("Add person says the person was added and closes", async () => {
    toast.success.mockReset();
    vi.spyOn(managerApi.remote, "addMember").mockRejectedValue(new SavedButNotReadError(new Error("x")));
    const onOpenChange = vi.fn();
    const onAdded = vi.fn();
    render(
      <QueryClientProvider client={client()}>
        <AddPersonDialog open teamId={TEAM_ID} onOpenChange={onOpenChange} onAdded={onAdded} />
      </QueryClientProvider>,
    );
    fireEvent.change(screen.getByRole("combobox", { name: "Email" }), { target: { value: "bo@co.example" } });
    fireEvent.click(screen.getByRole("button", { name: /^add person$/i }));
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    expect(onAdded).toHaveBeenCalled();
    expect(toast.success).toHaveBeenCalledWith(expect.stringMatching(/bo@co\.example added/));
  });
});
