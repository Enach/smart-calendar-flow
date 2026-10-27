import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";

const refresh = vi.fn();
vi.mock("@/contexts/useAuth", () => ({ useAuth: () => ({ refresh }) }));

import AuthCallback from "./AuthCallback";

function Where() {
  const loc = useLocation();
  return <span data-testid="where">{loc.pathname + loc.search}</span>;
}

function renderCallback(entry = "/auth/callback") {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <Routes>
        <Route path="/auth/callback" element={<AuthCallback />} />
        <Route path="*" element={<Where />} />
      </Routes>
    </MemoryRouter>,
  );
}

// PAC-35 AC-6: the completion page is the second line of defence. When the
// server says there is no session, the user reaches the failure state.
describe("AuthCallback (PAC-35)", () => {
  it("shows the sign-in failure state when the server reports no session", async () => {
    refresh.mockResolvedValueOnce(null);
    renderCallback();
    expect(await screen.findByTestId("where")).toHaveTextContent("/?error=auth_failed");
  });

  it("goes on to the app when a session exists", async () => {
    refresh.mockResolvedValueOnce({ id: "u1", email: "a@x.com", name: "A" });
    renderCallback("/auth/callback?provider=sso");
    expect(await screen.findByTestId("where")).toHaveTextContent(/^\/app$/);
  });

  it("keeps a safe internal redirect", async () => {
    refresh.mockResolvedValueOnce({ id: "u1", email: "a@x.com", name: "A" });
    renderCallback("/auth/callback?redirect=/app/links");
    expect(await screen.findByTestId("where")).toHaveTextContent(/^\/app\/links$/);
  });

  it("sends a failed check to the failure state too", async () => {
    refresh.mockRejectedValueOnce(new Error("boom"));
    renderCallback();
    expect(await screen.findByTestId("where")).toHaveTextContent("/?error=auth_failed");
  });
});
