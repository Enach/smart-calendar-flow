/**
 * PAC-83 at the component level: AC-2, AC-4, AC-6, AC-8, AC-15 (Zoom),
 * AC-15b, AC-16, AC-17, AC-18, AC-19, AC-20, AC-26, AC-27.
 */
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import type { ReactNode } from "react";

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), info: vi.fn() }));
vi.mock("@/hooks/useToast", () => ({ toast }));
const auth = vi.hoisted(() => ({ isDemo: false }));
vi.mock("@/contexts/useAuth", () => ({ useAuth: () => auth }));

import {
  api,
  API_MESSAGES,
  ApiGatewayError,
  ApiHttpError,
  ApiRequestCancelledError,
  ApiUnreachableError,
  type ApiEffect,
} from "@/api/client";
import { ApiErrorNotice, ApiErrorText } from "./ApiErrorNotice";
import { StillWorking, STILL_WORKING_MESSAGE } from "./StillWorking";
import { NLPBar } from "./NLPBar";
import { QuickActions } from "./QuickActions";
import { ConferencingSection } from "./ConferencingSection";
import { ServerStatusBanner, SERVER_UNREACHABLE_MESSAGE } from "./ServerStatusBanner";
import { InlineError } from "./ui/inline-error";
import { FindATimeTab } from "./team/FindATimeTab";
import type { Settings } from "@/api/types";
import type { FormalTeam } from "@/api/teams";

const fetchMock = vi.fn<typeof fetch>();
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const html = (status: number) => new Response("<html>504 Gateway Time-out</html>", { status, headers: { "content-type": "text/html" } });
const pathOf = (u: unknown) => new URL(String(u), window.location.origin).pathname;

function Shell({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={qc}>
      <MemoryRouter>{children}</MemoryRouter>
    </QueryClientProvider>
  );
}

const BUDGET = new ApiHttpError(503, { error: "request timed out" });
const FAILURES: Array<[string, unknown]> = [
  ["network", new ApiUnreachableError("network")],
  ["timeout", new ApiUnreachableError("timeout")],
  ["non-json", new ApiUnreachableError("non-json")],
  ["gateway 504", new ApiGatewayError(504)],
  ["budget 503", BUDGET],
  ["413", new ApiHttpError(413, { error: "request body too large" })],
  ["500", new ApiHttpError(500, { error: "internal error" })],
];

beforeEach(() => {
  fetchMock.mockReset();
  toast.success.mockReset();
  toast.error.mockReset();
  toast.info.mockReset();
  auth.isDemo = false;
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  vi.useRealTimers();
});
afterAll(() => {
  vi.unstubAllGlobals();
});

