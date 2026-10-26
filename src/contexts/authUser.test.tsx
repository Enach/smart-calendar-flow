import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";

import { AuthProvider } from "./AuthContext";
import { useAuth } from "./useAuth";

const fetchMock = vi.fn<typeof fetch>();

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

function Probe() {
  const { user, loading, refresh } = useAuth();
  const [result, setResult] = useState("none");
  if (loading) return <span>loading</span>;
  return (
    <div>
      <span data-testid="avatar">{user?.avatarUrl ?? "no-avatar"}</span>
      <span data-testid="result">{result}</span>
      <button
        onClick={async () => {
          const me = await refresh();
          setResult(me === null ? "no-session" : me ? `user:${me.email}` : "unavailable");
        }}
      >
        refresh
      </button>
    </div>
  );
}

const ME = {
  id: "11111111-1111-4111-8111-111111111111",
  email: "a@x.com",
  name: "A",
  avatarUrl: "https://img.test/a.png",
  provider: "google",
  createdAt: "2026-01-01T00:00:00Z",
};

describe("the current user (PAC-35)", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
    sessionStorage.clear();
  });
  afterEach(() => vi.unstubAllGlobals());

  // AC-13: the picture is read under the contract's one name, avatarUrl.
  it("exposes the picture as avatarUrl", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(ME));
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );
    expect(await screen.findByTestId("avatar")).toHaveTextContent("https://img.test/a.png");
  });

  // AC-6 relies on refresh telling "no session" apart from "unavailable".
  it("reports what refresh found: the user, no session, or unavailable", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(ME));
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );
    await screen.findByTestId("avatar");

    fetchMock.mockResolvedValueOnce(jsonResponse(ME));
    fireEvent.click(screen.getByRole("button", { name: "refresh" }));
    expect(await screen.findByText("user:a@x.com")).toBeInTheDocument();

    fetchMock.mockResolvedValueOnce(jsonResponse({ error: "unauthorized" }, 401));
    fireEvent.click(screen.getByRole("button", { name: "refresh" }));
    expect(await screen.findByText("no-session")).toBeInTheDocument();

    fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    fireEvent.click(screen.getByRole("button", { name: "refresh" }));
    expect(await screen.findByText("unavailable")).toBeInTheDocument();
  });
});
