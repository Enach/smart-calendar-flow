/**
 * PAC-133 AC-43 (SF-037 first clause, web half): for a "schedule a meeting"
 * parse with no slots, the Dashboard shows the parse answer's error, whatever
 * set it, instead of "No available slots found for that request.". With no
 * error the message is unchanged. The server owns the precedence (the model's
 * error is kept, the suggestion failure is written only when none is set): the
 * web shows the `error` it is given, unchanged.
 */
import { act, render, waitFor } from "@testing-library/react";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";

const bar = vi.hoisted(() => ({
  error: null as string | null | undefined,
  onSubmit: null as null | ((text: string) => Promise<void> | void),
}));
const confirm = vi.hoisted(() => ({ shown: false }));

vi.mock("@fullcalendar/react", () => ({ default: () => null }));
vi.mock("@/components/Navbar", () => ({ Navbar: () => null }));
vi.mock("@/components/NLPBar", () => ({
  NLPBar: (props: { error?: string | null; onSubmit: (text: string) => Promise<void> | void }) => {
    bar.error = props.error;
    bar.onSubmit = props.onSubmit;
    return null;
  },
}));
vi.mock("@/components/NLPConfirmModal", () => ({
  NLPConfirmModal: (props: { parseResult?: unknown }) => {
    confirm.shown = Boolean(props.parseResult);
    return null;
  },
}));
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

const NO_SLOTS = "No available slots found for that request.";
const SUGGESTION_FAILURE = "Paceday could not suggest meeting times for this request. Try again later.";
const MODEL_ERROR = "I could not tell who should attend.";

const fetchMock = vi.fn<typeof fetch>();
const json = (body: unknown) =>
  new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });

const MEETING = {
  intent: "schedule_meeting",
  title: "Sync",
  duration_minutes: 30,
  attendees: ["bo@co.com"],
};

async function parse(answer: Record<string, unknown>) {
  fetchMock.mockImplementation(async (u) => {
    const path = new URL(String(u), window.location.origin).pathname;
    if (path === "/api/nlp/parse") return json(answer);
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
    await bar.onSubmit!("meet bo tomorrow");
  });
}

describe("PAC-133 AC-43: the Dashboard shows NLP parse's error for a meeting with no slots", () => {
  beforeEach(() => {
    bar.error = undefined;
    bar.onSubmit = null;
    confirm.shown = false;
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterAll(() => {
    vi.unstubAllGlobals();
  });

  it("bullet 1: the suggestion failure E, with no slots, is shown instead of the no-slots text", async () => {
    await parse({
      ...MEETING,
      range_start: "2026-11-19T09:00:00Z",
      range_end: "2026-11-19T17:00:00Z",
      error: SUGGESTION_FAILURE,
    });
    await waitFor(() => expect(bar.error).toBe(SUGGESTION_FAILURE));
    expect(bar.error).not.toBe(NO_SLOTS);
  });

  it("bullet 2: with no error, the no-slots text is unchanged (regression guard)", async () => {
    await parse({
      ...MEETING,
      range_start: "2026-11-19T09:00:00Z",
      range_end: "2026-11-19T17:00:00Z",
      suggested_slots: [],
    });
    await waitFor(() => expect(bar.error).toBe(NO_SLOTS));
  });

  it("bullet 2: an empty error string is no error, and the no-slots text is shown", async () => {
    await parse({ ...MEETING, error: "" });
    await waitFor(() => expect(bar.error).toBe(NO_SLOTS));
  });

  it("bullet 3 (P3-m1): the model's error E with zero slots from the suggestion step is shown", async () => {
    await parse({
      ...MEETING,
      range_start: "2026-11-19T09:00:00Z",
      range_end: "2026-11-19T17:00:00Z",
      suggested_slots: [],
      error: MODEL_ERROR,
    });
    await waitFor(() => expect(bar.error).toBe(MODEL_ERROR));
  });

  it("bullet 3 (P3-m1): the model's error E when the suggestion step never ran (no range) is shown", async () => {
    await parse({ ...MEETING, error: MODEL_ERROR });
    await waitFor(() => expect(bar.error).toBe(MODEL_ERROR));
  });

  it("precedence is the server's: the error the answer carries is shown exactly, never rewritten or combined", async () => {
    // The server kept the model's error and did not write the suggestion failure.
    await parse({ ...MEETING, range_start: "2026-11-19T09:00:00Z", range_end: "2026-11-19T17:00:00Z", error: MODEL_ERROR });
    await waitFor(() => expect(bar.error).toBe(MODEL_ERROR));
    expect(bar.error).not.toContain(SUGGESTION_FAILURE);
    expect(bar.error).not.toContain(NO_SLOTS);
  });

  it("a meeting with slots still opens the confirmation and sets no error", async () => {
    await parse({
      ...MEETING,
      suggested_slots: [{ start: "2026-11-19T09:00:00Z", end: "2026-11-19T09:30:00Z", score: 90, reasons: [] }],
    });
    await waitFor(() => expect(confirm.shown).toBe(true));
    expect(bar.error).toBeNull();
  });
});
