/**
 * PAC-129 web acceptance criteria at the component layer: the team add form
 * (AC-3), removal (AC-15), invitations (AC-18, AC-21), Find a time counts and
 * navigation (AC-10, AC-36), analytics (AC-16) and Manager mode (AC-32).
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactElement } from "react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ApiHttpError, api } from "@/api/client";
import { managerApi, type TeamMember } from "@/api/manager";
import { teamsApi, type FormalTeam, type FormalTeamMember, type TeamAnalyticsView } from "@/api/teams";
import { toast } from "@/hooks/useToast";
import { schedulePrefillText } from "@/lib/schedulePrefill";
import { AnalyticsTab } from "./AnalyticsTab";
import { FindATimeTab } from "./FindATimeTab";
import { AddToTeamDialog, InviteDialog, ManageMembersSheet } from "./ProtectedHoursTab";
import { AddPersonDialog, MemberRow } from "@/pages/Team";
import { ADD_TO_TEAM_NOTICE } from "./teamTexts";

function renderWithClient(ui: ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>,
  );
}

const person = (email: string, over: Partial<FormalTeamMember> = {}): FormalTeamMember => ({
  email,
  display_name: email,
  kind: "added",
  role: null,
  invitation: null,
  ...over,
});

const OWNER = person("owner@co.example", { display_name: "Olive", kind: "paceday", role: "owner" });
const MAX = person("max@co.example", { display_name: "Max", kind: "paceday", role: "member" });
const PAT = person("pat@ext.example", { display_name: "Pat" });
const SAM = person("sam@acme.example", { display_name: "Sam", invitation: { expires_at: "2030-12-01T12:00:00Z" } });

const TEAM: FormalTeam = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "Platform",
  created_at: "2026-01-01T00:00:00Z",
  owner_email: OWNER.email,
  members: [OWNER, MAX, PAT, SAM],
  no_meeting_zones: [],
};

let success: ReturnType<typeof vi.spyOn>;
let failure: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  success = vi.spyOn(toast, "success");
  failure = vi.spyOn(toast, "error");
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe("AC-3: the team add form", () => {
  it("shows the four required statements before submitting", () => {
    renderWithClient(<AddToTeamDialog open onOpenChange={() => {}} teamId={TEAM.id} existingEmails={[]} onAdded={() => {}} />);
    const dialog = screen.getByRole("dialog", { name: "Add to team without Paceday access" });
    const notice = screen.getByTestId("team-add-person-notice");
    expect(dialog).toContainElement(notice);
    expect(notice).toHaveTextContent(ADD_TO_TEAM_NOTICE);
    expect(notice).toHaveTextContent("You are responsible for having a reason to add this person.");
    expect(notice).toHaveTextContent("Paceday sends them no email.");
    expect(notice).toHaveTextContent("Every member of this team will see their name and email.");
    expect(notice).toHaveTextContent("their free/busy is read through your calendar connection.");
  });

  it("suggests contacts except members of both kinds; a choice fills email and name; success says added", async () => {
    vi.spyOn(api, "suggestAttendees").mockResolvedValue([
      { email: "max@co.example", name: "Max" },
      { email: "PAT@ext.example", name: "Pat" },
      { email: "sam@acme.example", name: "Sam" },
      { email: "nina@new.example", name: "Nina New" },
    ]);
    const add = vi.spyOn(teamsApi.remote, "addPerson").mockResolvedValue(person("nina@new.example", { display_name: "Nina New" }));
    const onAdded = vi.fn();
    const onOpenChange = vi.fn();
    renderWithClient(
      <AddToTeamDialog
        open
        onOpenChange={onOpenChange}
        teamId={TEAM.id}
        existingEmails={TEAM.members.map((m) => m.email)}
        onAdded={onAdded}
      />,
    );
    const input = screen.getByRole("combobox", { name: "Email" });
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "ni" } });
    await screen.findByRole("listbox");
    const options = screen.getAllByRole("option");
    expect(options).toHaveLength(1);
    expect(options[0]).toHaveTextContent("Nina New");

    fireEvent.click(screen.getByRole("button", { name: /Nina New/ }));
    expect(input).toHaveValue("nina@new.example");
    expect(screen.getByPlaceholderText("Alex Carter")).toHaveValue("Nina New");

    fireEvent.click(screen.getByTestId("team-add-person-submit"));
    await waitFor(() => expect(add).toHaveBeenCalledWith(TEAM.id, "nina@new.example", "Nina New"));
    await waitFor(() => expect(success).toHaveBeenCalledWith("Nina New added."));
    expect(String(success.mock.calls[0][0])).not.toMatch(/sent|invited/i);
    // The caller refreshes the team: the entry appears without a reload.
    expect(onAdded).toHaveBeenCalled();
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it.each([
    "you cannot add your own address",
    "this address belongs to a Paceday member of this team",
    "this team has reached its limit of 50 members; remove someone before adding another",
    "email must be a valid email address",
  ])("shows the 422 text verbatim: %s", async (text) => {
    vi.spyOn(api, "suggestAttendees").mockResolvedValue([]);
    vi.spyOn(teamsApi.remote, "addPerson").mockRejectedValue(new ApiHttpError(422, { error: text }, text));
    renderWithClient(<AddToTeamDialog open onOpenChange={() => {}} teamId={TEAM.id} existingEmails={[]} onAdded={() => {}} />);
    fireEvent.change(screen.getByRole("combobox", { name: "Email" }), { target: { value: "a@b.example" } });
    fireEvent.click(screen.getByTestId("team-add-person-submit"));
    expect(await screen.findByRole("alert")).toHaveTextContent(text);
    expect(success).not.toHaveBeenCalled();
    // The typed address is kept.
    expect(screen.getByRole("combobox", { name: "Email" })).toHaveValue("a@b.example");
  });

  it("a 403 or a lost answer is an error, never 'added'", async () => {
    vi.spyOn(api, "suggestAttendees").mockResolvedValue([]);
    vi.spyOn(teamsApi.remote, "addPerson").mockRejectedValue(new ApiHttpError(403, { error: "forbidden" }, "forbidden"));
    renderWithClient(<AddToTeamDialog open onOpenChange={() => {}} teamId={TEAM.id} existingEmails={[]} onAdded={() => {}} />);
    fireEvent.change(screen.getByRole("combobox", { name: "Email" }), { target: { value: "a@b.example" } });
    fireEvent.click(screen.getByTestId("team-add-person-submit"));
    expect(await screen.findByRole("alert")).toHaveTextContent("forbidden");
    expect(success).not.toHaveBeenCalled();
  });
});

describe("member list: two kinds (contract §9.1)", () => {
  it("labels added people, shows an invitation only when the server sent one, and offers Invite to Paceday", () => {
    vi.spyOn(teamsApi, "currentUserEmail").mockReturnValue(OWNER.email);
    const onInvite = vi.fn();
    renderWithClient(<ManageMembersSheet open onOpenChange={() => {}} team={TEAM} onChanged={() => {}} onInvite={onInvite} />);
    const pat = screen.getByTestId("team-person-pat@ext.example");
    expect(pat).toHaveTextContent("Added (no Paceday access)");
    expect(pat).not.toHaveTextContent("On Paceday");
    expect(pat).not.toHaveTextContent("Invited");
    expect(screen.getByTestId("team-person-sam@acme.example")).toHaveTextContent(/Invited · expires Dec 1, 2030/);
    expect(screen.getByTestId("team-person-max@co.example")).not.toHaveTextContent("Added (no Paceday access)");
    // Invite to Paceday is offered on an added person without a pending invitation only.
    expect(screen.getAllByRole("button", { name: "Invite to Paceday" })).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "Invite to Paceday" }));
    expect(onInvite).toHaveBeenCalledWith(PAT);
  });

  it("a non-owner sees no remove and no invite control", () => {
    vi.spyOn(teamsApi, "currentUserEmail").mockReturnValue(MAX.email);
    renderWithClient(<ManageMembersSheet open onOpenChange={() => {}} team={TEAM} onChanged={() => {}} onInvite={() => {}} />);
    expect(screen.queryByRole("button", { name: /^Remove / })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Invite to Paceday" })).not.toBeInTheDocument();
  });
});

describe("AC-15 (web, SF-089): removal says 'removed' only on a confirmed removal", () => {
  beforeEach(() => {
    vi.spyOn(teamsApi, "currentUserEmail").mockReturnValue(OWNER.email);
  });

  it("removes an added person by address and says removed", async () => {
    const remove = vi.spyOn(teamsApi.remote, "removeMember").mockResolvedValue(undefined);
    const onChanged = vi.fn();
    renderWithClient(<ManageMembersSheet open onOpenChange={() => {}} team={TEAM} onChanged={onChanged} onInvite={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "Remove Pat" }));
    await waitFor(() => expect(remove).toHaveBeenCalledWith(TEAM.id, "pat@ext.example"));
    await waitFor(() => expect(success).toHaveBeenCalledWith("Pat removed."));
    expect(onChanged).toHaveBeenCalled();
  });

  it("removes a Paceday member through the same call", async () => {
    const remove = vi.spyOn(teamsApi.remote, "removeMember").mockResolvedValue(undefined);
    renderWithClient(<ManageMembersSheet open onOpenChange={() => {}} team={TEAM} onChanged={() => {}} onInvite={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "Remove Max" }));
    await waitFor(() => expect(remove).toHaveBeenCalledWith(TEAM.id, "max@co.example"));
  });

  it("on the 404 says the person is not on the team, never 'removed'", async () => {
    vi.spyOn(teamsApi.remote, "removeMember").mockRejectedValue(new ApiHttpError(404, { error: "person not found" }, "person not found"));
    const onChanged = vi.fn();
    renderWithClient(<ManageMembersSheet open onOpenChange={() => {}} team={TEAM} onChanged={onChanged} onInvite={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "Remove Pat" }));
    await waitFor(() => expect(failure).toHaveBeenCalledWith("pat@ext.example is not on this team."));
    expect(success).not.toHaveBeenCalled();
    expect(onChanged).not.toHaveBeenCalled();
  });

  it("on the 422 shows the server text", async () => {
    vi.spyOn(teamsApi.remote, "removeMember").mockRejectedValue(
      new ApiHttpError(422, { error: "the team owner cannot be removed" }, "the team owner cannot be removed"),
    );
    renderWithClient(<ManageMembersSheet open onOpenChange={() => {}} team={TEAM} onChanged={() => {}} onInvite={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "Remove Max" }));
    await waitFor(() => expect(failure).toHaveBeenCalledWith("the team owner cannot be removed"));
    expect(success).not.toHaveBeenCalled();
  });
});

describe("AC-18, AC-21: Invite to Paceday", () => {
  it.each([
    ["added_and_invited", "sam@acme.example added to the team and invited to Paceday."],
    ["invited", "sam@acme.example invited to Paceday. They were already on the team."],
    ["already_pending", "sam@acme.example already has a pending invitation."],
    ["already_member", "sam@acme.example is already a Paceday member of this team."],
  ] as const)("outcome %s: %s", async (outcome, text) => {
    vi.spyOn(api, "suggestAttendees").mockResolvedValue([]);
    const invite = vi.spyOn(teamsApi.remote, "inviteMember").mockResolvedValue({ outcome, person: SAM });
    renderWithClient(<InviteDialog open onOpenChange={() => {}} teamId={TEAM.id} existingEmails={[]} onInvited={() => {}} />);
    expect(screen.getByRole("dialog", { name: "Invite to Paceday" })).not.toHaveTextContent(/Pending until they accept/);
    fireEvent.change(screen.getByRole("combobox", { name: "Email" }), { target: { value: "sam@acme.example" } });
    fireEvent.change(screen.getByPlaceholderText("Alex Carter"), { target: { value: "Sam" } });
    fireEvent.click(screen.getByTestId("team-invite-submit"));
    // AC-21: the name typed reaches the server.
    await waitFor(() => expect(invite).toHaveBeenCalledWith(TEAM.id, "sam@acme.example", "Sam"));
    await waitFor(() => expect(success).toHaveBeenCalledWith(text));
    expect(String(success.mock.calls[0][0])).not.toMatch(/Invite sent/);
  });

  it("opened on an added person, it is prefilled with their address and name", () => {
    vi.spyOn(api, "suggestAttendees").mockResolvedValue([]);
    renderWithClient(
      <InviteDialog open onOpenChange={() => {}} teamId={TEAM.id} existingEmails={[]} initialEmail="pat@ext.example" initialName="Pat" onInvited={() => {}} />,
    );
    expect(screen.getByRole("combobox", { name: "Email" })).toHaveValue("pat@ext.example");
    expect(screen.getByPlaceholderText("Alex Carter")).toHaveValue("Pat");
  });
});

describe("AC-10 (web) and AC-36: Find a time", () => {
  function LocationProbe() {
    const location = useLocation();
    return <div data-testid="probe" data-search={location.search} data-state={JSON.stringify(location.state)} />;
  }

  it("shows the server's counts, with unknown never presented as free, and passes attendees in app state", async () => {
    vi.spyOn(teamsApi, "currentUserEmail").mockReturnValue(OWNER.email);
    vi.spyOn(teamsApi.remote, "findSlots").mockResolvedValue([
      { start: "2030-03-04T14:00:00Z", end: "2030-03-04T15:00:00Z", score: 90, free_count: 3, unknown_count: 3, total_count: 6 },
      { start: "2030-03-04T16:00:00Z", end: "2030-03-04T17:00:00Z", score: 80, free_count: 6, unknown_count: 0, total_count: 6 },
    ]);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={["/team"]}>
          <Routes>
            <Route path="/team" element={<FindATimeTab team={TEAM} />} />
            <Route path="/app" element={<LocationProbe />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: /find slots/i }));
    const counts = await screen.findAllByTestId("team-slot-counts");
    expect(counts.map((c) => c.textContent)).toEqual(["3 of 6 free · 3 unknown", "6 of 6 free"]);

    await act(async () => {
      fireEvent.click(screen.getAllByRole("button", { name: /schedule meeting/i })[0]);
    });
    const probe = await screen.findByTestId("probe");
    const search = probe.getAttribute("data-search") ?? "";
    expect(search).not.toMatch(/@|%40|attendees/);
    const state = JSON.parse(probe.getAttribute("data-state") ?? "null");
    // Every member of both kinds except the user.
    expect(state.attendees).toEqual(["max@co.example", "pat@ext.example", "sam@acme.example"]);
    // The scheduling form shows them.
    expect(schedulePrefillText(search, state)).toBe("Schedule 30m Platform sync with max@co.example, pat@ext.example, sam@acme.example");
  });

  it("the prefill still reads a Manager link's attendees from the address", () => {
    expect(schedulePrefillText("?title=1%3A1&attendees=a%40b.example&duration=30", null)).toBe("Schedule 30m 1:1 with a@b.example");
    expect(schedulePrefillText("", null)).toBeNull();
  });
});

describe("AC-16 (web): team analytics", () => {
  const VIEW: TeamAnalyticsView = {
    week_start: "2026-10-05",
    avg_meeting_minutes: 600,
    avg_focus_minutes: 300,
    rows: [
      { email: "owner@co.example", display_name: "Olive", kind: "paceday", figures: "measured", meeting_minutes: 600, focus_minutes: 300, focus_score: 33 },
      { email: "alex@co.example", display_name: "Alex", kind: "paceday", figures: "measured", meeting_minutes: 120, focus_minutes: 480, focus_score: 80 },
      { email: "alex@ext.example", display_name: "Alex", kind: "added", figures: "measured", meeting_minutes: 300, focus_minutes: null, focus_score: null },
      { email: "p2@co.example", display_name: "P2", kind: "paceday", figures: "no_data", meeting_minutes: null, focus_minutes: null, focus_score: null },
      { email: "x@ext.example", display_name: "X", kind: "added", figures: "withheld", meeting_minutes: null, focus_minutes: null, focus_score: null },
    ],
  };

  it("renders each row's own figures, availability only for added, no data / withheld texts, and the requested week", async () => {
    const fetchAnalytics = vi.spyOn(teamsApi.remote, "teamAnalytics").mockResolvedValue(VIEW);
    renderWithClient(<AnalyticsTab activeTeam={TEAM} onCreateTeam={() => {}} />);
    fireEvent.change(screen.getByLabelText("Week of"), { target: { value: "2026-10-07" } });
    await waitFor(() => expect(fetchAnalytics).toHaveBeenLastCalledWith(TEAM.id, "2026-10-07"));
    expect(await screen.findByTestId("team-analytics-week")).toHaveTextContent("Oct 5, 2026");

    // The owner is filtered out of the per-person rows.
    expect(screen.queryByTestId("team-analytics-row-owner@co.example")).not.toBeInTheDocument();
    const alex = screen.getByTestId("team-analytics-row-alex@co.example");
    expect(alex).toHaveTextContent("2h");
    expect(alex).toHaveTextContent("8h");
    expect(alex).toHaveTextContent("80");
    const added = screen.getByTestId("team-analytics-row-alex@ext.example");
    expect(added).toHaveTextContent("Added (no Paceday access) · Availability only");
    expect(added).toHaveTextContent("5h");
    expect(added).not.toHaveTextContent("8h");
    expect(screen.getByTestId("team-analytics-row-p2@co.example")).toHaveTextContent("No data");
    expect(screen.getByTestId("team-analytics-row-p2@co.example")).not.toHaveTextContent("0m");
    expect(screen.getByTestId("team-analytics-row-x@ext.example")).toHaveTextContent("Visible to team owners only");
    // Averages are the server's.
    expect(screen.getByText("10h")).toBeInTheDocument();
    expect(screen.getByText("5h", { selector: "div" })).toBeInTheDocument();
  });

  it("the Members panel shows the Manager hint for an added person instead of figures", async () => {
    vi.spyOn(teamsApi.remote, "teamAnalytics").mockResolvedValue({ ...VIEW, rows: [VIEW.rows[2]] });
    vi.spyOn(managerApi.remote, "analytics").mockResolvedValue([]);
    renderWithClient(<AnalyticsTab activeTeam={TEAM} onCreateTeam={() => {}} />);
    fireEvent.click(await screen.findByRole("button", { name: "Members" }));
    expect(await screen.findByTestId("manager-analytics-added-hint")).toHaveTextContent(
      "Added to the team without Paceday access. Team owners see their availability in the team's Analytics tab.",
    );
  });
});

describe("AC-32: Manager mode", () => {
  const added: TeamMember = {
    email: "pat@ext.example",
    display_name: "Pat",
    cadence: "none",
    last_one_on_one: null,
    source: "added",
    is_paceday_user: false,
    data_available: false,
    added_at: "2026-01-01T00:00:00Z",
  };
  const manual: TeamMember = { ...added, email: "rae@co.example", display_name: "Rae", source: "manual", is_paceday_user: true, cadence: "weekly", data_available: true };

  function row(member: TeamMember) {
    return renderWithClient(
      <ul>
        <MemberRow
          member={member}
          analytics={null}
          analyticsLoading={false}
          expanded={false}
          onToggle={() => {}}
          onCadenceChange={() => {}}
          onRemove={() => {}}
          onSchedule={() => {}}
        />
      </ul>,
    );
  }

  it("an added person is read-only: label, hint, no cadence, no 1:1, no On Paceday", () => {
    row(added);
    expect(screen.getByTestId("manager-added-label")).toHaveTextContent("Added (no Paceday access)");
    expect(screen.getByTestId("manager-added-hint")).toHaveTextContent(
      "Added to the team without Paceday access. Add them with Add person to track 1:1s.",
    );
    expect(screen.getByTestId("manager-analytics-added-hint")).toBeInTheDocument();
    expect(screen.queryByLabelText("1:1 cadence:")).not.toBeInTheDocument();
    expect(screen.queryByTitle("Schedule 1:1")).not.toBeInTheDocument();
    expect(screen.queryByText("On Paceday")).not.toBeInTheDocument();
    // Removal still works for both kinds.
    expect(screen.getByTitle("Remove")).toBeInTheDocument();
  });

  it("a roster entry keeps today's controls", () => {
    row(manual);
    expect(screen.getByLabelText("1:1 cadence:")).toBeInTheDocument();
    expect(screen.getByTitle("Schedule 1:1")).toBeInTheDocument();
    expect(screen.getByText("On Paceday")).toBeInTheDocument();
    expect(screen.queryByText("Added (no Paceday access)")).not.toBeInTheDocument();
  });

  it("the two add controls use separate wording", () => {
    renderWithClient(<AddPersonDialog open teamId={TEAM.id} onOpenChange={() => {}} onAdded={() => {}} />);
    const manager = screen.getByRole("dialog");
    expect(manager).toHaveTextContent("1:1s");
    expect(manager).not.toHaveTextContent(/Paceday access|Add to team/);
  });

  it("the team add control does not use the Manager wording", () => {
    renderWithClient(<AddToTeamDialog open onOpenChange={() => {}} teamId={TEAM.id} existingEmails={[]} onAdded={() => {}} />);
    const team = screen.getByRole("dialog");
    expect(team).not.toHaveTextContent(/1:1|cadence|Add person/);
  });
});
