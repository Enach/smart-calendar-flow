/**
 * PAC-122 batch 6b, SF-091: on "Continue", onboarding read the calendar status
 * with `.catch(() => ({ connected: false }))`, so a failed read started an
 * OAuth connect (and saved the work-calendar choice) for a user who may
 * already be connected. A failed read is now said, and nothing is written or
 * started.
 */
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), info: vi.fn() }));
vi.mock("@/hooks/useToast", () => ({ toast }));
vi.mock("@/contexts/useAuth", () => ({ useAuth: () => ({ isDemo: false, user: { id: "u1", email: "a@x.com", name: "A" } }) }));

import Onboarding from "./Onboarding";

const fetchMock = vi.fn<typeof fetch>();
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

describe("PAC-122 SF-091: onboarding on a failed status read", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    toast.error.mockReset();
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockImplementation(async (input) => {
      const path = new URL(String(input), window.location.origin).pathname;
      if (path === "/api/auth/status") return json({ error: "internal error" }, 500);
      if (path === "/api/integrations/availability") {
        return json({ google: { available: true }, microsoft: { available: true }, zoom: { available: false }, webcal: { available: true } });
      }
      // Any write (settings PATCH, connect POST) is answered with a failure, so
      // nothing navigates; the test only checks that none is attempted.
      return json({ error: "not here" }, 500);
    });
  });
  afterAll(() => vi.unstubAllGlobals());

  it("says the status could not be checked and starts no connect", async () => {
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <MemoryRouter>
          <Onboarding />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    fireEvent.click(await screen.findByRole("button", { name: /Google Calendar/ }));
    fireEvent.click(screen.getByRole("button", { name: /continue/i }));
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("Could not check your calendar connection: internal error"),
    );
    const writes = fetchMock.mock.calls.filter(([, init]) => init?.method && init.method !== "GET");
    expect(writes).toEqual([]);
    expect(screen.getByRole("heading", { name: "Connect your calendar" })).toBeInTheDocument();
  });
});
