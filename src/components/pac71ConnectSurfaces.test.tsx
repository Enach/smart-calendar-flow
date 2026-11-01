import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import type { ReactNode } from "react";

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), info: vi.fn() }));
vi.mock("@/hooks/useToast", () => ({ toast }));
vi.mock("@/contexts/useAuth", () => ({ useAuth: () => ({ isDemo: false, user: { id: "u1", email: "a@x.com", name: "A" } }) }));

// The dashboard's other panels are not under test: only its "Connect calendar" banner is.
vi.mock("@/components/Navbar", () => ({ Navbar: () => null }));
vi.mock("@/components/NLPBar", () => ({ NLPBar: () => null }));
vi.mock("@/components/NLPConfirmModal", () => ({ NLPConfirmModal: () => null }));
vi.mock("@/components/ScheduleSuggestModal", () => ({ ScheduleSuggestModal: () => null }));
vi.mock("@/components/TodayAgenda", () => ({ TodayAgenda: () => null }));
vi.mock("@/components/FocusStats", () => ({ FocusStats: () => null }));
vi.mock("@/components/QuickActions", () => ({ QuickActions: () => null }));
vi.mock("@/components/EventDrawer", () => ({ EventDrawer: () => null }));
vi.mock("@/components/MockBanner", () => ({ MockBanner: () => null }));
vi.mock("@/components/DemoBanner", () => ({ DemoBanner: () => null }));
vi.mock("@/components/QuickCreatePopover", () => ({ QuickCreatePopover: () => null }));
vi.mock("@/hooks/useSettings", () => ({ useSettings: () => ({ data: undefined }) }));
vi.mock("@/hooks/useCalendarEvents", () => ({
  useCalendarEvents: () => ({ data: [], isLoading: false, isFetching: false, isError: false, error: null, refetch: vi.fn() }),
}));

import { ConnectionStatus } from "./ConnectionStatus";
import { WorkCalendarConnection } from "./WorkCalendarConnection";
import Dashboard from "@/pages/Dashboard";
import Onboarding from "@/pages/Onboarding";
import { TimeFormatValue } from "@/contexts/TimeFormatContext";
import { isUsingMocks, setMockMode } from "@/api/client";
import type { Settings } from "@/api/types";

// PAC-71 AC-32 (web): the four signed-in controls start a connect — a POST to
// /api/auth/{google|microsoft}/connect whose authorize_url the window follows —
// and never navigate to a public sign-in start (a GET of /api/auth/google or
// /api/auth/microsoft).

const GOOGLE_AUTHORIZE = "https://accounts.google.com/o/oauth2/v2/auth?state=g-state";
const MICROSOFT_AUTHORIZE = "https://login.microsoftonline.com/common/oauth2/v2.0/authorize?state=m-state";

const fetchMock = vi.fn<typeof fetch>();
const assigned: string[] = [];
const realLocation = window.location;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

function serve(
  connect: (path: string) => Response = (path) =>
    jsonResponse({ authorize_url: path.includes("microsoft") ? MICROSOFT_AUTHORIZE : GOOGLE_AUTHORIZE }),
  saveSettings: (body: unknown) => Response = (body) => jsonResponse(body),
) {
  fetchMock.mockImplementation(async (input, init) => {
    const path = new URL(String(input), "https://app.paceday.test").pathname;
    if (path === "/api/settings" && init?.method === "PATCH") return saveSettings(JSON.parse(String(init.body)));
    if (path === "/api/auth/status") return jsonResponse({ connected: false });
    if (path === "/api/integrations/availability") {
      return jsonResponse({
        google: { available: true },
        microsoft: { available: true },
        zoom: { available: false },
        slack: { available: false },
        notion: { available: false },
        webcal: { available: true },
      });
    }
    if ((path === "/api/auth/google/connect" || path === "/api/auth/microsoft/connect") && init?.method === "POST") {
      return connect(path);
    }
    return jsonResponse({ error: "not here" }, 404);
  });
}

