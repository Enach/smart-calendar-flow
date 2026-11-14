/**
 * PAC-74: the "API key" field of the Settings page. An emptied field never
 * deletes the saved key; only "Remove saved key" does (D-2). Erasing typed
 * text puts the field back to what it meant before typing, a pending removal
 * included (D-3). Without the per-provider map, the single "key on file" flag
 * applies to the saved provider only (D-4). These drive the real page, the
 * real PATCH/probe body builders and a stubbed fetch.
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
vi.mock("@/components/settings/AddressStandingNotice", () => ({ AddressStandingNotice: () => null }));
vi.mock("@/hooks/useSettings", async () => {
  const { api } = await import("@/api/client");
  return {
    useSettings: () => ({ data: state.settings, isLoading: false, refetch: async () => ({ data: state.settings }) }),
    // The real hook passes the settings last read as `previous`.
    useUpdateSettings: () => ({
      mutateAsync: (s: Parameters<typeof api.updateSettings>[0]) => api.updateSettings(s, state.settings as never),
      isPending: false,
    }),
  };
});
vi.mock("@/hooks/useOrganizationAI", () => ({
  useOrganizationAI: () => ({ data: { personalKeysAllowed: true } }),
}));

import SettingsPage from "./Settings";
import { normalizeSettings } from "@/api/client";

const API = "https://api.paceday.test/api";
const fetchMock = vi.fn<typeof fetch>();

const MAP = { openai: true, anthropic: false, azure_openai: false, bedrock: false, vertex: false };

function wire(withMap = true) {
  return {
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
    llmApiKeySet: true,
    ...(withMap ? { llmApiKeysSet: MAP } : {}),
    recapEnabled: false,
  };
}

function json(body: unknown) {
  return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
}

function renderPage() {
  render(
    <MemoryRouter>
      <SettingsPage />
    </MemoryRouter>,
  );
}

const keyField = () => screen.getByLabelText(/^API key/) as HTMLInputElement;
const typeKey = (text: string) => fireEvent.change(keyField(), { target: { value: text } });
const typeAndErase = () => {
  typeKey("s");
  typeKey("sk");
  typeKey("");
};
const removeButton = () => screen.queryByRole("button", { name: "Remove saved key" });

function bodyOf(path: string, method: string): Record<string, unknown> {
  const call = fetchMock.mock.calls.find(([url, init]) => String(url) === `${API}${path}` && init?.method === method);
  expect(call, `${method} ${path} was sent`).toBeDefined();
  return JSON.parse(String(call![1]?.body));
}

describe("PAC-74 the API key field", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockImplementation(async (url, init) => {
      if (String(url) === `${API}/settings` && init?.method === "PATCH") return json(wire());
      return json({ ok: true, response: "pong", provider: "openai" });
    });
  });
  afterAll(() => vi.unstubAllGlobals());

  it("AC-1: type, erase, change another setting and save: no key property, the other setting is sent", async () => {
    state.settings = normalizeSettings(wire());
    renderPage();
    await screen.findByLabelText(/^API key/);
    typeAndErase();
    fireEvent.change(screen.getByLabelText(/^Model/), { target: { value: "gpt-4o" } });
    fireEvent.click(screen.getByRole("button", { name: /save changes/i }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const body = bodyOf("/settings", "PATCH");
    expect(body).not.toHaveProperty("llmApiKey");
    expect(body).toEqual({ llmModel: "gpt-4o" });
  });

  it("AC-3: type then erase: the field says a key is saved and Remove saved key is offered again", async () => {
    state.settings = normalizeSettings(wire());
    renderPage();
    await screen.findByLabelText(/^API key/);
    expect(removeButton()).toBeInTheDocument();
    typeKey("sk");
    expect(removeButton()).not.toBeInTheDocument();
    typeKey("");
    expect(keyField()).toHaveAttribute("placeholder", "A key is saved. Type to replace it");
    expect(removeButton()).toBeInTheDocument();
  });

  it("AC-4: type, erase, Test connection: the probe carries no key, so the stored key is tested", async () => {
    state.settings = normalizeSettings(wire());
    renderPage();
    await screen.findByLabelText(/^API key/);
    typeAndErase();
    fireEvent.click(screen.getByRole("button", { name: /test connection/i }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(bodyOf("/llm/test", "POST")).toEqual({ llmProvider: "openai", llmModel: "" });
  });

  it("AC-5: Remove saved key, save: the request asks for the key to be removed", async () => {
    state.settings = normalizeSettings(wire());
    renderPage();
    await screen.findByLabelText(/^API key/);
    fireEvent.click(removeButton()!);
    expect(keyField()).toHaveAttribute("placeholder", "Paste an API key");
    fireEvent.click(screen.getByRole("button", { name: /save changes/i }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(bodyOf("/settings", "PATCH")).toEqual({ llmApiKey: "" });
  });

  it("AC-6: Remove saved key, type, erase: still no key on file, and Save still removes it", async () => {
    state.settings = normalizeSettings(wire());
    renderPage();
    await screen.findByLabelText(/^API key/);
    fireEvent.click(removeButton()!);
    typeAndErase();
    expect(keyField()).toHaveAttribute("placeholder", "Paste an API key");
    expect(removeButton()).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /save changes/i }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(bodyOf("/settings", "PATCH")).toEqual({ llmApiKey: "" });
  });

  it("AC-7: a new key typed and saved is sent exactly", async () => {
    state.settings = normalizeSettings(wire());
    renderPage();
    await screen.findByLabelText(/^API key/);
    typeKey("sk-new-key");
    fireEvent.click(screen.getByRole("button", { name: /save changes/i }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(bodyOf("/settings", "PATCH")).toEqual({ llmApiKey: "sk-new-key" });
  });

  it("AC-8 and AC-9: without the per-provider map, another provider shows no key; the saved one shows its key again", async () => {
    state.settings = normalizeSettings(wire(false));
    renderPage();
    await screen.findByLabelText(/^API key/);
    const provider = screen.getByLabelText(/^AI provider/);
    fireEvent.change(provider, { target: { value: "anthropic" } });
    expect(keyField()).toHaveAttribute("placeholder", "Paste an API key");
    expect(removeButton()).not.toBeInTheDocument();
    fireEvent.change(provider, { target: { value: "openai" } });
    expect(keyField()).toHaveAttribute("placeholder", "A key is saved. Type to replace it");
    expect(removeButton()).toBeInTheDocument();
  });

  it("AC-10: with the map, each provider shows its own value", async () => {
    state.settings = normalizeSettings(wire());
    renderPage();
    await screen.findByLabelText(/^API key/);
    const provider = screen.getByLabelText(/^AI provider/);
    fireEvent.change(provider, { target: { value: "anthropic" } });
    expect(keyField()).toHaveAttribute("placeholder", "Paste an API key");
    fireEvent.change(provider, { target: { value: "openai" } });
    expect(keyField()).toHaveAttribute("placeholder", "A key is saved. Type to replace it");
  });
});

/**
 * PAC-111: the field is reset when the draft is first loaded and again after a
 * save, whatever the settings carry. The demo seeds `llm_api_key: ""`
 * (src/demo/clientMocks.ts), which without the reset reads as "Remove saved
 * key", so "Test connection" would send `llmApiKey: ""`.
 */
