/**
 * PAC-122 batch 6 (web-only silent failures), Settings page rows.
 *
 * SF-047: the "Calendar ID" field was never saved. `calendar_id` is not a
 * property of `SettingsUpdate`, so `settingsPatchBody` dropped it, the page
 * still said "Settings saved", and the field came back as an invented
 * "primary". Making it work needs a contract change (register §7), so the
 * dead field is removed: nothing on the page offers a value that is not saved.
 *
 * SF-084 (batch 6b): a failed settings read kept the spinner forever
 * (`isLoading || !draft`). The read's error is now shown with a retry.
 */
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";

const state = vi.hoisted(() => ({ settings: undefined as unknown, error: null as unknown, refetch: (() => {}) as () => unknown }));

vi.mock("@/components/Navbar", () => ({ Navbar: () => null }));
vi.mock("@/components/ServerStatusBanner", () => ({ ServerStatusBanner: () => null }));
vi.mock("@/components/WorkCalendarConnection", () => ({ WorkCalendarConnection: () => null }));
vi.mock("@/components/PersonalCalendarsSection", () => ({ PersonalCalendarsSection: () => null }));
vi.mock("@/components/ConferencingSection", () => ({ ConferencingSection: () => null }));
vi.mock("@/components/settings/OrganizationAISection", () => ({ OrganizationAISection: () => null }));
vi.mock("@/components/settings/SsoAdminStepupSection", () => ({ SsoAdminStepupSection: () => null }));
vi.mock("@/components/settings/AddressStandingNotice", () => ({ AddressStandingNotice: () => null }));
vi.mock("@/hooks/useSettings", () => ({
  useSettings: () => ({
    data: state.settings,
    isLoading: false,
    isError: state.error != null,
    error: state.error,
    isFetching: false,
    refetch: async () => {
      state.refetch();
      return { data: state.settings };
    },
  }),
  useUpdateSettings: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));
vi.mock("@/hooks/useOrganizationAI", () => ({ useOrganizationAI: () => ({ data: undefined }) }));

import SettingsPage from "./Settings";
import { API_MESSAGES, ApiHttpError, normalizeSettings } from "@/api/client";

function saved() {
  return normalizeSettings({
    workStart: "09:00",
    workEnd: "18:00",
    timezone: "UTC",
    focusDailyTargetMinutes: 240,
    lunchStart: "12:00",
    lunchEnd: "13:00",
    protectLunch: true,
    workingHours: { mode: "all_days", default: { enabled: true, start: "09:00", end: "18:00" }, days: {} },
    lunchBreaks: {},
    llmProvider: "openai",
    llmModel: "",
    llmApiKeySet: false,
    recapEnabled: false,
  });
}

describe("PAC-122 batch 6, Settings", () => {
  it("SF-047: offers no Calendar ID field, since the server never saves one", async () => {
    state.error = null;
    state.settings = saved();
    render(
      <MemoryRouter>
        <SettingsPage />
      </MemoryRouter>,
    );
    await screen.findByText("Calendar Connection");
    expect(screen.queryByText("Calendar ID")).not.toBeInTheDocument();
    expect(screen.queryByDisplayValue("primary")).not.toBeInTheDocument();
  });

  it("SF-084: a failed settings read shows its error and a retry, not a spinner forever", async () => {
    state.settings = undefined;
    state.error = new ApiHttpError(500, { error: "internal error" }, "internal error");
    const refetch = vi.fn();
    state.refetch = refetch;
    render(
      <MemoryRouter>
        <SettingsPage />
      </MemoryRouter>,
    );
    const alert = await screen.findByTestId("api-error");
    // PAC-69: the 500's wording comes from its status, not the server's text.
    expect(alert).toHaveTextContent(API_MESSAGES.serverProblem);
    expect(alert).toHaveAttribute("data-effect", "read");
    fireEvent.click(screen.getByTestId("api-error-retry"));
    expect(refetch).toHaveBeenCalledOnce();
  });
});
