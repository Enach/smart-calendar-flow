import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { RequireAuth } from "./RequireAuth";
import { AuthContext, type AuthContextValue } from "@/contexts/auth-context";
import { managerApi } from "@/api/manager";
import { ApiHttpError } from "@/api/client";

const authValue: AuthContextValue = {
  user: { id: "1", email: "a@x.com", name: "A" },
  isDemo: false,
  loading: false,
  sessionStale: false,
  refresh: async () => {},
  loginDemo: () => {},
  exitDemo: () => {},
  logout: async () => {},
};

function renderGate() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <AuthContext.Provider value={authValue}>
        <MemoryRouter initialEntries={["/app"]}>
          <Routes>
            <Route
              path="/app"
              element={
                <RequireAuth>
                  <div>app content</div>
                </RequireAuth>
              }
            />
            <Route path="/app/onboarding" element={<div>onboarding</div>} />
          </Routes>
        </MemoryRouter>
      </AuthContext.Provider>
    </QueryClientProvider>,
  );
}

describe("RequireAuth onboarding gate", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("lets a user with a complete server profile into the app", async () => {
    vi.spyOn(managerApi.remote, "getProfile").mockResolvedValue({
      is_manager: true,
      onboarding_profile_selected: true,
    });
    renderGate();
    expect(await screen.findByText("app content")).toBeInTheDocument();
  });

  it("redirects to onboarding when the server profile is incomplete", async () => {
    vi.spyOn(managerApi.remote, "getProfile").mockResolvedValue({
      is_manager: false,
      onboarding_profile_selected: false,
    });
    renderGate();
    expect(await screen.findByText("onboarding")).toBeInTheDocument();
  });

  it("shows a loader (no redirect) while the profile is loading", () => {
    vi.spyOn(managerApi.remote, "getProfile").mockReturnValue(new Promise(() => {}));
    renderGate();
    expect(screen.queryByText("onboarding")).not.toBeInTheDocument();
    expect(screen.queryByText("app content")).not.toBeInTheDocument();
  });

  it("surfaces a profile request failure with a retry action", async () => {
    vi.spyOn(managerApi.remote, "getProfile").mockRejectedValue(new ApiHttpError(500));
    renderGate();
    expect(await screen.findByRole("button", { name: "Retry" })).toBeInTheDocument();
    expect(screen.queryByText("onboarding")).not.toBeInTheDocument();
  });
});