describe("AC-26 / AC-20: the inline failure", () => {
  it.each(FAILURES)("%s: never says 'preview data' or 'demo data', in any effect", (_l, error) => {
    for (const effect of ["read", "write", "booking"] as ApiEffect[]) {
      const { unmount, container } = render(<ApiErrorNotice error={error} effect={effect} onRetry={() => {}} />);
      expect(container.textContent ?? "").not.toMatch(/preview data|demo data/i);
      unmount();
    }
  });

  it("AC-20: a request cancelled because the page is being left shows nothing", () => {
    const { container } = render(<ApiErrorNotice error={new ApiRequestCancelledError()} effect="read" onRetry={() => {}} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("AC-16: the budget 503 on a read says 'took too long' with a retry, not the raw 'request timed out'", () => {
    render(<InlineError title="Couldn't load your calendar" message="x" error={BUDGET} effect="read" onRetry={() => {}} />);
    const notice = screen.getByTestId("api-error");
    expect(notice).toHaveAttribute("data-error-kind", "budget");
    expect(screen.getByTestId("api-error-retry")).toBeInTheDocument();
    render(<ApiErrorNotice error={BUDGET} effect="read" onRetry={() => {}} />);
    expect(screen.getByText(API_MESSAGES.budgetRead)).toBeInTheDocument();
    expect(screen.queryByText(/^request timed out$/i)).not.toBeInTheDocument();
  });

  it("AC-27: a read answered with nginx's 504 HTML page says 'can't reach' with a retry — no raw HTML, not 'The server had a problem'", async () => {
    fetchMock.mockResolvedValueOnce(html(504));
    const err = await api.getEvents("2026-11-02T00:00:00Z", "2026-11-09T00:00:00Z").catch((e) => e);
    const { container } = render(<ApiErrorNotice error={err} effect="read" onRetry={() => {}} />);
    expect(screen.getByTestId("api-error")).toHaveAttribute("data-error-kind", "lost");
    expect(container.textContent).toContain(API_MESSAGES.lostRead);
    expect(container.textContent).not.toMatch(/<html|gateway time-out|server had a problem/i);
    expect(screen.getByTestId("api-error-retry")).toBeInTheDocument();
  });
});

describe("AC-4: still working", () => {
  it("is absent before 8 s and present after", async () => {
    vi.useFakeTimers();
    render(<StillWorking active />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(7_999);
    });
    expect(screen.queryByTestId("still-working")).not.toBeInTheDocument();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(screen.getByTestId("still-working")).toHaveTextContent(STILL_WORKING_MESSAGE);
  });
});

describe("AC-2 / AC-18: natural-language scheduling", () => {
  it("AC-2: says it is asking the AI from submit until the answer, and the parse waits 65 s for the real answer", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const PARSED = { intent: "schedule_meeting", title: "Sync", suggested_slots: [{ start: "2030-03-04T09:00:00Z", end: "2030-03-04T09:30:00Z", score: 1, reasons: [] }] };
    fetchMock.mockImplementation(() => new Promise((r) => setTimeout(() => r(json(PARSED)), 65_000)));
    const { rerender } = render(<NLPBar loading onSubmit={() => {}} />);
    expect(screen.getByTestId("ai-progress")).toHaveTextContent(/asking the ai/i);
    let result: unknown;
    const p = api.nlpParse("30 min with a@co.com").then((r) => (result = r));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(64_000);
    });
    expect(result).toBeUndefined();
    expect(screen.getByTestId("ai-progress")).toBeInTheDocument();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_000);
    });
    await p;
    expect(result).toMatchObject({ title: "Sync" });
    rerender(<NLPBar loading={false} onSubmit={() => {}} />);
    expect(screen.queryByTestId("ai-progress")).not.toBeInTheDocument();
  });

  it("AC-18: a 413 says 'too large' naming what to shorten, with no retry control", () => {
    render(<NLPBar failure={new ApiHttpError(413, { error: "request body too large" })} onSubmit={() => {}} />);
    const notice = screen.getByTestId("api-error");
    expect(notice).toHaveAttribute("data-error-kind", "too-large");
    expect(notice).toHaveTextContent("This is too large to send. Shorten the request text.");
    expect(screen.queryByTestId("api-error-retry")).not.toBeInTheDocument();
  });
});

