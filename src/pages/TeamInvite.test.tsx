import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import TeamInvite from "./TeamInvite";
import { teamInvitesApi, type TeamInvite as TeamInviteModel } from "@/api/teams";

vi.mock("@/components/Navbar", () => ({ Navbar: () => null }));

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={["/invite/tok"]}>
        <Routes>
          <Route path="/invite/:token" element={<TeamInvite />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const invite: TeamInviteModel = {
  token: "tok",
  team_id: "5f0c2a8e-0b7a-4d9e-9c43-0d6c1f6f1a11",
  team_name: "Platform",
  invited_email: "a@b.com",
  inviter_name: "Ines Inviter",
  inviter_email: "ines@co.com",
  expires_at: "2026-11-03T10:00:00Z",
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe("TeamInvite page (PAC-34 AC-2)", () => {
  it("renders who invited you and when the invitation expires", async () => {
    vi.spyOn(teamInvitesApi, "get").mockResolvedValue(invite);
    renderPage();

    const inviter = await screen.findByTestId("invite-inviter");
    expect(inviter).toHaveTextContent("Ines Inviter");
    expect(inviter).toHaveTextContent("ines@co.com");
    const expiry = screen.getByTestId("invite-expiry");
    expect(expiry).toHaveTextContent(/Nov(ember)? 3, 2026/);
    expect(expiry.querySelector("time")).toHaveAttribute("dateTime", "2026-11-03T10:00:00Z");
  });

  it("shows the inviter email alone when the name is empty", async () => {
    vi.spyOn(teamInvitesApi, "get").mockResolvedValue({ ...invite, inviter_name: null });
    renderPage();
    expect(await screen.findByTestId("invite-inviter")).toHaveTextContent("ines@co.com");
  });

  it("renders without an inviter line, never 'undefined', when the inviter cannot be read", async () => {
    vi.spyOn(teamInvitesApi, "get").mockResolvedValue({ ...invite, inviter_name: null, inviter_email: null });
    renderPage();

    expect(await screen.findByText("Platform")).toBeInTheDocument();
    expect(screen.queryByTestId("invite-inviter")).not.toBeInTheDocument();
    expect(screen.getByTestId("invite-expiry")).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/undefined|null|Invalid Date/);
  });

  it("says an invitation whose expiry has passed has expired", async () => {
    vi.spyOn(teamInvitesApi, "get").mockResolvedValue({ ...invite, expires_at: "2020-01-01T00:00:00Z" });
    renderPage();
    expect(await screen.findByTestId("invite-expiry")).toHaveTextContent(/expired/i);
  });
});
