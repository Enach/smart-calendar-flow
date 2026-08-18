import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

import { AuthProvider } from "./AuthContext";
import { useAuth } from "./useAuth";

const fetchMock = vi.fn<typeof fetch>();

function Probe() {
  const { user, loading, sessionStale } = useAuth();
  if (loading) return <span>loading</span>;
  return (
    <span>
      {user ? `user:${user.email}` : "anon"}|{sessionStale ? "stale" : "fresh"}
    </span>
  );
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("AuthContext resilience", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
    sessionStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("keeps the known user when /api/auth/me fails with a network error", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ id: "1", email: "a@x.com", name: "A" }))
      .mockRejectedValueOnce(new TypeError("Failed to fetch"));

    const { rerender } = render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );
    await screen.findByText("user:a@x.com|fresh");

    // second /me call fails at the network level
    const { refreshRef } = globalThis as unknown as { refreshRef?: () => Promise<void> };
    void refreshRef;
    rerender(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );
    await waitFor(() => {
      expect(screen.getByText(/user:a@x.com/)).toBeInTheDocument();
    });
  });

  it("clears the user on an explicit 401", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ error: "unauthorized" }, 401));
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );
    await screen.findByText("anon|fresh");
  });
});
