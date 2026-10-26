import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), info: vi.fn() }));
vi.mock("@/hooks/useToast", () => ({ toast }));

import { QuickActions } from "./QuickActions";
import { setMockMode } from "@/api/client";

// PAC-32 (API-015): running the focus engine against the real backend reads
// the run result's createdBlocks. Before the fix the component read
// created_blocks, which the server never sends, threw on `.length`, showed an
// error toast after a successful run and never refreshed the calendar.

const fetchMock = vi.fn<typeof fetch>();

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

describe("QuickActions run focus engine (PAC-32)", () => {
  beforeEach(() => {
    setMockMode(false);
    toast.success.mockReset();
    toast.error.mockReset();
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterAll(() => {
    vi.unstubAllGlobals();
  });

  it("reports the number of blocks the server created and refreshes the focus data", async () => {
    fetchMock.mockImplementation(async (input) => {
      const path = new URL(String(input), window.location.origin).pathname;
      if (path === "/api/focus/run") {
        return jsonResponse({
          weekStart: "2026-11-02T00:00:00Z",
          createdBlocks: [
            { google_event_id: "g1", start_time: "2026-11-02T08:00:00Z", end_time: "2026-11-02T09:30:00Z", date: "2026-11-02" },
            { google_event_id: "g2", start_time: "2026-11-03T08:00:00Z", end_time: "2026-11-03T09:30:00Z", date: "2026-11-03" },
          ],
          skippedDays: [],
          totalMinutes: 180,
          errors: [],
        });
      }
      return jsonResponse({ error: "not here" }, 404);
    });
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const invalidate = vi.spyOn(qc, "invalidateQueries");

    render(
      <QueryClientProvider client={qc}>
        <MemoryRouter>
          <QuickActions weekISO="2026-11-02" />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: /run focus engine/i }));

    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Created 2 focus blocks"));
    expect(toast.error).not.toHaveBeenCalled();
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["focusBlocks"] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["events"] });
  });
});