describe("AC-17 / AC-19: a write whose outcome is unknown (run focus engine)", () => {
  function renderQuickActions() {
    render(
      <Shell>
        <QuickActions weekISO="2026-11-02" />
      </Shell>,
    );
    fireEvent.click(screen.getByRole("button", { name: /run focus engine/i }));
  }
  const runs = () => fetchMock.mock.calls.filter(([u]) => pathOf(u) === "/api/focus/run").length;

  it("AC-17: the budget 503 says 'took too long' and 'refresh to check'; no success toast", async () => {
    fetchMock.mockImplementation(async (u) => (pathOf(u) === "/api/focus/run" ? json({ error: "request timed out" }, 503) : json([])));
    renderQuickActions();
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith(API_MESSAGES.budgetRead + API_MESSAGES.budgetWriteSuffix));
    expect(toast.success).not.toHaveBeenCalled();
  });

  it.each([
    ["a network failure", () => Promise.reject(new TypeError("Failed to fetch"))],
    ["a non-JSON answer", () => Promise.resolve(new Response("<html></html>", { status: 200, headers: { "content-type": "text/html" } }))],
    ["nginx's HTML 502", () => Promise.resolve(html(502))],
    ["a proxy's HTML 503", () => Promise.resolve(html(503))],
  ])("AC-19: %s says it may or may not have been applied, no success, not re-sent", async (_l, answer) => {
    fetchMock.mockImplementation(async (u) => (pathOf(u) === "/api/focus/run" ? answer() : json([])));
    renderQuickActions();
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith(API_MESSAGES.lostWrite));
    expect(toast.success).not.toHaveBeenCalled();
    expect(runs()).toBe(1);
  });

  it("AC-19: no answer within the client bound says it may or may not have been applied", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    fetchMock.mockImplementation(
      (u, init) =>
        pathOf(u) === "/api/focus/run"
          ? new Promise((_, reject) => init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError"))))
          : Promise.resolve(json([])),
    );
    renderQuickActions();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(136_000);
    });
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith(API_MESSAGES.lostWrite));
    expect(runs()).toBe(1);
  });
});

describe("AC-19: clearing focus blocks (review finding 1)", () => {
  it("a lost answer says it may or may not have been applied, never 'Failed to clear focus blocks'", async () => {
    vi.stubGlobal("confirm", () => true);
    fetchMock.mockImplementation(async (u, init) =>
      pathOf(u) === "/api/focus/blocks" && init?.method === "DELETE" ? html(504) : json([]),
    );
    render(
      <Shell>
        <QuickActions weekISO="2026-11-02" />
      </Shell>,
    );
    fireEvent.click(screen.getByRole("button", { name: /clear focus/i }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith(API_MESSAGES.lostWrite));
    expect(toast.error).not.toHaveBeenCalledWith(expect.stringMatching(/^Failed/));
    expect(fetchMock.mock.calls.filter(([u, init]) => pathOf(u) === "/api/focus/blocks" && init?.method === "DELETE")).toHaveLength(1);
  });
});

describe("AC-28 support: read failures carry the api-error tags (review finding 2)", () => {
  it("ApiErrorText tags a lost read and says 'can't reach'", () => {
    render(<ApiErrorText error={new ApiUnreachableError("network")} effect="read" />);
    const t = screen.getByTestId("api-error");
    expect(t).toHaveAttribute("data-error-kind", "lost");
    expect(t).toHaveAttribute("data-effect", "read");
    expect(t).toHaveTextContent(API_MESSAGES.lostRead);
  });

  it("the audit-log read in Quick actions renders a tagged failure", async () => {
    fetchMock.mockImplementation(async (u) => {
      if (pathOf(u) === "/api/audit") throw new TypeError("Failed to fetch");
      return json([]);
    });
    render(
      <Shell>
        <QuickActions weekISO="2026-11-02" />
      </Shell>,
    );
    fireEvent.click(screen.getByRole("button", { name: /audit log/i }));
    const notice = await screen.findByTestId("api-error");
    expect(notice).toHaveAttribute("data-error-kind", "lost");
  });
});

describe("AC-6: Find a time", () => {
  const TEAM: FormalTeam = {
    id: "t1",
    name: "Core",
    created_at: "2026-01-01T00:00:00Z",
    owner_email: "me@co.com",
    members: [{ email: "me@co.com", display_name: "Me", role: "owner", status: "active", is_paceday_user: true }],
    no_meeting_zones: [],
  };

  it("an answer after 20 s shows the real slots — never mock slots — with 'still working' meanwhile", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    fetchMock.mockImplementation(async (u) => {
      const path = pathOf(u);
      if (path === "/api/teams/t1/availability")
        return new Promise((r) => setTimeout(() => r(json({ slots: [{ start: "2030-03-04T14:00:00Z", end: "2030-03-04T14:30:00Z", quality_score: 88 }] })), 20_000));
      if (path === "/api/teams/t1") return json({ team: { id: "t1", name: "Core" }, members: [{ email: "me@co.com", role: "owner", userId: "u1" }] });
      if (path === "/api/teams/t1/no-meeting-zones") return json([]);
      return json({ error: "not here" }, 404);
    });
    render(
      <Shell>
        <FindATimeTab team={TEAM} />
      </Shell>,
    );
    fireEvent.click(screen.getByRole("button", { name: /find slots/i }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(9_000);
    });
    expect(screen.getByTestId("still-working")).toBeInTheDocument();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(12_000);
    });
    expect(await screen.findByText(/1 of 1 free/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /schedule meeting/i })).toBeInTheDocument();
    expect(screen.queryByTestId("api-error")).not.toBeInTheDocument();
  });

  it("a network failure shows 'can't reach' with a retry, not slots", async () => {
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));
    render(
      <Shell>
        <FindATimeTab team={TEAM} />
      </Shell>,
    );
    fireEvent.click(screen.getByRole("button", { name: /find slots/i }));
    const notice = await screen.findByTestId("api-error");
    expect(notice).toHaveAttribute("data-error-kind", "lost");
    expect(screen.getByTestId("api-error-retry")).toBeInTheDocument();
  });
});

