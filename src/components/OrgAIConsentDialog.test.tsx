import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";

vi.hoisted(() => {
  (window as Window & { __API_BASE_URL__?: string }).__API_BASE_URL__ = "https://api.paceday.test/api";
});


import { AINotConfiguredNotice } from "./AINotConfiguredNotice";

// PAC-73 Part 2 (owner O-13; spec §3.4, §3.6; P2-AC-22, P2-AC-26, P2-AC-38):
// the one-time notice before the organisation's AI is used, from the
// not-configured notice of rows 5 and 10 (confirm only since PAC-87) and of
// row 7 (confirm, then choose the organisation).

const API = "https://api.paceday.test/api";
const fetchMock = vi.fn<typeof fetch>();
const calls: Array<{ method: string; url: string; body?: unknown }> = [];

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

function org(version: number, provider: "openai" | "anthropic" = "openai") {
  return { configured: true, provider, model: "", baseUrl: "", keySet: true, personalKeysAllowed: true, configurationVersion: version, changeableBy: "organization_admin" };
}

const status = { configured: true, provider: "openai", configuration: "organization", inOrganization: true };

function serve(consent: (version: number) => Response, current = org(4)) {
  fetchMock.mockImplementation(async (input, init) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    calls.push({ method, url, body });
    if (url === `${API}/organization/ai` && method === "GET") return json(current);
    if (url === `${API}/organization/ai/consent` && method === "POST") return consent(body.configurationVersion);
    if (url === `${API}/settings` && method === "PATCH") return json({ llmProvider: "organization" });
    return json({ error: "unexpected " + method + " " + url }, 599);
  });
}

const row5 = {
  reason: "organization_unconfirmed" as const,
  enablers: ["user" as const],
  message:
    "AI features are off until you confirm: your organisation provides AI through OpenAI. Your text and meeting details (titles, attendee emails, Slack and Notion excerpts) are sent to your organisation's AI provider account, which its administrators can access outside Paceday. Confirm in Paceday to turn AI on.",
};
// PAC-87 (contract §2): row 10 is organization_unconfirmed [user], told
// apart from row 5 by the stored choice (Settings.llmProvider).
const row10 = {
  reason: "organization_unconfirmed" as const,
  enablers: ["user" as const],
  message:
    "AI features are off: your organisation does not allow personal API keys and provides AI through OpenAI. Your text and meeting details (titles, attendee emails, Slack and Notion excerpts) are sent to your organisation's AI provider account, which its administrators can access outside Paceday. Your own choice (Anthropic) and any key you saved are kept, and used again if your organisation allows personal keys. Confirm in Paceday to use your organisation's AI.",
};
// Row 7: a removed provider in an organisation that allows personal keys.
const row7 = {
  reason: "provider_removed_organization_available" as const,
  enablers: ["user" as const],
  message: "AI features are off: your previous provider is no longer supported. Choose \"Use my organisation's AI\" or another provider in Settings.",
};

type NC = typeof row5 | typeof row10 | typeof row7;

function renderNotice(nc: NC, onResolved = vi.fn(), storedChoice = "organization") {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  // The settings read the page already holds (Dashboard and Settings both load it).
  qc.setQueryData(["settings"], { llm_provider: storedChoice });
  render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <AINotConfiguredNotice notConfigured={nc} onResolved={onResolved} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return onResolved;
}

const WORDS = /\b(read|reads|see)\b/i;

