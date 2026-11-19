/**
 * PAC-130 (contract clockwise-like contracts/features/PAC-130.md §5, spec
 * AC-14, AC-6): Manager mode must not reveal whether an address has a Paceday
 * account.
 *
 * - "On Paceday" renders only from the server's `is_paceday_user`, which now
 *   means "visible on Paceday" to the viewer (spec D-1), for every source.
 * - The estimated-figures note never says or implies the person has no
 *   Paceday account (the exact text is the contract's).
 * - Stable test ids for the AC-6 e2e journey (api repo e2e/), so it can
 *   compare an {H} roster with an {N} roster row by row.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import type { ReactElement } from "react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), info: vi.fn() }));
vi.mock("@/hooks/useToast", () => ({ toast }));

import { managerApi, type MemberAnalytics, type TeamMember } from "@/api/manager";
import type { ManagerMemberWire } from "@/contracts/managerTeam";
import type { FormalTeam } from "@/api/teams";
import { MemberRow, TeamTab } from "./Team";

const NOTE = "Meeting time estimated from your calendar. Focus time is shown only for Paceday members of your teams who share it.";
const BADGE_MEANING = "Visible on Paceday: a Paceday member of one of your teams, or of your organisation";

function withClient(ui: ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>,
  );
}

const member = (over: Partial<TeamMember> = {}): TeamMember => ({
  email: "hold@ext.example",
  display_name: "Hold",
  cadence: "weekly",
  source: "manual",
  is_paceday_user: false,
  data_available: true,
  added_at: "2026-01-01T00:00:00Z",
  ...over,
});

const analyticsFor = (m: TeamMember, over: Partial<MemberAnalytics> = {}): MemberAnalytics => ({
  email: m.email,
  is_paceday_user: m.is_paceday_user,
  data_available: true,
  one_on_ones: [],
  weeks: [
    { week_start: "2026-11-09", meeting_minutes: 300, focus_minutes: 0, free_minutes: 2100, data_available: true },
    { week_start: "2026-11-16", meeting_minutes: 240, focus_minutes: 0, free_minutes: 2160, data_available: true },
  ],
  ...over,
});

function row(m: TeamMember, analytics: MemberAnalytics | null = null, expanded = false) {
  return withClient(
    <ul>
      <MemberRow
        member={m}
        analytics={analytics}
        analyticsLoading={false}
        analyticsFailed={false}
        expanded={expanded}
        onToggle={() => {}}
        onCadenceChange={() => {}}
        onRemove={() => {}}
        onSchedule={() => {}}
      />
    </ul>,
  );
}

afterEach(() => vi.restoreAllMocks());

describe("PAC-130 AC-14: 'On Paceday' only from the server's flag", () => {
  for (const source of ["manual", "auto", "formal"] as const) {
    it(`source ${source}: flag true shows the badge, with the visibility meaning`, () => {
      row(member({ source, is_paceday_user: true }));
      const badge = screen.getByTestId("manager-paceday-badge");
      expect(badge).toHaveTextContent(/^On Paceday$/);
      // The meaning reaches keyboard and screen-reader users: the badge is
      // focusable and described, not hidden in a hover-only title.
      expect(badge).toHaveAttribute("tabindex", "0");
      expect(badge).not.toHaveAttribute("title");
      expect(badge).toHaveAccessibleDescription(BADGE_MEANING);
    });

    it(`source ${source}: flag false shows no badge, whatever the address`, () => {
      // A paceday.com address is no hint: the client never infers the flag.
      row(member({ source, email: "someone@paceday.com", is_paceday_user: false }));
      expect(screen.queryByTestId("manager-paceday-badge")).not.toBeInTheDocument();
      expect(screen.queryByText("On Paceday")).not.toBeInTheDocument();
    });
  }

  it("source added: never a badge, even with the flag set", () => {
    row(member({ source: "added", is_paceday_user: true }));
    expect(screen.queryByTestId("manager-paceday-badge")).not.toBeInTheDocument();
  });
});

describe("PAC-130 AC-14: the estimated-figures note claims nothing about an account", () => {
  it("an estimated row shows the contract's exact note", () => {
    const m = member();
    row(m, analyticsFor(m), true);
    const note = screen.getByTestId("manager-estimate-note");
    expect(note.textContent).toBe(NOTE);
  });

  it("no text in an estimated row says the person is not a Paceday user", () => {
    const m = member();
    const { container } = row(m, analyticsFor(m), true);
    expect(container.textContent).not.toMatch(/non-Paceday/i);
    expect(container.textContent).not.toMatch(/not (on|a) Paceday|no Paceday account|not available for/i);
  });

  it("a row visible on Paceday shows no estimate note", () => {
    const m = member({ is_paceday_user: true });
    row(m, analyticsFor(m), true);
    expect(screen.queryByTestId("manager-estimate-note")).not.toBeInTheDocument();
  });
});

describe("PAC-130 AC-6 hooks: stable test ids for the e2e oracle journey", () => {
  it("each row and its focus figure carry the address-keyed ids (TESTIDS-REQUIRED §3)", () => {
    const m = member({ email: "r@other.example", is_paceday_user: true });
    const analytics = analyticsFor(m, {
      weeks: [
        { week_start: "2026-11-09", meeting_minutes: 300, focus_minutes: 600, free_minutes: 1500, data_available: true },
        { week_start: "2026-11-16", meeting_minutes: 240, focus_minutes: 615, free_minutes: 1545, data_available: true },
      ],
    });
    row(m, analytics);
    const li = screen.getByTestId("manager-member-row-r@other.example");
    expect(li.tagName).toBe("LI");
    expect(within(li).getByTestId("manager-member-focus-r@other.example")).toHaveTextContent("10h 15m");
  });
});

const TEAM_ID = "6f1c2b9e-3d4a-4e5f-8a7b-0c1d2e3f4a5b";
const TEAM: FormalTeam = {
  id: TEAM_ID,
  name: "Platform",
  created_at: "2026-01-01T00:00:00Z",
  owner_email: "v@v.example",
  members: [],
  no_meeting_zones: [],
};

function wire(email: string, measured: boolean): ManagerMemberWire {
  const week = { focus_minutes: 0, meeting_minutes: measured ? 240 : 0, free_minutes: measured ? 2160 : 0, data_available: measured };
  return {
    email,
    display_name: "Person",
    source: "manual",
    cadence: "weekly",
    cadence_custom_days: null,
    last_one_on_one_at: null,
    is_paceday_user: false,
    this_week: week,
    last_week: week,
    focus_trend_pct: 0,
  };
}

describe("PAC-130 AC-6 hooks: the degraded banner keeps its rule and gains a test id", () => {
  beforeEach(() => {
    vi.spyOn(managerApi.remote, "gaps").mockResolvedValue([]);
    vi.spyOn(managerApi.remote, "analytics").mockResolvedValue([]);
  });

  it("an unmeasured row raises the banner", async () => {
    vi.spyOn(managerApi.remote, "listTeam").mockResolvedValue({ team_id: TEAM_ID, members: [wire("none@ext.example", false)] });
    withClient(<TeamTab activeTeam={TEAM} />);
    const banner = await screen.findByTestId("manager-degraded-banner");
    expect(banner).toHaveTextContent("Some calendar analytics are unavailable. All 1 team members remain visible.");
  });

  it("a measured row does not", async () => {
    vi.spyOn(managerApi.remote, "listTeam").mockResolvedValue({ team_id: TEAM_ID, members: [wire("none@ext.example", true)] });
    withClient(<TeamTab activeTeam={TEAM} />);
    await screen.findByTestId("manager-member-row-none@ext.example");
    expect(screen.queryByTestId("manager-degraded-banner")).not.toBeInTheDocument();
  });
});