describe("PAC-111 the key field starts untouched", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterAll(() => vi.unstubAllGlobals());

  const probeBody = () => {
    const calls = fetchMock.mock.calls.filter(([url, init]) => String(url) === `${API}/llm/test` && init?.method === "POST");
    expect(calls, "one probe was sent").toHaveLength(1);
    return JSON.parse(String(calls[0][1]?.body)) as Record<string, unknown>;
  };

  it("at load: settings carrying llm_api_key \"\" send a probe without llmApiKey", async () => {
    fetchMock.mockImplementation(async () => json({ ok: true, response: "pong", provider: "openai" }));
    state.settings = { ...normalizeSettings(wire()), llm_api_key: "" };
    renderPage();
    await screen.findByLabelText(/^API key/);
    expect(keyField()).toHaveAttribute("placeholder", "A key is saved. Type to replace it");
    fireEvent.click(screen.getByRole("button", { name: /test connection/i }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const body = probeBody();
    expect(body).not.toHaveProperty("llmApiKey");
    expect(body).toEqual({ llmProvider: "openai", llmModel: "" });
  });

  it("after a save: a saved document carrying llm_api_key \"\" sends a probe without llmApiKey", async () => {
    fetchMock.mockImplementation(async (url, init) => {
      if (String(url) === `${API}/settings` && init?.method === "PATCH") return json({ ...wire(), llmModel: "gpt-4o", llmApiKey: "" });
      return json({ ok: true, response: "pong", provider: "openai" });
    });
    state.settings = normalizeSettings(wire());
    renderPage();
    await screen.findByLabelText(/^API key/);
    fireEvent.change(screen.getByLabelText(/^Model/), { target: { value: "gpt-4o" } });
    fireEvent.click(screen.getByRole("button", { name: /save changes/i }));
    await waitFor(() => expect(bodyOf("/settings", "PATCH")).toEqual({ llmModel: "gpt-4o" }));
    await waitFor(() => expect(keyField()).toHaveAttribute("placeholder", "A key is saved. Type to replace it"));
    fireEvent.click(screen.getByRole("button", { name: /test connection/i }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    const body = probeBody();
    expect(body).not.toHaveProperty("llmApiKey");
    expect(body).toEqual({ llmProvider: "openai", llmModel: "gpt-4o" });
  });
});