describe("OrgAIConsentDialog via the not-configured notice", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    calls.length = 0;
    vi.stubGlobal("fetch", fetchMock);
  });
  afterAll(() => vi.unstubAllGlobals());

  it("row 5: tells, names the provider, says access, and confirms the version displayed", async () => {
    serve(() => json(status));
    const onResolved = renderNotice(row5);
    const notice = screen.getByTestId("ai-off-notice");
    expect(notice.textContent).toMatch(/access/);
    expect(notice.textContent).not.toMatch(WORDS);
    expect(notice).not.toHaveTextContent("Use my organisation's AI");
    fireEvent.click(screen.getByTestId("ai-org-confirm"));
    const text = await screen.findByTestId("org-ai-consent-text");
    expect(text).toHaveTextContent("your organisation's AI provider account (OpenAI), which its administrators can access outside Paceday");
    expect(text.textContent).not.toMatch(WORDS);
    // Nothing is sent before the confirm.
    expect(calls.filter((c) => c.method !== "GET")).toEqual([]);
    fireEvent.click(screen.getByRole("button", { name: /confirm and turn ai on/i }));
    await waitFor(() => expect(onResolved).toHaveBeenCalledTimes(1));
    expect(calls.filter((c) => c.method !== "GET")).toEqual([{ method: "POST", url: `${API}/organization/ai/consent`, body: { configurationVersion: 4 } }]);
  });

  it("row 10: 'Review and confirm' confirms without rewriting the stored choice, and says the own choice is kept (PAC87-AC-15, -16)", async () => {
    serve(() => json(status));
    const onResolved = renderNotice(row10, vi.fn(), "anthropic");
    const notice = screen.getByTestId("ai-off-notice");
    expect(notice.textContent).toMatch(/\baccess\b/);
    expect(notice.textContent).not.toMatch(WORDS);
    expect(screen.queryByTestId("ai-use-org")).not.toBeInTheDocument();
    expect(notice).not.toHaveTextContent("Use my organisation's AI");
    fireEvent.click(screen.getByTestId("ai-org-confirm"));
    const text = await screen.findByTestId("org-ai-consent-text");
    expect(text.textContent).toMatch(/\baccess\b/);
    const kept = screen.getByTestId("org-ai-consent-kept");
    expect(kept).toHaveTextContent("Your own choice (Anthropic) and any key you saved are kept, and are used again if your organisation allows personal keys.");
    expect(screen.getByTestId("org-ai-consent").textContent).not.toMatch(WORDS);
    expect(calls.filter((c) => c.method !== "GET")).toEqual([]);
    fireEvent.click(screen.getByRole("button", { name: /confirm and turn ai on/i }));
    await waitFor(() => expect(onResolved).toHaveBeenCalledTimes(1));
    // Only the confirmation: no settings write carrying "organization".
    expect(calls.filter((c) => c.method !== "GET")).toEqual([{ method: "POST", url: `${API}/organization/ai/consent`, body: { configurationVersion: 4 } }]);
  });

  it("row 5: the dialog does not add the kept-choice sentence (stored choice is the organisation)", async () => {
    serve(() => json(status));
    renderNotice(row5);
    fireEvent.click(screen.getByTestId("ai-org-confirm"));
    await screen.findByTestId("org-ai-consent-text");
    expect(screen.queryByTestId("org-ai-consent-kept")).not.toBeInTheDocument();
  });

  it("row 7: 'Use my organisation's AI' confirms, then chooses the organisation (the confirmation first)", async () => {
    serve(() => json(status));
    const onResolved = renderNotice(row7, vi.fn(), "unsupported");
    fireEvent.click(screen.getByTestId("ai-use-org"));
    await screen.findByTestId("org-ai-consent-text");
    // The choice is rewritten here, so the kept-choice sentence would be untrue.
    expect(screen.queryByTestId("org-ai-consent-kept")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /confirm and turn ai on/i }));
    await waitFor(() => expect(onResolved).toHaveBeenCalled());
    expect(calls.filter((c) => c.method !== "GET").map((c) => `${c.method} ${c.url} ${JSON.stringify(c.body)}`)).toEqual([
      `POST ${API}/organization/ai/consent {"configurationVersion":4}`,
      `PATCH ${API}/settings {"llmProvider":"organization"}`,
    ]);
  });

  it("an administrator's provider change in between: nothing recorded, the current version is shown, then confirmed", async () => {
    let n = 0;
    serve((v) => {
      n++;
      if (v === 4) return json({ error: "changed", reason: "configuration_changed", organization: org(5, "anthropic") }, 409);
      return json(status);
    });
    const onResolved = renderNotice(row10, vi.fn(), "openai");
    fireEvent.click(screen.getByTestId("ai-org-confirm"));
    await screen.findByTestId("org-ai-consent-text");
    fireEvent.click(screen.getByRole("button", { name: /confirm and turn ai on/i }));
    expect(await screen.findByTestId("org-ai-consent-changed")).toBeInTheDocument();
    expect(screen.getByTestId("org-ai-consent-text")).toHaveTextContent("(Anthropic)");
    expect(onResolved).not.toHaveBeenCalled();
    expect(calls.some((c) => c.method === "PATCH")).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: /confirm and turn ai on/i }));
    await waitFor(() => expect(onResolved).toHaveBeenCalled());
    expect(n).toBe(2);
    expect(calls.filter((c) => c.method === "POST").map((c) => c.body)).toEqual([{ configurationVersion: 4 }, { configurationVersion: 5 }]);
  });

  it("declining sends nothing", async () => {
    serve(() => json(status));
    const onResolved = renderNotice(row5);
    fireEvent.click(screen.getByTestId("ai-org-confirm"));
    await screen.findByTestId("org-ai-consent-text");
    fireEvent.click(screen.getByRole("button", { name: /not now/i }));
    await waitFor(() => expect(screen.queryByTestId("org-ai-consent-text")).not.toBeInTheDocument());
    expect(onResolved).not.toHaveBeenCalled();
    expect(calls.filter((c) => c.method !== "GET")).toEqual([]);
  });
});
