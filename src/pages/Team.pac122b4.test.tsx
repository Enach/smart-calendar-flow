/**
 * PAC-122 batch 4 (docs/factory/silent-failures.md SF-049, paired with the
 * backend's SF-009): "Enable Manager mode" on the Team page awaits the
 * profile write; a failed write keeps Manager mode off and shows the error.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";

const toasts = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("@/hooks/useToast", () => ({ toast: toasts }));
vi.mock("@/components/Navbar", () => ({ Navbar: () => null }));

import Team from "./Team";
import { managerApi } from "@/api/manager";
import { teamsApi } from "@/api/teams";

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={["/app/team?tab=team"]}>
        <Team />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("PAC-122 SF-049: Enable Manager mode awaits the profile write", () => {
  beforeEach(() => {
    localStorage.clear();
    toasts.success.mockReset();
    toasts.error.mockReset();
    vi.spyOn(teamsApi.remote, "list").mockResolvedValue([]);
  });
  afterEach(() => vi.restoreAllMocks());

  it("a failed write keeps Manager mode off and never claims success", async () => {
    const set = vi.spyOn(managerApi.remote, "setProfile").mockRejectedValue(new Error("network down"));
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: /enable manager mode/i }));

    await waitFor(() => expect(toasts.error).toHaveBeenCalled());
    expect(set).toHaveBeenCalledTimes(1);
    expect(toasts.success).not.toHaveBeenCalled();
    expect(screen.getByText(/manager mode is off/i)).toBeInTheDocument();
  });

  it("a stored write turns Manager mode on and says so", async () => {
    vi.spyOn(managerApi.remote, "setProfile").mockResolvedValue({ is_manager: true, onboarding_profile_selected: true });
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: /enable manager mode/i }));

    await waitFor(() => expect(toasts.success).toHaveBeenCalled());
    expect(toasts.error).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByText(/manager mode is off/i)).not.toBeInTheDocument());
  });
});
