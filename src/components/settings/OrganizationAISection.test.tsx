import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";

vi.hoisted(() => {
  (window as Window & { __API_BASE_URL__?: string }).__API_BASE_URL__ = "https://api.paceday.test/api";
});

import { setMockMode } from "@/api/client";
import { OrganizationAISection } from "./OrganizationAISection";
import { SsoAdminStepupSection } from "./SsoAdminStepupSection";

// PAC-73 Part 2 (spec §3.6; P2-AC-30, P2-AC-32): the organisation AI section
// in Settings, and which section states a step-up outcome.

const API = "https://api.paceday.test/api";
const KEY = "sk-must-never-render";
const GOOGLE_SCOPE = "https://www.googleapis.com/auth/admin.directory.user.readonly";
const fetchMock = vi.fn<typeof fetch>();
const assigned: string[] = [];
const sent: Array<{ method: string; url: string; body?: unknown }> = [];
const realLocation = window.location;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

const configured = {
  configured: true,
  provider: "openai",
  model: "gpt-4o-mini",
  baseUrl: "https://gw.example/openai",
  keySet: true,
  personalKeysAllowed: true,
  configurationVersion: 3,
  updatedAt: "2026-10-28T09:00:00Z",
  changeableBy: "organization_admin",
};
const incomplete = { configured: false, keySet: false, personalKeysAllowed: true, configurationVersion: 0, changeableBy: "organization_admin" };

function serve(read: unknown, patch?: (body: unknown) => Response) {
  fetchMock.mockImplementation(async (input, init) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    sent.push({ method, url, body });
    if (url === `${API}/organization/ai` && method === "GET") return json(read);
    if (url === `${API}/organization/ai` && method === "PATCH" && patch) return patch(body);
    if (url.startsWith(`${API}/admin/sso/stepup/options`)) {
      const purpose = new URL(url).searchParams.get("purpose");
      return json({
        stepup_url: "/api/admin/sso/stepup",
        stepup_scopes: { google: [GOOGLE_SCOPE] },
        without_stepup: [purpose === "llm_org_key_write" ? "organization_ai_configuration_writes" : "sso_configuration_writes"],
      });
    }
    return json({ error: "unexpected " + method + " " + url }, 599);
  });
}

