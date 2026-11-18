/**
 * PAC-122 batch 6, SF-050 (Dashboard half): a typed focus request ("block
 * focus time") always said "Focus time scheduled", whatever the run answered.
 * The run's `createdBlocks` and `errors[]` now decide the message.
 */
import { act, render, waitFor } from "@testing-library/react";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";

const bar = vi.hoisted(() => ({ onSubmit: null as null | ((text: string) => Promise<void> | void) }));
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), info: vi.fn() }));

vi.mock("@/hooks/useToast", () => ({ toast }));
vi.mock("@fullcalendar/react", () => ({ default: () => null }));
vi.mock("@/components/Navbar", () => ({ Navbar: () => null }));
vi.mock("@/components/NLPBar", () => ({
  NLPBar: (props: { onSubmit: (text: string) => Promise<void> | void }) => {
    bar.onSubmit = props.onSubmit;
    return null;
  },
}));
vi.mock("@/components/NLPConfirmModal", () => ({ NLPConfirmModal: () => null }));
vi.mock("@/components/ScheduleSuggestModal", () => ({ ScheduleSuggestModal: () => null }));
vi.mock("@/components/ConnectionStatus", () => ({ ConnectionStatus: () => null }));
vi.mock("@/components/TodayAgenda", () => ({ TodayAgenda: () => null }));
vi.mock("@/components/FocusStats", () => ({ FocusStats: () => null }));
vi.mock("@/components/QuickActions", () => ({ QuickActions: () => null }));
vi.mock("@/components/EventDrawer", () => ({ EventDrawer: () => null }));
vi.mock("@/components/ServerStatusBanner", () => ({ ServerStatusBanner: () => null }));
vi.mock("@/components/QuickCreatePopover", () => ({ QuickCreatePopover: () => null }));
vi.mock("@/contexts/useAuth", () => ({ useAuth: () => ({ isDemo: false }) }));
vi.mock("@/hooks/useSettings", () => ({ useSettings: () => ({ data: undefined }) }));

import Dashboard from "./Dashboard";

const fetchMock = vi.fn<typeof fetch>();
const json = (body: unknown) =>
  new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });

async function askForFocus(run: Record<string, unknown>) {
  fetchMock.mockImplementation(async (u) => {
    const path = new URL(String(u), window.location.origin).pathname;
    if (path === "/api/nlp/parse") return json({ intent: "schedule_focus" });
    if (path === "/api/focus/run") return json(run);
    if (path === "/api/auth/status") return json({ connected: true, provider: "google" });
    return json([]);
  });
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter>
        <Dashboard />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  await waitFor(() => expect(bar.onSubmit).not.toBeNull());
  await act(async () => {
    await bar.onSubmit!("block focus time this week");
  });
}

describe("PAC-122 SF-050: the Dashboard reports what a typed focus request did", () => {
  beforeEach(() => {
    bar.onSubmit = null;
    toast.success.mockReset();
    toast.error.mockReset();
    toast.info.mockReset();
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterAll(() => vi.unstubAllGlobals());

  it("a run with failed days is an error, never 'Focus time scheduled'", async () => {
    await askForFocus({
      weekStart: "2026-11-16T00:00:00Z",
      createdBlocks: [],
      skippedDays: [],
      totalMinutes: 0,
      errors: ["2026-11-18: read existing focus minutes: boom"],
    });
    expect(toast.error).toHaveBeenCalledWith("No focus block was created. Problems on 1 day: 2026-11-18.");
    expect(toast.success).not.toHaveBeenCalledWith("Focus time scheduled");
  });

  it("a run that created nothing says so", async () => {
    await askForFocus({ weekStart: "2026-11-16T00:00:00Z", createdBlocks: [], skippedDays: ["2026-11-16"], totalMinutes: 0, errors: [] });
    expect(toast.info).toHaveBeenCalledWith("No focus block was created this week.");
    expect(toast.success).not.toHaveBeenCalledWith("Focus time scheduled");
  });

  it("a run that created blocks counts them", async () => {
    await askForFocus({
      weekStart: "2026-11-16T00:00:00Z",
      createdBlocks: [{ google_event_id: "g1", start_time: "2026-11-16T08:00:00Z", end_time: "2026-11-16T09:30:00Z", date: "2026-11-16" }],
      skippedDays: [],
      totalMinutes: 90,
      errors: [],
    });
    expect(toast.success).toHaveBeenCalledWith("Created 1 focus block");
  });
});
