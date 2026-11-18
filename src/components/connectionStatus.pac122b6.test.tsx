/**
 * PAC-122 batch 6, SF-055: a failed calendar status read (GET /api/auth/status)
 * showed "Not connected" and, on the dashboard card, a Connect button. The
 * error was never rendered. Both surfaces now say the status could not be
 * checked, show the read's error and offer a retry; neither claims "Not
 * connected", and the card offers no Connect for a state it does not know.
 */
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactElement, ReactNode } from "react";

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), info: vi.fn() }));
vi.mock("@/hooks/useToast", () => ({ toast }));

import { ConnectionStatus } from "./ConnectionStatus";
import { WorkCalendarConnection } from "./WorkCalendarConnection";
import type { Settings } from "@/api/types";

const fetchMock = vi.fn<typeof fetch>();

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

function Shell({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

let statusAnswers: Array<() => Response> = [];

function serve() {
  fetchMock.mockImplementation(async (input) => {
    const path = new URL(String(input), window.location.origin).pathname;
    if (path === "/api/auth/status") return (statusAnswers.shift() ?? (() => jsonResponse({ error: "internal error" }, 500)))();
    if (path === "/api/integrations/availability") {
      return jsonResponse({
        google: { available: true },
        microsoft: { available: true },
        zoom: { available: false },
        webcal: { available: true },
      });
    }
    return jsonResponse({ error: "not here" }, 404);
  });
}

const surfaces: Array<[string, () => ReactElement]> = [
  ["dashboard card", () => <ConnectionStatus />],
  ["settings section", () => <WorkCalendarConnection settings={{} as Settings} onPatch={() => {}} />],
];

describe.each(surfaces)("PAC-122 SF-055: a failed status read on the %s", (name, renderSurface) => {
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
    statusAnswers = [];
    serve();
  });
  afterAll(() => vi.unstubAllGlobals());

  it("says the status could not be checked and shows the error, never 'Not connected'", async () => {
    render(<Shell>{renderSurface()}</Shell>);
    const alert = await screen.findByTestId("calendar-status-error");
    expect(alert).toHaveTextContent(/could not check your calendar connection/i);
    expect(within(alert).getByTestId("api-error")).toHaveTextContent("internal error");
    expect(screen.queryByText("Not connected")).not.toBeInTheDocument();
    if (name === "dashboard card") {
      expect(screen.queryByRole("button", { name: /^connect$/i })).not.toBeInTheDocument();
    }
  });

  it("retries the read and shows the real status once it answers", async () => {
    statusAnswers = [() => jsonResponse({ error: "internal error" }, 500), () => jsonResponse({ connected: true, provider: "google", email: "a@x.com" })];
    render(<Shell>{renderSurface()}</Shell>);
    fireEvent.click(await screen.findByRole("button", { name: /try again/i }));
    await waitFor(() => expect(screen.queryByTestId("calendar-status-error")).not.toBeInTheDocument());
    expect(await screen.findByText(/a@x\.com/)).toBeInTheDocument();
  });
});
