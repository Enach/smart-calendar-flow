/**
 * The team Invite dialog and the Create team dialog suggest people from the
 * user's calendar contacts (GET /api/attendees/suggest) through the shared
 * ContactEmailAutocomplete. PAC-129: the Create team picker ADDS people
 * (AC-33); inviting answers one of four outcomes.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ApiGatewayError, ApiHttpError, ApiUnreachableError, api } from "@/api/client";
import { teamsApi, type FormalTeam, type FormalTeamMember, type TeamInviteOutcome } from "@/api/teams";
import { InviteDialog } from "@/components/team/ProtectedHoursTab";
import { AddPersonDialog, CreateTeamDialog } from "./Team";

function renderWithClient(ui: ReactElement) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

const TEAM: FormalTeam = {
  id: "team-9",
  name: "Platform",
  created_at: "2026-11-01T00:00:00Z",
  owner_email: "owner@example.com",
  members: [],
  no_meeting_zones: [],
};

const PERSON = (email: string): FormalTeamMember => ({ email, display_name: email, kind: "added", role: null, invitation: null });
const INVITED: TeamInviteOutcome = { outcome: "added_and_invited", person: PERSON("newbie@example.com") };

function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

afterEach(() => {
  vi.restoreAllMocks();
});

async function openSuggestions(name: string, query: string) {
  const input = screen.getByRole("combobox", { name });
  fireEvent.focus(input);
  fireEvent.change(input, { target: { value: query } });
  await screen.findByRole("listbox");
  return input;
}

describe("team InviteDialog suggestions", () => {
  it("suggests calendar contacts except current members, selectable by keyboard", async () => {
    const suggest = vi.spyOn(api, "suggestAttendees").mockResolvedValue([
      { email: "member@example.com", name: "Mia Member" },
      { email: "Other.Member@Example.com", name: "Otto Member" },
      { email: "newbie@example.com", name: "Nina Newbie" },
    ]);
    const invite = vi.spyOn(teamsApi.remote, "inviteMember").mockResolvedValue(INVITED);
    const onInvited = vi.fn();

    renderWithClient(
      <InviteDialog
        open
        onOpenChange={() => {}}
        teamId="team-9"
        existingEmails={["member@example.com", "other.member@example.com"]}
        onInvited={onInvited}
      />,
    );

    const input = await openSuggestions("Email", "example");
    expect(suggest).toHaveBeenCalledWith("example");

    const options = screen.getAllByRole("option");
    expect(options).toHaveLength(1);
    expect(options[0]).toHaveTextContent("Nina Newbie");
    expect(screen.queryByText("Mia Member")).not.toBeInTheDocument();
    expect(screen.queryByText("Otto Member")).not.toBeInTheDocument();

    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(input).toHaveValue("newbie@example.com");
    expect(screen.getByPlaceholderText("Alex Carter")).toHaveValue("Nina Newbie");
    // Enter on a highlighted suggestion selects it; it does not send the invite.
    expect(invite).not.toHaveBeenCalled();

    // A second Enter, with nothing highlighted, sends it.
    fireEvent.keyDown(input, { key: "Enter" });
    await waitFor(() => expect(invite).toHaveBeenCalledWith("team-9", "newbie@example.com", "Nina Newbie"));
    await waitFor(() => expect(onInvited).toHaveBeenCalled());
  });

  it("Escape on an open suggestion list closes the list, not the dialog", async () => {
    vi.spyOn(api, "suggestAttendees").mockResolvedValue([{ email: "nina@example.com", name: "Nina" }]);
    const onOpenChange = vi.fn();
    renderWithClient(
      <InviteDialog open onOpenChange={onOpenChange} teamId="team-9" existingEmails={[]} onInvited={() => {}} />,
    );

    const input = await openSuggestions("Email", "nina");
    fireEvent.keyDown(input, { key: "Escape" });
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(onOpenChange).not.toHaveBeenCalled();
    expect(input).toHaveValue("nina");

    // With the list closed, Escape closes the dialog as usual.
    fireEvent.keyDown(input, { key: "Escape" });
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("sends one invite for a double Enter", async () => {
    vi.spyOn(api, "suggestAttendees").mockResolvedValue([]);
    const pending = deferred<TeamInviteOutcome>();
    const invite = vi.spyOn(teamsApi.remote, "inviteMember").mockReturnValue(pending.promise);
    renderWithClient(
      <InviteDialog open onOpenChange={() => {}} teamId="team-9" existingEmails={[]} onInvited={() => {}} />,
    );

    const input = screen.getByRole("combobox", { name: "Email" });
    fireEvent.change(input, { target: { value: "sam@example.com" } });
    fireEvent.keyDown(input, { key: "Enter" });
    fireEvent.keyDown(input, { key: "Enter" });
    pending.resolve(INVITED);
    await waitFor(() => expect(invite).toHaveBeenCalledTimes(1));
  });

  it("says when the contact search failed and still lets an address be typed", async () => {
    vi.spyOn(api, "suggestAttendees").mockRejectedValue(new ApiUnreachableError("network"));
    renderWithClient(
      <InviteDialog open onOpenChange={() => {}} teamId="team-9" existingEmails={[]} onInvited={() => {}} />,
    );

    const input = screen.getByRole("combobox", { name: "Email" });
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "sam" } });
    const notice = await screen.findByText(/search your calendar contacts/);
    expect(notice).toHaveAttribute("role", "status");
    expect(screen.queryByRole("option")).not.toBeInTheDocument();
  });
});

describe("AddPersonDialog", () => {
  it("Escape on an open suggestion list closes the list, not the dialog", async () => {
    vi.spyOn(api, "suggestAttendees").mockResolvedValue([{ email: "nina@example.com", name: "Nina" }]);
    const onOpenChange = vi.fn();
    renderWithClient(<AddPersonDialog open teamId="team-1" onOpenChange={onOpenChange} onAdded={() => {}} />);

    const input = await openSuggestions("Email", "nina");
    fireEvent.keyDown(input, { key: "Escape" });
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(onOpenChange).not.toHaveBeenCalled();
    expect(input).toHaveValue("nina");
  });
});

describe("CreateTeamDialog initial people (PAC-129 AC-33: added, never invited)", () => {
  function addInvitee(email: string) {
    const input = screen.getByRole("combobox", { name: "Add by email" });
    fireEvent.change(input, { target: { value: email } });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));
  }

  function typeTeamName() {
    fireEvent.change(screen.getByPlaceholderText("Platform team"), { target: { value: "Platform" } });
  }

  it("is labelled Add people and never uses invite wording", () => {
    renderWithClient(<CreateTeamDialog open onOpenChange={() => {}} onCreated={() => {}} />);
    expect(screen.getByText(/^Add people/)).toBeInTheDocument();
    expect(screen.queryByText(/Invite people/)).not.toBeInTheDocument();
    addInvitee("a@example.com");
    expect(screen.getByTestId("create-team-add-notice")).toHaveTextContent("Paceday sends them no email.");
    expect(document.body).not.toHaveTextContent(/invites? sent/i);
  });

  it("adds each person after the team is created, sends no invitation, and closes when all succeed", async () => {
    vi.spyOn(api, "suggestAttendees").mockResolvedValue([]);
    const create = vi.spyOn(teamsApi.remote, "createTeam").mockResolvedValue(TEAM);
    const add = vi.spyOn(teamsApi.remote, "addPerson").mockImplementation(async (_t, email) => PERSON(email));
    const invite = vi.spyOn(teamsApi.remote, "inviteMember");
    const onCreated = vi.fn();
    const onOpenChange = vi.fn();

    renderWithClient(<CreateTeamDialog open onOpenChange={onOpenChange} onCreated={onCreated} />);
    typeTeamName();
    addInvitee("a@example.com");
    addInvitee("B@example.com");
    addInvitee("a@example.com"); // de-duplicated
    expect(screen.getByRole("list", { name: "People to add" }).children).toHaveLength(2);

    fireEvent.click(screen.getByRole("button", { name: "Create and add" }));

    await waitFor(() => expect(onCreated).toHaveBeenCalledWith(TEAM));
    expect(create).toHaveBeenCalledWith("Platform");
    expect(add.mock.calls).toEqual([
      ["team-9", "a@example.com"],
      ["team-9", "b@example.com"],
    ]);
    expect(invite).not.toHaveBeenCalled();
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("includes an address that was typed but not added", async () => {
    vi.spyOn(api, "suggestAttendees").mockResolvedValue([]);
    vi.spyOn(teamsApi.remote, "createTeam").mockResolvedValue(TEAM);
    const add = vi.spyOn(teamsApi.remote, "addPerson").mockImplementation(async (_t, email) => PERSON(email));
    const onCreated = vi.fn();

    renderWithClient(<CreateTeamDialog open onOpenChange={() => {}} onCreated={onCreated} />);
    typeTeamName();
    fireEvent.change(screen.getByRole("combobox", { name: "Add by email" }), { target: { value: "Late@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: "Create and add" }));

    await waitFor(() => expect(onCreated).toHaveBeenCalledWith(TEAM));
    expect(add.mock.calls).toEqual([["team-9", "late@example.com"]]);
  });

  it("does not create the team while a typed address is invalid", () => {
    const create = vi.spyOn(teamsApi.remote, "createTeam");
    renderWithClient(<CreateTeamDialog open onOpenChange={() => {}} onCreated={() => {}} />);
    typeTeamName();
    fireEvent.change(screen.getByRole("combobox", { name: "Add by email" }), { target: { value: "not-an-email" } });
    fireEvent.click(screen.getByRole("button", { name: "Create and add" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Enter a valid email address.");
    expect(create).not.toHaveBeenCalled();
  });

  it("rejects an invalid address before it is added", () => {
    renderWithClient(<CreateTeamDialog open onOpenChange={() => {}} onCreated={() => {}} />);
    addInvitee("not-an-email");
    expect(screen.getByRole("alert")).toHaveTextContent("Enter a valid email address.");
    expect(screen.queryByRole("list", { name: "People to add" })).not.toBeInTheDocument();
  });

  it("reports each address as added, refused with the server's reason, or unknown — honestly", async () => {
    vi.spyOn(api, "suggestAttendees").mockResolvedValue([]);
    vi.spyOn(teamsApi.remote, "createTeam").mockResolvedValue(TEAM);
    vi.spyOn(teamsApi.remote, "addPerson").mockImplementation(async (_teamId, email) => {
      if (email === "ok@example.com") return PERSON(email);
      if (email === "gone@example.com") throw new ApiUnreachableError("network");
      if (email === "proxy@example.com") throw new ApiGatewayError(502);
      if (email === "boom@example.com") throw new ApiHttpError(500, { error: "internal" }, "internal");
      const reason = "this address belongs to a Paceday member of this team";
      throw new ApiHttpError(422, { error: reason }, reason);
    });
    const onCreated = vi.fn();
    const onOpenChange = vi.fn();

    renderWithClient(<CreateTeamDialog open onOpenChange={onOpenChange} onCreated={onCreated} />);
    typeTeamName();
    for (const email of ["ok@example.com", "gone@example.com", "proxy@example.com", "boom@example.com", "dup@example.com"]) {
      addInvitee(email);
    }
    fireEvent.click(screen.getByRole("button", { name: "Create and add" }));

    const result = await screen.findByTestId("create-team-add-result");
    expect(result).toHaveTextContent("1 added.");
    expect(result).not.toHaveTextContent(/invites? sent/i);
    const outcomes = screen.getAllByTestId("create-team-add-outcome").map((li) => li.textContent);
    expect(outcomes).toEqual([
      "ok@example.com: added",
      "dup@example.com: refused: this address belongs to a Paceday member of this team",
      "gone@example.com: unknown",
      "proxy@example.com: unknown",
      "boom@example.com: unknown",
    ]);
    expect(screen.getByRole("alert")).not.toHaveTextContent("gone@example.com");
    expect(screen.getByTestId("create-team-add-unknown")).not.toHaveTextContent("dup@example.com");

    // The team exists, but the dialog stays until the user has read the result.
    expect(onCreated).not.toHaveBeenCalled();
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    expect(onCreated).toHaveBeenCalledWith(TEAM);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("refuses every close path while the team is created and its people added", async () => {
    vi.spyOn(api, "suggestAttendees").mockResolvedValue([]);
    vi.spyOn(teamsApi.remote, "createTeam").mockResolvedValue(TEAM);
    const pending = deferred<FormalTeamMember>();
    vi.spyOn(teamsApi.remote, "addPerson").mockReturnValue(pending.promise);
    const onCreated = vi.fn();
    const onOpenChange = vi.fn();

    renderWithClient(<CreateTeamDialog open onOpenChange={onOpenChange} onCreated={onCreated} />);
    typeTeamName();
    addInvitee("a@example.com");
    fireEvent.click(screen.getByRole("button", { name: "Create and add" }));
    await screen.findByRole("button", { name: "Creating…" });

    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Close" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape" });
    fireEvent.pointerDown(document.body);
    expect(onOpenChange).not.toHaveBeenCalled();

    pending.resolve(PERSON("a@example.com"));
    await waitFor(() => expect(onCreated).toHaveBeenCalledWith(TEAM));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("adds nobody when the team could not be created", async () => {
    vi.spyOn(api, "suggestAttendees").mockResolvedValue([]);
    vi.spyOn(teamsApi.remote, "createTeam").mockRejectedValue(new ApiHttpError(400, { error: "bad name" }, "bad name"));
    const add = vi.spyOn(teamsApi.remote, "addPerson");
    const onCreated = vi.fn();

    renderWithClient(<CreateTeamDialog open onOpenChange={() => {}} onCreated={onCreated} />);
    typeTeamName();
    addInvitee("a@example.com");
    fireEvent.click(screen.getByRole("button", { name: "Create and add" }));

    await screen.findByRole("alert");
    expect(add).not.toHaveBeenCalled();
    expect(onCreated).not.toHaveBeenCalled();
    // The typed person is kept for a retry.
    expect(screen.getByRole("list", { name: "People to add" })).toHaveTextContent("a@example.com");
  });
});