function renderAt(path = "/settings", inOrganization = true) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[path]}>
        <OrganizationAISection inOrganization={inOrganization} />
        <SsoAdminStepupSection />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("OrganizationAISection (PAC-73 Part 2)", () => {
  beforeEach(() => {
    setMockMode(false);
    fetchMock.mockReset();
    sent.length = 0;
    assigned.length = 0;
    vi.stubGlobal("fetch", fetchMock);
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { origin: "https://app.paceday.test", href: "https://app.paceday.test/settings", search: "", assign: (v: string) => assigned.push(v) },
    });
  });
  afterEach(() => Object.defineProperty(window, "location", { configurable: true, value: realLocation }));
  afterAll(() => vi.unstubAllGlobals());

  it("shows every member the same values, never a key, and who can change them", async () => {
    serve(configured);
    renderAt();
    const read = await screen.findByTestId("org-ai-read");
    expect(read).toHaveTextContent("OpenAI");
    expect(read).toHaveTextContent("gpt-4o-mini");
    expect(read).toHaveTextContent("https://gw.example/openai");
    expect(read).toHaveTextContent("A key is set");
    expect(read).toHaveTextContent("Allowed");
    expect(screen.getByTestId("org-ai-section")).toHaveTextContent("An administrator of your organisation can change this.");
    expect(document.body.textContent).not.toContain(KEY);
  });

  it("a user with no organisation sees no section and nothing is fetched", () => {
    serve(configured);
    renderAt("/settings", false);
    expect(screen.queryByTestId("org-ai-section")).not.toBeInTheDocument();
    expect(sent.filter((c) => c.url.includes("/organization/ai"))).toEqual([]);
  });

  it("Edit explains the step-up for this purpose before navigating, and navigates with the purpose", async () => {
    serve(configured);
    renderAt();
    fireEvent.click(await screen.findByRole("button", { name: "Edit" }));
    const explain = await screen.findByTestId("org-ai-stepup");
    expect(explain).toHaveTextContent(GOOGLE_SCOPE);
    expect(explain).toHaveTextContent("nobody in your organisation can change its AI provider");
    expect(assigned).toEqual([]);
    expect(sent.some((c) => c.url === `${API}/admin/sso/stepup/options?purpose=llm_org_key_write`)).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: /continue to google workspace/i }));
    expect(assigned).toEqual([`${API}/admin/sso/stepup?provider=google&purpose=llm_org_key_write`]);
  });

  it("a granted return lands here with the form; the SSO section shows no outcome for it", async () => {
    serve(configured, () => json({ ...configured, model: "gpt-4o", configurationVersion: 3 }));
    renderAt("/settings?stepup=granted&purpose=llm_org_key_write");
    expect(await screen.findByTestId("org-ai-stepup-outcome")).toHaveTextContent("Administrator confirmation granted");
    expect(document.body.textContent).not.toMatch(/used by your next SSO configuration change/);
    const form = await screen.findByTestId("org-ai-form");
    const key = screen.getByLabelText(/Organisation API key/) as HTMLInputElement;
    expect(key.value).toBe("");
    expect(key.type).toBe("password");
    expect(form).toHaveTextContent("Every member of your organisation can read this value.");
    fireEvent.change(screen.getByLabelText(/Organisation model/), { target: { value: "gpt-4o" } });
    fireEvent.click(screen.getByRole("button", { name: /save organisation ai/i }));
    await waitFor(() => expect(screen.queryByTestId("org-ai-form")).not.toBeInTheDocument());
    expect(sent.find((c) => c.method === "PATCH")?.body).toEqual({ configurationVersion: 3, model: "gpt-4o" });
  });

  // PAC-71 (contract ssoAdminStepupCallback, check 4b), on this purpose's landing.
  it("a denied return for identity mismatch is stated in plain words", async () => {
    serve(configured);
    renderAt("/settings?stepup=denied&reason=identity_mismatch&purpose=llm_org_key_write");
    expect(await screen.findByTestId("org-ai-stepup-outcome")).toHaveTextContent(
      "Administrator confirmation was denied: the account you used is not the Google or Microsoft account you sign in to Paceday with, even if it has the same email address.",
    );
  });

  it("an SSO landing is shown only by the SSO section, as under PAC-50", async () => {
    serve(configured);
    renderAt("/settings?stepup=granted");
    expect(await screen.findByText(/used by your next SSO configuration change/)).toBeInTheDocument();
    expect(screen.queryByTestId("org-ai-stepup-outcome")).not.toBeInTheDocument();
  });

  it("a refused save says how to give the proof and leaves the section unchanged", async () => {
    serve(configured, () =>
      json(
        {
          error: "organization_ai_write_requires_admin_stepup",
          stepup_url: "/api/admin/sso/stepup",
          stepup_purpose: "llm_org_key_write",
          stepup_scopes: { google: [GOOGLE_SCOPE] },
          without_stepup: ["organization_ai_configuration_writes"],
        },
        403,
      ),
    );
    renderAt();
    fireEvent.click(await screen.findByRole("button", { name: "Edit" }));
    fireEvent.click(await screen.findByRole("button", { name: /edit without starting a confirmation/i }));
    fireEvent.change(screen.getByLabelText(/Organisation model/), { target: { value: "gpt-x" } });
    fireEvent.click(screen.getByRole("button", { name: /save organisation ai/i }));
    expect(await screen.findByTestId("org-ai-stepup")).toHaveTextContent("nobody in your organisation can change");
    expect(screen.getByTestId("org-ai-read")).toHaveTextContent("gpt-4o-mini");
  });

  it("another administrator first: the current configuration is shown and the proof kept", async () => {
    serve(configured, () => json({ error: "changed", reason: "configuration_changed", organization: { ...configured, provider: "anthropic", model: "", baseUrl: "", configurationVersion: 4 } }, 409));
    renderAt("/settings?stepup=granted&purpose=llm_org_key_write");
    await screen.findByTestId("org-ai-form");
    fireEvent.change(screen.getByLabelText(/Organisation model/), { target: { value: "gpt-x" } });
    fireEvent.click(screen.getByRole("button", { name: /save organisation ai/i }));
    expect(await screen.findByText(/Another administrator changed the configuration first/)).toBeInTheDocument();
    await waitFor(() => expect(screen.getByTestId("org-ai-read")).toHaveTextContent("Anthropic"));
  });

  it("forbidding personal keys before the configuration is complete warns first", async () => {
    serve(incomplete);
    renderAt("/settings?stepup=granted&purpose=llm_org_key_write");
    await screen.findByTestId("org-ai-form");
    expect(screen.queryByTestId("org-ai-forbid-warning")).not.toBeInTheDocument();
    fireEvent.click(screen.getByLabelText(/allow members to use their own api keys/i));
    expect(screen.getByTestId("org-ai-forbid-warning")).toHaveTextContent("will have no AI until it is set up");
  });

  it("a break-glass operator's second change in one sign-in is told to sign in again", async () => {
    serve(configured, () => json({ error: "organization_ai_write_requires_fresh_login" }, 403));
    renderAt("/settings?stepup=granted&purpose=llm_org_key_write");
    await screen.findByTestId("org-ai-form");
    fireEvent.click(screen.getByLabelText(/allow members to use their own api keys/i));
    fireEvent.click(screen.getByRole("button", { name: /save organisation ai/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Sign in again");
  });
});
