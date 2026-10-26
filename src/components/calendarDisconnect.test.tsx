import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactElement, ReactNode } from "react";

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), info: vi.fn() }));
vi.mock("@/hooks/useToast", () => ({ toast }));

import { ConnectionStatus } from "./ConnectionStatus";
import { WorkCalendarConnection } from "./WorkCalendarConnection";
import { isUsingMocks, setMockMode } from "@/api/client";
import type { Settings } from "@/api/types";

// PAC-35 AC-17 (web half), on both places the app offers a calendar
// disconnect: the dashboard card (ConnectionStatus) and the settings section
// (WorkCalendarConnection).

const NOT_AVAILABLE = /disconnecting this kind of calendar is not available yet/i;
const UNSUPPORTED = { error: "disconnecting this kind of calendar is not available yet", provider: "outlook" };

const fetchMock = vi.fn<typeof fetch>();

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

function Shell({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

const surfaces: Array<[string, () => ReactElement]> = [
  ["dashboard card", () => <ConnectionStatus />],
  [
    "settings section",
    () => <WorkCalendarConnection settings={{} as Settings} onPatch={() => {}} />,
  ],
];

/** Serves the calendar status, provider availability, and the disconnect answer. */
function serve(status: unknown, disconnect: () => Response) {
  fetchMock.mockImplementation(async (input, init) => {
    const path = new URL(String(input), window.location.origin).pathname;
    if (path === "/api/auth/status") return jsonResponse(status);
    if (path === "/api/auth/disconnect" && init?.method === "DELETE") return disconnect();
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

describe.each(surfaces)("calendar disconnect on the %s (PAC-35)", (_name, renderSurface) => {
  beforeEach(() => {
    setMockMode(false);
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
    toast.success.mockReset();
    toast.error.mockReset();
  });
  afterAll(() => vi.unstubAllGlobals());

  it.each(["outlook", "webcal"])("offers no disconnect for a connected %s calendar and says why", async (provider) => {
    serve({ connected: true, provider, email: "a@x.com" }, () => new Response(null, { status: 204 }));
    render(<Shell>{renderSurface()}</Shell>);

    expect(await screen.findByText(NOT_AVAILABLE)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Disconnect" })).not.toBeInTheDocument();
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === "DELETE")).toBe(false);
  });

  it("still disconnects a Google calendar", async () => {
    serve({ connected: true, provider: "google", email: "a@x.com" }, () => new Response(null, { status: 204 }));
    render(<Shell>{renderSurface()}</Shell>);

    fireEvent.click(await screen.findByRole("button", { name: "Disconnect" }));
    await waitFor(() => expect(toast.success).toHaveBeenCalledTimes(1));
    expect(toast.error).not.toHaveBeenCalled();
  });

  it("treats the server's 409 from a stale Google status as 'not available yet', never as success or preview", async () => {
    serve({ connected: true, provider: "google", email: "a@x.com" }, () => jsonResponse(UNSUPPORTED, 409));
    render(<Shell>{renderSurface()}</Shell>);

    fireEvent.click(await screen.findByRole("button", { name: "Disconnect" }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledTimes(1));
    expect(toast.error.mock.calls[0][0]).toMatch(NOT_AVAILABLE);
    expect(toast.success).not.toHaveBeenCalled();
    expect(isUsingMocks()).toBe(false);
  });

  it("keeps the generic failure message for any other failure", async () => {
    serve({ connected: true, provider: "google", email: "a@x.com" }, () => jsonResponse({ error: "internal error" }, 500));
    render(<Shell>{renderSurface()}</Shell>);

    fireEvent.click(await screen.findByRole("button", { name: "Disconnect" }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Failed to disconnect"));
    expect(toast.success).not.toHaveBeenCalled();
  });
});
