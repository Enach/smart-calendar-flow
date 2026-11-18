/**
 * PAC-122 batch 4 (docs/factory/silent-failures.md SF-049, paired with the
 * backend's SF-009): the Settings role toggle awaits the profile write. A
 * failed POST /api/manager/profile leaves the role as it was and shows the
 * error; success is shown only once the server answered.
 */
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";

vi.hoisted(() => {
  (window as Window & { __API_BASE_URL__?: string }).__API_BASE_URL__ = "https://api.paceday.test/api";
});

const toasts = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));

vi.mock("@/hooks/useToast", () => ({ toast: toasts }));
vi.mock("@/components/Navbar", () => ({ Navbar: () => null }));
vi.mock("@/components/ServerStatusBanner", () => ({ ServerStatusBanner: () => null }));
vi.mock("@/components/WorkCalendarConnection", () => ({ WorkCalendarConnection: () => null }));
vi.mock("@/components/PersonalCalendarsSection", () => ({ PersonalCalendarsSection: () => null }));
vi.mock("@/components/ConferencingSection", () => ({ ConferencingSection: () => null }));
vi.mock("@/components/settings/OrganizationAISection", () => ({ OrganizationAISection: () => null }));
vi.mock("@/components/settings/SsoAdminStepupSection", () => ({ SsoAdminStepupSection: () => null }));
vi.mock("@/components/settings/AddressStandingNotice", () => ({ AddressStandingNotice: () => null }));
const state = vi.hoisted(() => ({ settings: undefined as unknown }));

vi.mock("@/hooks/useSettings", () => ({
  useSettings: () => ({ data: state.settings, isLoading: false, refetch: async () => ({ data: state.settings }) }),
  useUpdateSettings: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));
vi.mock("@/hooks/useOrganizationAI", () => ({
  useOrganizationAI: () => ({ data: { personalKeysAllowed: true } }),
}));

import SettingsPage from "./Settings";
import { managerApi } from "@/api/manager";
import { normalizeSettings } from "@/api/client";

const fetchMock = vi.fn<typeof fetch>();

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

function profilePosts() {
  return fetchMock.mock.calls.filter(
    ([url, init]) => String(url).endsWith("/manager/profile") && init?.method === "POST",
  );
}

function renderPage() {
  render(
    <MemoryRouter>
      <SettingsPage />
    </MemoryRouter>,
  );
}

describe("PAC-122 SF-049: the Settings role toggle awaits the profile write", () => {
  beforeEach(() => {
    state.settings = normalizeSettings({
      workStart: "09:00",
      workEnd: "18:00",
      timezone: "UTC",
      focusDailyTargetMinutes: 240,
      lunchStart: "12:00",
      lunchEnd: "13:00",
      protectLunch: true,
      workingHours: { mode: "all_days", default: { enabled: true, start: "09:00", end: "18:00" }, days: {} },
      lunchBreaks: {},
      recapEnabled: false,
    });
    localStorage.clear();
    toasts.success.mockReset();
    toasts.error.mockReset();
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterAll(() => vi.unstubAllGlobals());

  it("a failed write keeps the role, shows the error and never claims success", async () => {
    fetchMock.mockImplementation(async (url, init) =>
      String(url).endsWith("/manager/profile") && init?.method === "POST"
        ? json(500, { error: "internal error" })
        : json(200, {}),
    );
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: /^manager$/i }));

    await waitFor(() => expect(toasts.error).toHaveBeenCalled());
    expect(profilePosts()).toHaveLength(1);
    expect(toasts.success).not.toHaveBeenCalled();
    expect(managerApi.getProfile().is_manager).toBe(false);
    expect(screen.queryByRole("button", { name: /choose a team and scan calendar/i })).not.toBeInTheDocument();
  });

  it("a stored write switches the role and says so", async () => {
    fetchMock.mockImplementation(async () => json(200, { user_id: "u", is_manager: true }));
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: /^manager$/i }));

    await waitFor(() => expect(toasts.success).toHaveBeenCalled());
    expect(profilePosts()).toHaveLength(1);
    expect(toasts.error).not.toHaveBeenCalled();
    expect(managerApi.getProfile().is_manager).toBe(true);
    expect(await screen.findByRole("button", { name: /choose a team and scan calendar/i })).toBeInTheDocument();
  });
});