describe("AC-8: the server-status banner", () => {
  it("says the server can't be reached (no demo or preview wording); data calls still go to the server", async () => {
    fetchMock.mockImplementation(async (u) => {
      if (pathOf(u) === "/api/health") throw new TypeError("Failed to fetch");
      return json([]);
    });
    render(<ServerStatusBanner />);
    const banner = await screen.findByTestId("server-unreachable-banner");
    expect(banner).toHaveTextContent(SERVER_UNREACHABLE_MESSAGE);
    expect(banner.textContent ?? "").not.toMatch(/demo|preview/i);
    expect(screen.getByTestId("server-unreachable-retry")).toBeInTheDocument();
    await expect(api.getEvents("2026-11-02T00:00:00Z", "2026-11-09T00:00:00Z")).resolves.toEqual([]);
    expect(fetchMock.mock.calls.some(([u]) => pathOf(u) === "/api/calendar/events")).toBe(true);
  });

  it("is not shown in a demo", () => {
    auth.isDemo = true;
    const { container } = render(<ServerStatusBanner />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe("AC-15 / AC-15b: Connect Zoom", () => {
  const realLocation = window.location;
  const assigned: string[] = [];
  beforeEach(() => {
    assigned.length = 0;
    Object.defineProperty(window, "location", {
      configurable: true,
      value: {
        origin: realLocation.origin,
        search: "",
        get href() {
          return `${realLocation.origin}/settings`;
        },
        set href(v: string) {
          assigned.push(v);
        },
      },
    });
    fetchMock.mockImplementation(async (u) => (pathOf(u) === "/api/conference/providers" ? json([{ provider: "zoom", connected: false }]) : json([])));
  });
  afterAll(() => {
    Object.defineProperty(window, "location", { configurable: true, value: realLocation });
  });

  function renderSection() {
    render(
      <Shell>
        <ConferencingSection settings={{ calendar_provider: "google" } as Settings} onPatch={() => {}} />
      </Shell>,
    );
  }

  it("AC-15b: with the old preview flag forced on and no demo session, starts the real OAuth hand-off", async () => {
    sessionStorage.setItem("clockwise:mock-mode", "1");
    renderSection();
    fireEvent.click(await screen.findByRole("button", { name: /connect zoom account/i }));
    await waitFor(() => expect(assigned).toEqual(["/api/auth/zoom"]));
    expect(toast.success).not.toHaveBeenCalledWith("Zoom connected (demo)");
    sessionStorage.removeItem("clockwise:mock-mode");
  });

  it("AC-15: in a demo session the Zoom connect stays local", async () => {
    sessionStorage.setItem("paceday:demo", "1");
    renderSection();
    fireEvent.click(await screen.findByRole("button", { name: /connect zoom account/i }));
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Zoom connected (demo)"));
    expect(assigned).toEqual([]);
  });
});
