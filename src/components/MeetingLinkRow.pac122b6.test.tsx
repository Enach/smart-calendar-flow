/**
 * PAC-122 batch 6, SF-056: a failed provider list (GET /api/conference/providers)
 * defaulted to `[]`, so the "Add meeting link" menu offered no provider and an
 * attempt said "isn't connected" for providers whose state was never read.
 * The menu now shows the read's error with a retry, and an add is not refused
 * as "not connected" while the list is unknown.
 */
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), info: vi.fn() }));
vi.mock("@/hooks/useToast", () => ({ toast }));

import { MeetingLinkRow } from "./MeetingLinkRow";

const fetchMock = vi.fn<typeof fetch>();

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

function Shell({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

let providerAnswers: Array<() => Response> = [];

describe("PAC-122 SF-056: a failed provider list in the meeting-link menu", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    toast.error.mockReset();
    vi.stubGlobal("fetch", fetchMock);
    providerAnswers = [];
    fetchMock.mockImplementation(async (input) => {
      const path = new URL(String(input), window.location.origin).pathname;
      if (path === "/api/conference/providers") {
        return (providerAnswers.shift() ?? (() => jsonResponse({ error: "internal error" }, 500)))();
      }
      return jsonResponse({ error: "not here" }, 404);
    });
  });
  afterAll(() => vi.unstubAllGlobals());

  it("shows the read's error in the menu instead of an empty provider list", async () => {
    render(
      <Shell>
        <MeetingLinkRow eventId="e1" onChange={() => {}} />
      </Shell>,
    );
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    fireEvent.click(screen.getByRole("button", { name: /add meeting link/i }));
    const alert = await screen.findByTestId("conference-providers-error");
    expect(alert).toHaveTextContent(/could not load your meeting providers/i);
    expect(within(alert).getByTestId("api-error")).toHaveTextContent("internal error");
  });

  it("retries the read and then lists the providers", async () => {
    providerAnswers = [
      () => jsonResponse({ error: "internal error" }, 500),
      () => jsonResponse([{ provider: "zoom", connected: true }]),
    ];
    render(
      <Shell>
        <MeetingLinkRow eventId="e1" onChange={() => {}} />
      </Shell>,
    );
    fireEvent.click(screen.getByRole("button", { name: /add meeting link/i }));
    fireEvent.click(await screen.findByRole("button", { name: /try again/i }));
    expect(await screen.findByRole("button", { name: /zoom/i })).toBeEnabled();
    expect(screen.queryByTestId("conference-providers-error")).not.toBeInTheDocument();
  });
});
