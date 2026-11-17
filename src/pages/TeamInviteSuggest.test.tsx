/**
 * The team Invite dialog and the Create team dialog suggest people from the
 * user's calendar contacts (GET /api/attendees/suggest) through the shared
 * ContactEmailAutocomplete.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ApiGatewayError, ApiHttpError, ApiUnreachableError, api } from "@/api/client";
import { teamsApi, type FormalTeam, type FormalTeamMember } from "@/api/teams";
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
    const invite = vi.spyOn(teamsApi.remote, "inviteMember").mockResolvedValue(null);
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
    const pending = deferred<FormalTeamMember | null>();
    const invite = vi.spyOn(teamsApi.remote, "inviteMember").mockReturnValue(pending.promise);
    renderWithClient(
      <InviteDialog open onOpenChange={() => {}} teamId="team-9" existingEmails={[]} onInvited={() => {}} />,
    );

    const input = screen.getByRole("combobox", { name: "Email" });
    fireEvent.change(input, { target: { value: "sam@example.com" } });
    fireEvent.keyDown(input, { key: "Enter" });
    fireEvent.keyDown(input, { key: "Enter" });
    pending.resolve(null);
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

describe("CreateTeamDialog initial invitees", () => {
  function addInvitee(email: string) {
    const input = screen.getByRole("combobox", { name: "Invite by email" });
    fireEvent.change(input, { target: { value: email } });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));
  }

  function typeTeamName() {
    fireEvent.change(screen.getByPlaceholderText("Platform team"), { target: { value: "Platform" } });
  }

  it("invites each person after the team is created and closes when all succeed", async () => {
    vi.spyOn(api, "suggestAttendees").mockResolvedValue([]);
    const create = vi.spyOn(teamsApi.remote, "createTeam").mockResolvedValue(TEAM);
    const invite = vi.spyOn(teamsApi.remote, "inviteMember").mockResolvedValue(null);
    const onCreated = vi.fn();
    const onOpenChange = vi.fn();

    renderWithClient(<CreateTeamDialog open onOpenChange={onOpenChange} onCreated={onCreated} />);
    typeTeamName();
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

  it("includes an address that was typed but not added", async () => {
    vi.spyOn(api, "suggestAttendees").mockResolvedValue([]);
    vi.spyOn(teamsApi.remote, "createTeam").mockResolvedValue(TEAM);
    const invite = vi.spyOn(teamsApi.remote, "inviteMember").mockResolvedValue(null);
    const onCreated = vi.fn();

    renderWithClient(<CreateTeamDialog open onOpenChange={() => {}} onCreated={onCreated} />);
    typeTeamName();
    fireEvent.change(screen.getByRole("combobox", { name: "Invite by email" }), { target: { value: "Late@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: "Create and invite" }));

    await waitFor(() => expect(onCreated).toHaveBeenCalledWith(TEAM));
    expect(invite.mock.calls).toEqual([["team-9", "late@example.com"]]);
  });

  it("does not create the team while a typed address is invalid", () => {
    const create = vi.spyOn(teamsApi.remote, "createTeam");
    renderWithClient(<CreateTeamDialog open onOpenChange={() => {}} onCreated={() => {}} />);
    typeTeamName();
    fireEvent.change(screen.getByRole("combobox", { name: "Invite by email" }), { target: { value: "not-an-email" } });
    fireEvent.click(screen.getByRole("button", { name: "Create and invite" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Enter a valid email address.");
    expect(create).not.toHaveBeenCalled();
  });

  it("rejects an invalid address before it is added", () => {
    renderWithClient(<CreateTeamDialog open onOpenChange={() => {}} onCreated={() => {}} />);
    addInvitee("not-an-email");
    expect(screen.getByRole("alert")).toHaveTextContent("Enter a valid email address.");
    expect(screen.queryByRole("list", { name: "People to invite" })).not.toBeInTheDocument();
  });

  it("separates refused invites from invites with an unknown outcome, and claims only those sent", async () => {
    vi.spyOn(api, "suggestAttendees").mockResolvedValue([]);
    vi.spyOn(teamsApi.remote, "createTeam").mockResolvedValue(TEAM);
    vi.spyOn(teamsApi.remote, "inviteMember").mockImplementation(async (_teamId, email) => {
      if (email === "ok@example.com") return null;
      if (email === "gone@example.com") throw new ApiUnreachableError("network");
      if (email === "proxy@example.com") throw new ApiGatewayError(502);
      if (email === "boom@example.com") throw new ApiHttpError(500, { error: "internal" }, "internal");
      throw new ApiHttpError(409, { error: "already invited" }, "already invited");
    });
    const onCreated = vi.fn();
    const onOpenChange = vi.fn();

    renderWithClient(<CreateTeamDialog open onOpenChange={onOpenChange} onCreated={onCreated} />);
    typeTeamName();
    for (const email of ["ok@example.com", "gone@example.com", "proxy@example.com", "boom@example.com", "dup@example.com"]) {
      addInvitee(email);
    }
    fireEvent.click(screen.getByRole("button", { name: "Create and invite" }));

    const result = await screen.findByTestId("create-team-invite-result");
    expect(result).toHaveTextContent("Invites sent to 1 person.");

    const refused = screen.getByRole("alert");
    expect(refused).toHaveTextContent("This invite was not sent:");
    expect(refused).toHaveTextContent("dup@example.com");
    for (const email of ["ok@example.com", "gone@example.com", "proxy@example.com", "boom@example.com"]) {
      expect(refused).not.toHaveTextContent(email);
    }

    const unknown = screen.getByTestId("create-team-invite-unknown");
    expect(unknown).toHaveTextContent("No answer for these 3 invites. They may not have been sent — check the team page:");
    for (const email of ["gone@example.com", "proxy@example.com", "boom@example.com"]) {
      expect(unknown).toHaveTextContent(email);
    }
    expect(unknown).not.toHaveTextContent("dup@example.com");
    expect(unknown).not.toHaveTextContent("not sent:");

    // The team exists, but the dialog stays until the user has read the result.
    expect(onCreated).not.toHaveBeenCalled();
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    expect(onCreated).toHaveBeenCalledWith(TEAM);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("refuses every close path while the team and its invites are being sent", async () => {
    vi.spyOn(api, "suggestAttendees").mockResolvedValue([]);
    vi.spyOn(teamsApi.remote, "createTeam").mockResolvedValue(TEAM);
    const pending = deferred<FormalTeamMember | null>();
    vi.spyOn(teamsApi.remote, "inviteMember").mockReturnValue(pending.promise);
    const onCreated = vi.fn();
    const onOpenChange = vi.fn();

    renderWithClient(<CreateTeamDialog open onOpenChange={onOpenChange} onCreated={onCreated} />);
    typeTeamName();
    addInvitee("a@example.com");
    fireEvent.click(screen.getByRole("button", { name: "Create and invite" }));
    await screen.findByRole("button", { name: "Creating…" });

    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Close" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape" });
    fireEvent.pointerDown(document.body);
    expect(onOpenChange).not.toHaveBeenCalled();

    pending.resolve(null);
    await waitFor(() => expect(onCreated).toHaveBeenCalledWith(TEAM));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("sends no invite when the team could not be created", async () => {
    vi.spyOn(api, "suggestAttendees").mockResolvedValue([]);
    vi.spyOn(teamsApi.remote, "createTeam").mockRejectedValue(new ApiHttpError(400, { error: "bad name" }, "bad name"));
    const invite = vi.spyOn(teamsApi.remote, "inviteMember");
    const onCreated = vi.fn();

    renderWithClient(<CreateTeamDialog open onOpenChange={() => {}} onCreated={onCreated} />);
    typeTeamName();
    addInvitee("a@example.com");
    fireEvent.click(screen.getByRole("button", { name: "Create and invite" }));

    await screen.findByRole("alert");
    expect(invite).not.toHaveBeenCalled();
    expect(onCreated).not.toHaveBeenCalled();
    // The typed invitee is kept for a retry.
    expect(screen.getByRole("list", { name: "People to invite" })).toHaveTextContent("a@example.com");
  });
});
