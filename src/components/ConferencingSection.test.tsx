import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), info: vi.fn() }));
vi.mock("@/hooks/useToast", () => ({ toast }));

import { ConferencingSection } from "./ConferencingSection";
import { setMockMode } from "@/api/client";
import type { Settings } from "@/api/types";

// PAC-67 (web half): the Zoom disconnect tells the user when Zoom did not
// confirm the revocation (spec D-2, AC-15), and a connected Outlook credential
// can be disconnected from the Teams row (AC-13, AC-17).

const fetchMock = vi.fn<typeof fetch>();

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

function Shell({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

function serve(rows: unknown[], disconnects: Record<string, unknown>) {
  fetchMock.mockImplementation(async (input, init) => {
    const path = new URL(String(input), window.location.origin).pathname;
    if (path === "/api/conference/providers") return jsonResponse(rows);
    if (init?.method === "POST" && path in disconnects) return jsonResponse(disconnects[path]);
    return jsonResponse({ error: "not here" }, 404);
  });
}

function renderSection(settings: Partial<Settings> = {}) {
  render(
    <Shell>
      <ConferencingSection settings={{ calendar_provider: "google", ...settings } as Settings} onPatch={() => {}} />
    </Shell>,
  );
}

const ZOOM = "/api/conference/zoom/disconnect";
const MICROSOFT = "/api/auth/microsoft/disconnect";

describe("ConferencingSection disconnects (PAC-67)", () => {
  beforeEach(() => {
    setMockMode(false);
    fetchMock.mockReset();
    toast.success.mockReset();
    toast.error.mockReset();
    toast.info.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterAll(() => {
    vi.unstubAllGlobals();
  });

  it("says Zoom did not confirm the revocation instead of a plain success", async () => {
    serve([{ provider: "zoom", connected: true }], { [ZOOM]: { provider: "zoom", revocation: "unconfirmed" } });
    renderSection();
    fireEvent.click(await screen.findByRole("button", { name: /disconnect zoom/i }));
    await waitFor(() => expect(toast.info).toHaveBeenCalledWith(expect.stringMatching(/Zoom did not confirm/i)));
    expect(toast.success).not.toHaveBeenCalled();
  });

  it("reports a confirmed Zoom revocation as a success", async () => {
    serve([{ provider: "zoom", connected: true }], { [ZOOM]: { provider: "zoom", revocation: "confirmed" } });
    renderSection();
    fireEvent.click(await screen.findByRole("button", { name: /disconnect zoom/i }));
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Disconnected Zoom"));
  });

  it("offers an Outlook disconnect while Teams is connected, and tells where to remove the grant", async () => {
    serve([{ provider: "teams", connected: true, enabled: true, auto_with: "outlook" }], {
      [MICROSOFT]: { provider: "outlook", revocation: "not_offered" },
    });
    renderSection({ calendar_provider: "outlook" });
    fireEvent.click(await screen.findByRole("button", { name: /disconnect outlook/i }));
    await waitFor(() => expect(toast.info).toHaveBeenCalledWith(expect.stringMatching(/Microsoft account/i)));
    const call = fetchMock.mock.calls.find(([input]) => new URL(String(input), window.location.origin).pathname === MICROSOFT);
    expect(call?.[1]?.method).toBe("POST");
  });

  it("offers no Outlook disconnect when Teams is not connected", async () => {
    serve([{ provider: "teams", connected: false, auto_with: "outlook" }], {});
    renderSection();
    expect(await screen.findByRole("switch", { name: "Attach Microsoft Teams links" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /disconnect outlook/i })).not.toBeInTheDocument();
  });

  it("shows the server's error when the Outlook disconnect fails", async () => {
    serve([{ provider: "teams", connected: true, enabled: true, auto_with: "outlook" }], {});
    fetchMock.mockImplementation(async (input, init) => {
      const path = new URL(String(input), window.location.origin).pathname;
      if (path === "/api/conference/providers") return jsonResponse([{ provider: "teams", connected: true, enabled: true }]);
      if (init?.method === "POST" && path === MICROSOFT) return jsonResponse({ error: "internal error" }, 500);
      return jsonResponse({ error: "not here" }, 404);
    });
    renderSection();
    fireEvent.click(await screen.findByRole("button", { name: /disconnect outlook/i }));
    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    expect(toast.info).not.toHaveBeenCalled();
  });
});
