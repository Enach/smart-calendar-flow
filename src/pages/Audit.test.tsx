import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";

vi.mock("@/components/Navbar", () => ({ Navbar: () => null }));
vi.mock("@/components/MockBanner", () => ({ MockBanner: () => null }));

import AuditPage from "./Audit";
import { setMockMode } from "@/api/client";

// PAC-67: the activity log words the three connection kinds instead of
// showing their identifiers; every other kind is shown as before.

const fetchMock = vi.fn<typeof fetch>();

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

describe("Audit page connection entries (PAC-67)", () => {
  beforeEach(() => {
    setMockMode(false);
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterAll(() => {
    vi.unstubAllGlobals();
  });

  it("shows readable titles for the connection kinds and leaves the others raw", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse([
        { id: 4, action: "revocation_unconfirmed", details: '{"provider":"zoom"}', created_at: "2030-01-07T10:03:00Z" },
        { id: 3, action: "provider_disconnected", details: '{"provider":"zoom","revocation":"unconfirmed"}', created_at: "2030-01-07T10:02:00Z" },
        { id: 2, action: "connection_lost", details: '{"provider":"outlook"}', created_at: "2030-01-07T10:01:00Z" },
        { id: 1, action: "focus_created", details: '{"blocks":2}', created_at: "2030-01-07T10:00:00Z" },
      ]),
    );
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <MemoryRouter>
          <AuditPage />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    expect(await screen.findByText("Outlook connection lost")).toBeInTheDocument();
    expect(screen.getByText("Zoom disconnected")).toBeInTheDocument();
    expect(screen.getByText("Zoom revocation not confirmed")).toBeInTheDocument();
    expect(screen.getByText("Remove Paceday from the apps connected to your Zoom account.")).toBeInTheDocument();
    expect(screen.getByText("focus_created")).toBeInTheDocument();
    expect(screen.getByText('{"blocks":2}')).toBeInTheDocument();
    expect(screen.queryByText("connection_lost")).not.toBeInTheDocument();
  });
});
