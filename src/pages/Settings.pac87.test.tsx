/**
 * PAC-87 (spec §3.6, PAC87-AC-15, PAC87-AC-16, factory decision on the
 * probe): Settings for a member in row 9 (own provider stored, organisation
 * forbids personal keys, confirmed). The own choice is shown kept but not
 * used, a line says AI runs on the organisation's AI, and Test connection
 * probes that AI with `{}`.
 */
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";

vi.hoisted(() => {
  (window as Window & { __API_BASE_URL__?: string }).__API_BASE_URL__ = "https://api.paceday.test/api";
});

const state = vi.hoisted(() => ({ settings: undefined as unknown }));

vi.mock("@/components/Navbar", () => ({ Navbar: () => null }));
vi.mock("@/components/ServerStatusBanner", () => ({ ServerStatusBanner: () => null }));
vi.mock("@/components/WorkCalendarConnection", () => ({ WorkCalendarConnection: () => null }));
vi.mock("@/components/PersonalCalendarsSection", () => ({ PersonalCalendarsSection: () => null }));
vi.mock("@/components/ConferencingSection", () => ({ ConferencingSection: () => null }));
vi.mock("@/components/settings/OrganizationAISection", () => ({ OrganizationAISection: () => null }));
vi.mock("@/components/settings/SsoAdminStepupSection", () => ({ SsoAdminStepupSection: () => null }));
// PAC-71's sign-in address notice reads the auth context; not under test here.
vi.mock("@/components/settings/AddressStandingNotice", () => ({ AddressStandingNotice: () => null }));
vi.mock("@/hooks/useSettings", () => ({
  useSettings: () => ({ data: state.settings, isLoading: false, refetch: async () => ({ data: state.settings }) }),
  useUpdateSettings: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));
vi.mock("@/hooks/useOrganizationAI", () => ({
  useOrganizationAI: () => ({ data: { personalKeysAllowed: false } }),
}));

import SettingsPage from "./Settings";
import { normalizeSettings } from "@/api/client";

const API = "https://api.paceday.test/api";
const fetchMock = vi.fn<typeof fetch>();
const WORDS = /\b(read|reads|see)\b/i;

function settings(aiStatus: Record<string, unknown>, llmProvider = "openai") {
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
    llmProvider,
    llmModel: "gpt-own",
    llmApiKeySet: true,
    llmApiKeysSet: { openai: true, anthropic: false, azure_openai: false, bedrock: false, vertex: false },
    recapEnabled: false,
    aiStatus,
  });
}

const row9 = { configured: true, configuration: "organization", provider: "anthropic", inOrganization: true };

function renderPage() {
  render(
    <MemoryRouter>
      <SettingsPage />
    </MemoryRouter>,
  );
}

describe("PAC-87 Settings, a member in row 9", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ ok: true, response: "pong", provider: "anthropic", configuration: "organization" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
  });
  afterAll(() => vi.unstubAllGlobals());

  it("keeps the own choice, says AI runs on the organisation's AI, and never says read/reads/see", async () => {
    state.settings = settings(row9);
    renderPage();
    const line = await screen.findByTestId("ai-runs-on-org");
    expect(line).toHaveTextContent("AI runs on your organisation's AI (Anthropic)");
    expect(line.textContent).not.toMatch(WORDS);
    expect(screen.getByTestId("ai-personal-keys-forbidden")).toHaveTextContent("Your own choice (OpenAI)");
    expect(screen.queryByTestId("ai-off-notice")).not.toBeInTheDocument();
  });

  it("Test connection sends {} so it tests the organisation's AI the member uses", async () => {
    state.settings = settings(row9);
    renderPage();
    await screen.findByTestId("ai-runs-on-org");
    fireEvent.click(screen.getByRole("button", { name: /test connection/i }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe(`${API}/llm/test`);
    expect(init?.method).toBe("POST");
    expect(JSON.parse(String(init?.body))).toEqual({});
  });

  it("shows no row-9 line for a member not on the organisation's AI (row 10)", async () => {
    state.settings = settings({
      configured: false,
      inOrganization: true,
      notConfigured: {
        reason: "organization_unconfirmed",
        enablers: ["user"],
        message:
          "AI features are off: your organisation does not allow personal API keys and provides AI through Anthropic. Your text and meeting details are sent to your organisation's AI provider account, which its administrators can access outside Paceday. Your own choice (OpenAI) and any key you saved are kept. Confirm in Paceday to use your organisation's AI.",
      },
    });
    renderPage();
    const notice = await screen.findByTestId("ai-off-notice");
    expect(screen.getByTestId("ai-org-confirm")).toHaveTextContent("Review and confirm");
    expect(screen.queryByTestId("ai-use-org")).not.toBeInTheDocument();
    expect(notice.textContent).not.toMatch(WORDS);
    expect(screen.queryByTestId("ai-runs-on-org")).not.toBeInTheDocument();
  });
});
