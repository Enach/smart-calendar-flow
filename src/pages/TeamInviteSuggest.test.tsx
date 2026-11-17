/**
 * The team Invite dialog and the Create team dialog suggest people from the
 * user's calendar contacts (GET /api/attendees/suggest) through the shared
 * ContactEmailAutocomplete.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ApiHttpError, ApiUnreachableError, api } from "@/api/client";
import { teamsApi, type FormalTeam } from "@/api/teams";
import { InviteDialog } from "@/components/team/ProtectedHoursTab";
import { CreateTeamDialog } from "./Team";

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

afterEach(() => {
  vi.restoreAllMocks();
});

describe("team InviteDialog suggestions", () => {
  it("suggests calendar contacts except members and pending invitees, selectable by keyboard", async () => {
    const suggest = vi.spyOn(api, "suggestAttendees").mockResolvedValue([
      { email: "member@example.com", name: "Mia Member" },
      { email: "Pending@Example.com", name: "Pat Pending" },
      { email: "newbie@example.com", name: "Nina Newbie" },
    ]);
    const invite = vi.spyOn(teamsApi.remote, "inviteMember").mockResolvedValue(null);
    const onInvited = vi.fn();

    renderWithClient(
      <InviteDialog
        open
        onOpenChange={() => {}}
        teamId="team-9"
        existingEmails={["member@example.com", "pending@example.com"]}
        onInvited={onInvited}
      />,
    );

    const input = screen.getByRole("combobox", { name: "Email" });
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "example" } });
    await waitFor(() => expect(suggest).toHaveBeenCalledWith("example"));

    const options = await screen.findAllByRole("option");
    expect(options).toHaveLength(1);
    expect(options[0]).toHaveTextContent("Nina Newbie");
    expect(screen.queryByText("Mia Member")).not.toBeInTheDocument();
    expect(screen.queryByText("Pat Pending")).not.toBeInTheDocument();

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

  it("says when the contact search failed and still lets an address be typed", async () => {
    vi.spyOn(api, "suggestAttendees").mockRejectedValue(new ApiUnreachableError("network"));
    renderWithClient(
      <InviteDialog open onOpenChange={() => {}} teamId="team-9" existingEmails={[]} onInvited={() => {}} />,
    );

    const input = screen.getByRole("combobox", { name: "Email" });
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "sam" } });
    expect(await screen.findByRole("status")).toHaveTextContent(/search your calendar contacts/);
    expect(screen.queryByRole("option")).not.toBeInTheDocument();
  });
});

describe("CreateTeamDialog initial invitees", () => {
  function addInvitee(email: string) {
    const input = screen.getByRole("combobox", { name: "Invite by email" });
    fireEvent.change(input, { target: { value: email } });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));
  }

  it("invites each person after the team is created and closes when all succeed", async () => {
    vi.spyOn(api, "suggestAttendees").mockResolvedValue([]);
    const create = vi.spyOn(teamsApi.remote, "createTeam").mockResolvedValue(TEAM);
    const invite = vi.spyOn(teamsApi.remote, "inviteMember").mockResolvedValue(null);
    const onCreated = vi.fn();
    const onOpenChange = vi.fn();

    renderWithClient(<CreateTeamDialog open onOpenChange={onOpenChange} onCreated={onCreated} />);
    fireEvent.change(screen.getByPlaceholderText("Platform team"), { target: { value: "Platform" } });
    addInvitee("a@example.com");
    addInvitee("B@example.com");
    addInvitee("a@example.com"); // de-duplicated
    expect(screen.getByRole("list", { name: "People to invite" }).children).toHaveLength(2);

    fireEvent.click(screen.getByRole("button", { name: "Create and invite" }));

    await waitFor(() => expect(onCreated).toHaveBeenCalledWith(TEAM));
    expect(create).toHaveBeenCalledWith("Platform");
    expect(invite.mock.calls).toEqual([
      ["team-9", "a@example.com"],
      ["team-9", "b@example.com"],
    ]);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("rejects an invalid address before it is added", () => {
    renderWithClient(<CreateTeamDialog open onOpenChange={() => {}} onCreated={() => {}} />);
    addInvitee("not-an-email");
    expect(screen.getByRole("alert")).toHaveTextContent("Enter a valid email address.");
    expect(screen.queryByRole("list", { name: "People to invite" })).not.toBeInTheDocument();
  });

  it("reports every address whose invite failed and claims only the invites that were sent", async () => {
    vi.spyOn(api, "suggestAttendees").mockResolvedValue([]);
    vi.spyOn(teamsApi.remote, "createTeam").mockResolvedValue(TEAM);
    vi.spyOn(teamsApi.remote, "inviteMember").mockImplementation(async (_teamId, email) => {
      if (email === "ok@example.com") return null;
      if (email === "gone@example.com") throw new ApiUnreachableError("network");
      throw new ApiHttpError(409, { error: "already invited" }, "already invited");
    });
    const onCreated = vi.fn();
    const onOpenChange = vi.fn();

    renderWithClient(<CreateTeamDialog open onOpenChange={onOpenChange} onCreated={onCreated} />);
    fireEvent.change(screen.getByPlaceholderText("Platform team"), { target: { value: "Platform" } });
    addInvitee("ok@example.com");
    addInvitee("gone@example.com");
    addInvitee("dup@example.com");
    fireEvent.click(screen.getByRole("button", { name: "Create and invite" }));

    const result = await screen.findByTestId("create-team-invite-result");
    expect(result).toHaveTextContent("Invites sent to 1 person.");
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("These 2 invites were not sent:");
    expect(alert).toHaveTextContent("gone@example.com");
    expect(alert).toHaveTextContent("dup@example.com");
    expect(alert).not.toHaveTextContent("ok@example.com");
    // A lost answer to a write is not claimed either way (PAC-83).
    expect(alert).toHaveTextContent(/may or may not/i);

    // The team exists, but the dialog stays until the user has read the result.
    expect(onCreated).not.toHaveBeenCalled();
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    expect(onCreated).toHaveBeenCalledWith(TEAM);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("sends no invite when the team could not be created", async () => {
    vi.spyOn(api, "suggestAttendees").mockResolvedValue([]);
    vi.spyOn(teamsApi.remote, "createTeam").mockRejectedValue(new ApiHttpError(400, { error: "bad name" }, "bad name"));
    const invite = vi.spyOn(teamsApi.remote, "inviteMember");
    const onCreated = vi.fn();

    renderWithClient(<CreateTeamDialog open onOpenChange={() => {}} onCreated={onCreated} />);
    fireEvent.change(screen.getByPlaceholderText("Platform team"), { target: { value: "Platform" } });
    addInvitee("a@example.com");
    fireEvent.click(screen.getByRole("button", { name: "Create and invite" }));

    await screen.findByRole("alert");
    expect(invite).not.toHaveBeenCalled();
    expect(onCreated).not.toHaveBeenCalled();
    // The typed invitee is kept for a retry.
    expect(screen.getByRole("list", { name: "People to invite" })).toHaveTextContent("a@example.com");
  });
});