/** Every write the controls made, in order: the settings PATCH and the connect POST. */
function writes() {
  return fetchMock.mock.calls
    .filter(([, init]) => init?.method === "PATCH" || init?.method === "POST")
    .map(([input, init]) => ({
      method: init?.method,
      path: new URL(String(input), "https://app.paceday.test").pathname,
      body: init?.body ? JSON.parse(String(init.body)) : undefined,
    }));
}

function connectCalls() {
  return fetchMock.mock.calls
    .map(([input, init]) => ({ path: new URL(String(input), "https://app.paceday.test").pathname, method: init?.method, body: init?.body }))
    .filter((c) => c.path.endsWith("/connect"));
}

function Shell({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <TimeFormatValue value="12h">{children}</TimeFormatValue>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

/** No navigation ever went to a GET sign-in start. */
function expectNoSignInStart() {
  for (const url of assigned) {
    expect(url).not.toMatch(/\/api\/auth\/(google|microsoft)(\?|$)/);
  }
}

describe("PAC-71 AC-32: the signed-in controls start a connect, never a sign-in", () => {
  beforeEach(() => {
    setMockMode(false);
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
    toast.success.mockReset();
    toast.error.mockReset();
    localStorage.clear();
    assigned.length = 0;
    Object.defineProperty(window, "location", {
      configurable: true,
      value: {
        origin: "https://app.paceday.test",
        pathname: "/app",
        search: "",
        get href() {
          return "https://app.paceday.test/app";
        },
        set href(v: string) {
          assigned.push(v);
        },
      },
    });
  });
  afterAll(() => {
    vi.unstubAllGlobals();
    Object.defineProperty(window, "location", { configurable: true, value: realLocation });
  });

  it("connection status control: POSTs the Google connect and follows its authorize_url", async () => {
    serve();
    render(
      <Shell>
        <ConnectionStatus />
      </Shell>,
    );
    fireEvent.click(await screen.findByRole("button", { name: /connect/i }));
    await waitFor(() => expect(assigned).toEqual([GOOGLE_AUTHORIZE]));
    // This control does not change the work calendar: nothing is saved.
    expect(writes()).toEqual([{ method: "POST", path: "/api/auth/google/connect", body: undefined }]);
    expectNoSignInStart();
  });

  it.each([
    ["google", "Google Calendar", "/api/auth/google/connect", GOOGLE_AUTHORIZE],
    ["outlook", "Microsoft Outlook", "/api/auth/microsoft/connect", MICROSOFT_AUTHORIZE],
  ])("Settings work-calendar control (%s): records the choice, then POSTs the connect", async (provider, label, path, authorize) => {
    serve();
    const onPatch = vi.fn();
    render(
      <Shell>
        <WorkCalendarConnection settings={{} as Settings} onPatch={onPatch} />
      </Shell>,
    );
    fireEvent.click(await screen.findByRole("radio", { name: new RegExp(label) }));
    fireEvent.click(screen.getByRole("button", { name: `Connect ${label}` }));
    await waitFor(() => expect(assigned).toEqual([authorize]));
    // The work calendar is the user's explicit choice in this control, saved
    // (only that field) before the connect starts (spec §3, AC-12): the
    // connect itself never sets it, and the Settings draft is lost on leaving.
    expect(onPatch).toHaveBeenCalledWith({ calendar_provider: provider });
    expect(writes()).toEqual([
      { method: "PATCH", path: "/api/settings", body: { calendarProvider: provider } },
      { method: "POST", path, body: undefined },
    ]);
    expectNoSignInStart();
  });

  it.each([
    ["the server refuses it (500)", () => jsonResponse({ error: "internal error" }, 500)],
    ["the session is gone (401)", () => jsonResponse({ error: "unauthorized" }, 401)],
  ])("Settings work-calendar control: when saving the choice fails (%s), it says so and does not connect", async (_case, answer) => {
    serve(undefined, answer);
    render(
      <Shell>
        <WorkCalendarConnection settings={{} as Settings} onPatch={() => {}} />
      </Shell>,
    );
    fireEvent.click(await screen.findByRole("radio", { name: /Microsoft Outlook/ }));
    fireEvent.click(screen.getByRole("button", { name: "Connect Microsoft Outlook" }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledTimes(1));
    expect(writes()).toEqual([{ method: "PATCH", path: "/api/settings", body: { calendarProvider: "outlook" } }]);
    expect(connectCalls()).toEqual([]);
    expect(assigned).toEqual([]);
    expect(isUsingMocks()).toBe(false);
  });

  it("Dashboard 'Connect calendar' banner: POSTs the Google connect", async () => {
    serve();
    render(
      <Shell>
        <Dashboard />
      </Shell>,
    );
    fireEvent.click(await screen.findByRole("button", { name: "Connect calendar" }));
    await waitFor(() => expect(assigned).toEqual([GOOGLE_AUTHORIZE]));
    // This control does not change the work calendar: nothing is saved.
    expect(writes()).toEqual([{ method: "POST", path: "/api/auth/google/connect", body: undefined }]);
    expectNoSignInStart();
  });

  it("onboarding calendar step: POSTs the connect for the chosen provider", async () => {
    serve();
    render(
      <Shell>
        <Onboarding />
      </Shell>,
    );
    fireEvent.click(await screen.findByRole("button", { name: /Microsoft Outlook/ }));
    fireEvent.click(screen.getByRole("button", { name: /continue/i }));
    await waitFor(() => expect(assigned).toEqual([MICROSOFT_AUTHORIZE]));
    // The chosen work calendar is saved first, so the user does not loop back here.
    expect(writes()).toEqual([
      { method: "PATCH", path: "/api/settings", body: { calendarProvider: "outlook" } },
      { method: "POST", path: "/api/auth/microsoft/connect", body: undefined },
    ]);
    expectNoSignInStart();
  });

  it("onboarding calendar step: when saving the choice fails, it says so, does not connect, and stays on the step", async () => {
    serve(undefined, () => jsonResponse({ error: "internal error" }, 500));
    render(
      <Shell>
        <Onboarding />
      </Shell>,
    );
    fireEvent.click(await screen.findByRole("button", { name: /Microsoft Outlook/ }));
    fireEvent.click(screen.getByRole("button", { name: /continue/i }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledTimes(1));
    expect(connectCalls()).toEqual([]);
    expect(assigned).toEqual([]);
    expect(screen.getByRole("heading", { name: "Connect your calendar" })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("button", { name: /continue/i })).not.toBeDisabled());
  });

  it("onboarding: a WebCal feed starts no connect", async () => {
    serve();
    render(
      <Shell>
        <Onboarding />
      </Shell>,
    );
    fireEvent.click(await screen.findByRole("button", { name: /WebCal/ }));
    fireEvent.click(screen.getByRole("button", { name: /continue/i }));
    expect(await screen.findByText(/how do you use your calendar/i)).toBeInTheDocument();
    expect(writes()).toEqual([]);
    expect(assigned).toEqual([]);
  });

  it.each([
    ["the session is gone (401)", () => jsonResponse({ error: "unauthorized" }, 401)],
    ["the server failed (500)", () => jsonResponse({ error: "internal error" }, 500)],
    ["Microsoft is not configured (503)", () => jsonResponse({ error: "microsoft not configured" }, 503)],
    ["an answer outside the contract", () => jsonResponse({ authorize_url: GOOGLE_AUTHORIZE, extra: true })],
  ])("a failed start (%s) navigates nowhere, says so, and never falls back to preview data", async (_case, answer) => {
    serve(answer);
    render(
      <Shell>
        <ConnectionStatus />
      </Shell>,
    );
    fireEvent.click(await screen.findByRole("button", { name: /connect/i }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledTimes(1));
    expect(assigned).toEqual([]);
    expect(isUsingMocks()).toBe(false);
    // The control can be used again.
    await waitFor(() => expect(screen.getByRole("button", { name: /connect/i })).not.toBeDisabled());
  });
});
