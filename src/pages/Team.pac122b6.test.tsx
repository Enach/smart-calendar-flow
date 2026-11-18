/**
 * PAC-122 batch 6, Team page (manager tab) rows.
 *
 * SF-059: the footer read `last_scan_at` from local storage, which nothing
 * writes outside the demo, so it always said "Calendar has not been scanned
 * yet." even after scans. No read of the contract carries the last scan time
 * (only the scan answer's `scanned_at`), so the footer claims nothing until a
 * scan answers in this session, then shows that answer's `scanned_at`.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), info: vi.fn() }));
vi.mock("@/hooks/useToast", () => ({ toast }));

import { managerApi } from "@/api/manager";
import type { FormalTeam } from "@/api/teams";
import { TeamTab } from "./Team";

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
  render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <TeamTab activeTeam={TEAM} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
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
});
