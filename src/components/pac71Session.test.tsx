import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { AuthProvider } from "@/contexts/AuthContext";
import { useAuth } from "@/contexts/useAuth";
import { managerApi } from "@/api/manager";
import { RequireAuth } from "./RequireAuth";

// PAC-71 spec §3 "Sessions" (AC-42, AC-48), web half: a session whose
// generation is no longer current gets today's 401 and the web treats it as
// signed out, as today; an unreadable generation is a 500 ("session generation
// unavailable"), which must not look like a sign-out.

const fetchMock = vi.fn<typeof fetch>();

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

const ME = {
  id: "8a6e0804-2bd0-4672-b79d-d97027f9071a",
  email: "henry@acme.com",
  name: "Henry",
  avatarUrl: "",
  provider: "google",
  addressStanding: "domain_confirmed",
  createdAt: "2026-10-28T09:00:00Z",
};

function Where() {
  const loc = useLocation();
  return <span data-testid="where">{loc.pathname + loc.search}</span>;
}

function Probe() {
  const { user, sessionStale } = useAuth();
  return <span data-testid="probe">{`${user ? user.email : "anon"}|${sessionStale ? "stale" : "fresh"}`}</span>;
}

function renderApp() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <AuthProvider>
        <MemoryRouter initialEntries={["/app/links"]}>
          <Routes>
            <Route
              path="/app/links"
              element={
                <RequireAuth>
                  <div>links page</div>
                </RequireAuth>
              }
            />
            <Route path="/" element={<div>landing</div>} />
          </Routes>
          <Where />
          <Probe />
        </MemoryRouter>
      </AuthProvider>
    </QueryClientProvider>,
  );
}

describe("PAC-71 session generation on the web", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
    sessionStorage.clear();
    localStorage.clear();
    vi.spyOn(managerApi.remote, "getProfile").mockResolvedValue({ is_manager: false, onboarding_profile_selected: true });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("reads addressStanding from the current user", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ ...ME, addressStanding: "unconfirmed" }));
    let seen: string | undefined;
    function Standing() {
      const { user } = useAuth();
      seen = user?.addressStanding;
      return null;
    }
    render(
      <AuthProvider>
        <Standing />
      </AuthProvider>,
    );
    await waitFor(() => expect(seen).toBe("unconfirmed"));
  });

  it("a stale generation's 401 is signed out, as today: back to the landing page", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: "unauthorized" }, 401));
    renderApp();
    expect(await screen.findByText("landing")).toBeInTheDocument();
    expect(screen.getByTestId("where")).toHaveTextContent("/?redirect=%2Fapp%2Flinks");
    expect(screen.getByTestId("probe")).toHaveTextContent("anon|fresh");
  });

  it("an unreadable generation (500) is not a sign-out: no bounce to the landing page, a retry instead", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: "internal error" }, 500));
    renderApp();
    expect(await screen.findByText(/could not check your session/i)).toBeInTheDocument();
    expect(screen.queryByText("landing")).not.toBeInTheDocument();
    expect(screen.getByTestId("where")).toHaveTextContent(/^\/app\/links$/);

    // Retrying once the server answers lets the user in.
    fetchMock.mockResolvedValueOnce(jsonResponse(ME));
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByText("links page")).toBeInTheDocument();
    expect(screen.getByTestId("probe")).toHaveTextContent("henry@acme.com|fresh");
  });

  it("a 500 after sign-in keeps the user signed in", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(ME));
    let refresh: (() => Promise<unknown>) | undefined;
    function Grab() {
      refresh = useAuth().refresh;
      return null;
    }
    render(
      <AuthProvider>
        <Grab />
        <Probe />
      </AuthProvider>,
    );
    await waitFor(() => expect(screen.getByTestId("probe")).toHaveTextContent("henry@acme.com|fresh"));
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: "internal error" }, 500));
    await refresh!();
    await waitFor(() => expect(screen.getByTestId("probe")).toHaveTextContent("henry@acme.com|stale"));
  });
});
