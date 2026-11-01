/**
 * PAC-83 AC-15 (and the demo's own data): the demo is entered only from its
 * control, shows demo data without a server request, labels every signed-in
 * page with a label that cannot be dismissed and never says "offline", and
 * leaving it returns to the signed-out state with no demo data left.
 */
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";

import { AuthProvider } from "@/contexts/AuthContext";
import { useAuth } from "@/contexts/useAuth";
import { RequireAuth } from "@/components/RequireAuth";
import { api } from "@/api/client";
import { teamsApi } from "@/api/teams";
import { managerApi } from "@/api/manager";
import { isDemoSession } from "@/api/demoGate";
import type { Settings } from "@/api/types";
import DemoEntry from "./DemoEntry";
import { DEMO_BUNDLE_MARKER } from "./index";
import { mockLlmTest } from "./clientMocks";
import { KEY_PROVIDERS } from "@/lib/aiProviders";

const fetchMock = vi.fn<typeof fetch>();

function monday(): Date {
  const d = new Date();
  const day = d.getDay();
  d.setDate(d.getDate() + (day === 0 ? -6 : 1 - day));
  d.setHours(0, 0, 0, 0);
  return d;
}

function WeekTitles() {
  const start = monday();
  const end = new Date(start.getTime() + 7 * 86400_000);
  const q = useQuery({ queryKey: ["demo-week"], queryFn: () => api.getEvents(start.toISOString(), end.toISOString()) });
  return <ul>{q.data?.map((e) => <li key={e.id}>{e.title}</li>)}</ul>;
}

function Harness() {
  const { user, isDemo, enterDemo, exitDemo } = useAuth();
  return (
    <>
      <span data-testid="who">{user ? user.name : "signed out"}</span>
      {!isDemo && <DemoEntry onStarted={enterDemo} />}
      {isDemo && (
        <>
          <button type="button" onClick={exitDemo}>
            Exit demo
          </button>
          <RequireAuth requireOnboarding={false}>
            <WeekTitles />
          </RequireAuth>
        </>
      )}
    </>
  );
}

function renderHarness() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <AuthProvider>
          <Harness />
        </AuthProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("PAC-83 explicit demo (non-production build)", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    fetchMock.mockImplementation(async () => new Response(JSON.stringify({ error: "no session" }), { status: 401, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);
  });
  afterAll(() => {
    vi.unstubAllGlobals();
  });

  it("AC-15: demo data with a non-dismissible demo label and no server request; leaving clears it", async () => {
    renderHarness();
    await waitFor(() => expect(screen.getByTestId("who")).toHaveTextContent("signed out"));
    const requestsBefore = fetchMock.mock.calls.length;

    fireEvent.click(screen.getByTestId("demo-entry"));
    expect(isDemoSession()).toBe(true);

    const label = await screen.findByTestId("demo-label");
    expect(label).toHaveAttribute("data-demo-bundle", DEMO_BUNDLE_MARKER);
    expect(label.textContent ?? "").toMatch(/demo/i);
    expect(label.textContent ?? "").not.toMatch(/offline|unreachable/i);
    expect(label.querySelector("button")).toBeNull();

    expect(await screen.findByText("Team standup")).toBeInTheDocument();
    expect(fetchMock.mock.calls.length).toBe(requestsBefore);

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Exit demo" }));
    });
    expect(screen.getByTestId("who")).toHaveTextContent("signed out");
    expect(screen.queryByTestId("demo-label")).not.toBeInTheDocument();
    expect(isDemoSession()).toBe(false);
    fetchMock.mockResolvedValueOnce(new Response("[]", { status: 200, headers: { "content-type": "application/json" } }));
    await expect(api.getEvents(monday().toISOString(), new Date().toISOString())).resolves.toEqual([]);
  });

  it("AC-15: demo writes to the shared teams/manager stores are gone after Exit demo; the real cache is restored", async () => {
    const realTeams = JSON.stringify({ teams: [{ id: "real", name: "Real team", created_at: "", owner_email: "me@co.com", members: [], no_meeting_zones: [] }], active_team_id: "real", current_user_email: "me@co.com" });
    const realManager = JSON.stringify({ profile: { is_manager: true, onboarding_profile_selected: true }, members: [] });
    localStorage.setItem("paceday:teams:v1", realTeams);
    localStorage.setItem("paceday:manager:v1", realManager);
    renderHarness();
    await waitFor(() => expect(screen.getByTestId("who")).toHaveTextContent("signed out"));
    fireEvent.click(screen.getByTestId("demo-entry"));
    // The demo starts on empty stores (it never shows the real cache) …
    expect(localStorage.getItem("paceday:teams:v1")).toBeNull();
    expect(localStorage.getItem("paceday:manager:v1")).toBeNull();
    // … and writes into them like any session.
    await teamsApi.remote.createTeam("Demo squad");
    await managerApi.remote.setProfile({ is_manager: false, onboarding_profile_selected: true });
    expect(localStorage.getItem("paceday:teams:v1")).toContain("Demo squad");

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Exit demo" }));
    });
    expect(localStorage.getItem("paceday:teams:v1")).toBe(realTeams);
    expect(localStorage.getItem("paceday:manager:v1")).toBe(realManager);
    expect(localStorage.getItem("paceday:stores-before-demo")).toBeNull();
    localStorage.removeItem("paceday:teams:v1");
    localStorage.removeItem("paceday:manager:v1");
  });

  it("AC-15: a demo left without Exit (tab closed) is undone at the next start-up", async () => {
    localStorage.setItem("paceday:stores-before-demo", JSON.stringify({ "paceday:teams:v1": null, "paceday:manager:v1": null }));
    localStorage.setItem("paceday:teams:v1", JSON.stringify({ teams: [{ id: "x", name: "Demo squad" }] }));
    vi.resetModules();
    await import("@/api/demoGate");
    expect(localStorage.getItem("paceday:teams:v1")).toBeNull();
    expect(localStorage.getItem("paceday:stores-before-demo")).toBeNull();
  });

  it("AC-15d: with the production value of the flag a leftover demo flag shows no demo label and calls reach the server", async () => {
    vi.stubGlobal("__PACEDAY_DEMO_BUILD__", false);
    vi.stubGlobal("fetch", fetchMock);
    sessionStorage.setItem("paceday:demo", "1");
    renderHarness();
    await waitFor(() => expect(screen.getByTestId("who")).toHaveTextContent("signed out"));
    expect(screen.queryByTestId("demo-label")).not.toBeInTheDocument();
    expect(fetchMock.mock.calls.some(([u]) => String(u).endsWith("/api/auth/me"))).toBe(true);
  });

  it("the demo's AI probe knows exactly the five key providers (moved from the client)", () => {
    const base = { llm_model: "", aws_region: "us-east-1", azure_endpoint: "https://x", azure_deployment: "d" } as Settings;
    for (const p of KEY_PROVIDERS) expect(mockLlmTest({ ...base, llm_provider: p }).ok).toBe(true);
    for (const p of ["", "organization", "unsupported", "ollama"]) {
      const res = mockLlmTest({ ...base, llm_provider: p });
      expect(res.ok).toBe(false);
      expect(res.message).not.toMatch(/ollama/i);
    }
    expect(mockLlmTest({ ...base, llm_provider: "azure_openai", azure_endpoint: "" }).ok).toBe(false);
  });
});
