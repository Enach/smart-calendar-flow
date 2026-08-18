import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { AuthProvider } from "./AuthContext";
import { useAuth } from "./useAuth";

const fetchMock = vi.fn<typeof fetch>();

function Probe() {
  const { user, loading, sessionStale, refresh } = useAuth();
  if (loading) return <span>loading</span>;
  return (
    <div>
      <span>
        {user ? `user:${user.email}` : "anon"}|{sessionStale ? "stale" : "fresh"}
      </span>
      <button onClick={() => void refresh()}>refresh</button>
    </div>
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

  it("keeps the known user when /api/auth/me fails because the backend is unreachable", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ id: "1", email: "a@x.com", name: "A" }));
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );
    await screen.findByText("user:a@x.com|fresh");

    fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    await userEvent.click(screen.getByRole("button", { name: "refresh" }));

    await waitFor(() => {
      expect(screen.getByText("user:a@x.com|stale")).toBeInTheDocument();
    });
  });

  it("clears the user on an explicit 401", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ id: "1", email: "a@x.com", name: "A" }));
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );
    await screen.findByText("user:a@x.com|fresh");

    fetchMock.mockResolvedValueOnce(jsonResponse({ error: "unauthorized" }, 401));
    await userEvent.click(screen.getByRole("button", { name: "refresh" }));

    await screen.findByText("anon|fresh");
  });
});
