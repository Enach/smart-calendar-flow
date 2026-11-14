import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";

vi.hoisted(() => {
  (window as Window & { __API_BASE_URL__?: string }).__API_BASE_URL__ = "https://api.paceday.test/api";
});

import { SsoAdminStepupSection } from "./SsoAdminStepupSection";
import { CLIENT_REQUEST_BOUND_MS } from "@/api/client";


// PAC-50 AC-25: the Settings entry point for the optional SSO administrator
// step-up, from GET /api/admin/sso/stepup/options, and the outcome on return.

const GOOGLE_SCOPE = "https://www.googleapis.com/auth/admin.directory.user.readonly";
const MS_SCOPES = ["Organization.Read.All", "RoleManagement.Read.Directory"];

const fetchMock = vi.fn<typeof fetch>();
const assigned: string[] = [];
const realLocation = window.location;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

function serveOptions(status: number, body: unknown) {
  fetchMock.mockImplementation(async (input, init) => {
    const url = String(input);
    if (url === "https://api.paceday.test/api/admin/sso/stepup/options" && (init?.method ?? "GET") === "GET") {
      return jsonResponse(body, status);
    }
    return jsonResponse({ error: "unexpected request " + url }, 599);
  });
}

function options(scopes: Record<string, string[]>, without = ["sso_configuration_writes"]) {
  return { stepup_url: "/api/admin/sso/stepup", stepup_scopes: scopes, without_stepup: without };
}

function renderAt(path = "/settings") {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const view = render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[path]}>
        <SsoAdminStepupSection />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return { ...view, qc };
}

/**
 * Waits until the options request has failed and React Query has settled on
 * it, so an assertion about what is shown is about the failure, not about the
 * loading state, which also renders nothing (PAC-75 review F2).
 */
async function optionsFailed(qc: QueryClient) {
  await waitFor(() => expect(qc.getQueryState(["sso-stepup-options"])?.status).toBe("error"));
}

describe("SsoAdminStepupSection (PAC-50 AC-25)", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
    assigned.length = 0;
    Object.defineProperty(window, "location", {
      configurable: true,
      value: {
        origin: "https://app.paceday.test",
        href: "https://app.paceday.test/settings",
        search: "",
        assign: (v: string) => assigned.push(v),
      },
    });
  });
  afterEach(() => {
    Object.defineProperty(window, "location", { configurable: true, value: realLocation });
  });
  afterAll(() => {
    vi.unstubAllGlobals();
  });

  it("explains the scopes and the loss before any navigation, and navigates only after go-ahead", async () => {
    serveOptions(200, options({ google: [GOOGLE_SCOPE], microsoft: MS_SCOPES }));
    renderAt();
    expect(await screen.findByRole("heading", { name: "SSO administrator confirmation" })).toBeInTheDocument();
    // Scopes as received, per configured provider; what is lost; the grant's lifetime.
    expect(screen.getByText(GOOGLE_SCOPE)).toBeInTheDocument();
    for (const s of MS_SCOPES) expect(screen.getByText(s)).toBeInTheDocument();
    expect(screen.getByText(/create, replace or delete its single sign-on/)).toBeInTheDocument();
    expect(screen.getByText(/lasts 10 minutes and covers one SSO configuration change/)).toBeInTheDocument();
    // No suspend or resume is named or offered (contract revision 8.1, N6).
    expect(screen.queryByText(/suspend|resume/i)).toBeNull();

    // Choosing a provider asks again; declining navigates nowhere.
    fireEvent.click(screen.getByRole("button", { name: "Confirm with Google Workspace" }));
    fireEvent.click(screen.getByRole("button", { name: "Not now" }));
    expect(assigned).toEqual([]);
    expect(screen.queryByRole("button", { name: /Continue to/ })).toBeNull();

    // Going ahead navigates to the start on the API's origin with the provider.
    fireEvent.click(screen.getByRole("button", { name: "Confirm with Microsoft 365" }));
    expect(assigned).toEqual([]);
    fireEvent.click(screen.getByRole("button", { name: "Continue to Microsoft 365" }));
    expect(assigned).toEqual(["https://api.paceday.test/api/admin/sso/stepup?provider=microsoft"]);
    // The options request was the only one: no SSO write is made.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("offers only the configured providers", async () => {
    serveOptions(200, options({ google: [GOOGLE_SCOPE] }));
    renderAt();
    expect(await screen.findByRole("button", { name: "Confirm with Google Workspace" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Microsoft/ })).toBeNull();
  });

  it("says so and offers nothing when no provider is configured", async () => {
    serveOptions(200, options({}));
    renderAt();
    expect(await screen.findByTestId("sso-stepup-unavailable")).toBeInTheDocument();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("ignores without_stepup codes it does not know", async () => {
    serveOptions(200, options({ google: [GOOGLE_SCOPE] }, ["sso_configuration_writes", "some_future_code"]));
    renderAt();
    expect(await screen.findByRole("button", { name: "Confirm with Google Workspace" })).toBeInTheDocument();
    expect(screen.queryByText(/some_future_code/)).toBeNull();
  });

  it("offers no entry point to a user without an organisation (403)", async () => {
    serveOptions(403, { error: "org membership required" });
    const { container, qc } = renderAt();
    await optionsFailed(qc);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId("sso-stepup-options-error")).toBeNull();
    expect(container).toBeEmptyDOMElement();
  });

  it("states a granted outcome and makes no write on return", async () => {
    serveOptions(200, options({ google: [GOOGLE_SCOPE] }));
    renderAt("/settings?stepup=granted");
    expect(await screen.findByText(/Administrator confirmation granted/)).toBeInTheDocument();
    expect(screen.getByText(/valid for 10 minutes/)).toBeInTheDocument();
    expect(screen.getByText(/next SSO configuration change \(create, replace or delete\)/)).toBeInTheDocument();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(fetchMock.mock.calls.every(([, init]) => (init?.method ?? "GET") === "GET")).toBe(true);
    expect(assigned).toEqual([]);
  });

  it("states a denial with its reason in plain words", async () => {
    serveOptions(200, options({ google: [GOOGLE_SCOPE] }));
    renderAt("/settings?stepup=denied&reason=not_admin");
    expect(
      await screen.findByText("Administrator confirmation was denied: the account you used is not an administrator of your organisation."),
    ).toBeInTheDocument();
  });

  // PAC-71 (contract ssoAdminStepupCallback, check 4b): same address, another identity.
  it("states the identity mismatch in plain words", async () => {
    serveOptions(200, options({ google: [GOOGLE_SCOPE] }));
    renderAt("/settings?stepup=denied&reason=identity_mismatch");
    expect(
      await screen.findByText(
        "Administrator confirmation was denied: the account you used is not the Google or Microsoft account you sign in to Paceday with, even if it has the same email address.",
      ),
    ).toBeInTheDocument();
  });

  it("states an unknown reason as a denial without detail", async () => {
    serveOptions(200, options({ google: [GOOGLE_SCOPE] }));
    renderAt("/settings?stepup=denied&reason=something_new");
    expect(await screen.findByText("Administrator confirmation was denied.")).toBeInTheDocument();
  });

  it("shows no outcome for another stepup value", async () => {
    serveOptions(200, options({ google: [GOOGLE_SCOPE] }));
    renderAt("/settings?stepup=maybe");
    expect(await screen.findByRole("button", { name: "Confirm with Google Workspace" })).toBeInTheDocument();
    expect(screen.queryByRole("status")).toBeNull();
  });
});

// PAC-75 (contract contracts/features/PAC-75.md md 5): own-key lookups of the
// denial reason and the without_stepup codes, the `unavailable` reason
// (PAC-95), and the options failure line.

/** The ten reasons of the callback's Location pattern and their text. */
const PAC75_REASONS: Record<string, string> = {
  state_mismatch: "the confirmation could not be matched to your session. Start it again from this page.",
  token_invalid: "the sign-in was cancelled, or the provider's answer could not be verified.",
  no_hd: "the Google account you used is not a Google Workspace account.",
  hd_mismatch: "the Google account you used belongs to a different Google Workspace domain than your organisation.",
  tid_mismatch: "the Microsoft 365 organisation you used does not have your organisation's domain verified.",
  tid_changed: "your organisation is already linked to a different Microsoft 365 organisation.",
  email_mismatch: "the administrator account you used is not the account you are signed in to Paceday with.",
  not_admin: "the account you used is not an administrator of your organisation.",
  identity_mismatch:
    "the account you used is not the Google or Microsoft account you sign in to Paceday with, even if it has the same email address.",
  unavailable: "the confirmation could not be completed in time, so nothing was granted. Start it again from this page.",
};

const PROTOTYPE_KEYS = ["constructor", "toString", "valueOf", "hasOwnProperty", "__proto__", "isPrototypeOf"];

describe("SsoAdminStepupSection (PAC-75)", () => {
  let consoleError: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
    consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    sessionStorage.removeItem("paceday:demo");
  });
  afterEach(() => {
    consoleError.mockRestore();
    sessionStorage.removeItem("paceday:demo");
    vi.useRealTimers();
  });
  afterAll(() => {
    vi.unstubAllGlobals();
  });

  function noFunctionText() {
    expect(document.body.textContent).not.toMatch(/native code|function |=>/);
    expect(consoleError).not.toHaveBeenCalled();
  }

  // AC-16
  it.each(PROTOTYPE_KEYS)("states reason=%s as a denial without detail and no function text", async (key) => {
    serveOptions(200, options({ google: [GOOGLE_SCOPE] }));
    renderAt(`/settings?stepup=denied&reason=${encodeURIComponent(key)}`);
    const outcome = await screen.findByRole("status");
    expect(outcome).toHaveTextContent(/^Administrator confirmation was denied\.$/);
    noFunctionText();
  });

  // AC-19, AC-29
  it.each(Object.entries(PAC75_REASONS))("states reason=%s in its own words", async (reason, text) => {
    serveOptions(200, options({ google: [GOOGLE_SCOPE] }));
    renderAt(`/settings?stepup=denied&reason=${reason}`);
    expect(await screen.findByText(`Administrator confirmation was denied: ${text}`)).toBeInTheDocument();
  });

  // AC-18
  it("shows only the known without_stepup codes, never a prototype's", async () => {
    serveOptions(200, options({ google: [GOOGLE_SCOPE] }, [...PROTOTYPE_KEYS, "sso_configuration_writes"]));
    renderAt();
    expect(await screen.findByRole("button", { name: "Confirm with Google Workspace" })).toBeInTheDocument();
    expect(screen.getByText(/create, replace or delete its single sign-on/)).toBeInTheDocument();
    noFunctionText();
  });

  // AC-20
  it.each([
    ["a 500", () => serveOptions(500, { error: "internal error" })],
    ["a 403 that is not the no-organisation answer", () => serveOptions(403, { error: "forbidden" })],
    ["a 200 that fails schema validation", () => serveOptions(200, { stepup_url: "/api/admin/sso/stepup", surprise: true })],
    ["a network failure", () => fetchMock.mockRejectedValue(new TypeError("Failed to fetch"))],
  ])("shows an error line, and no entry point, on %s", async (_name, serve) => {
    serve();
    renderAt();
    const line = await screen.findByTestId("sso-stepup-options-error");
    expect(line.textContent).toMatch(/^Administrator confirmation options could not be loaded\. \S/);
    expect(screen.getByRole("heading", { name: "SSO administrator confirmation" })).toBeInTheDocument();
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.queryByTestId("sso-stepup-unavailable")).toBeNull();
  });

  it("shows an error line when the options request times out", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    fetchMock.mockImplementation(() => new Promise<Response>(() => undefined));
    renderAt();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    await vi.advanceTimersByTimeAsync(CLIENT_REQUEST_BOUND_MS + 1);
    const line = await screen.findByTestId("sso-stepup-options-error");
    expect(line).toHaveTextContent(/^Administrator confirmation options could not be loaded\./);
    expect(line.querySelector('[data-testid="api-error"]')).toHaveAttribute("data-error-kind", "lost"); // a timeout is a lost answer (PAC-83)
  });

  // AC-21
  it.each(["org membership required", "org not found"])("shows nothing for the no-organisation 403 (%s)", async (error) => {
    serveOptions(403, { error });
    const { container, qc } = renderAt();
    await optionsFailed(qc);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId("sso-stepup-options-error")).toBeNull();
    expect(container).toBeEmptyDOMElement();
  });

  // AC-22
  it("shows nothing and asks nothing in a demo session", async () => {
    sessionStorage.setItem("paceday:demo", "1");
    serveOptions(500, { error: "internal error" });
    const { container } = renderAt("/settings?stepup=denied&reason=not_admin");
    await new Promise((r) => setTimeout(r, 20));
    expect(container).toBeEmptyDOMElement();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  // AC-23
  it("shows both the outcome and the error line when the options request fails on return", async () => {
    serveOptions(503, { error: "service unavailable" });
    renderAt("/settings?stepup=denied&reason=unavailable");
    expect(await screen.findByTestId("sso-stepup-options-error")).toBeInTheDocument();
    expect(screen.getByText(`Administrator confirmation was denied: ${PAC75_REASONS.unavailable}`)).toBeInTheDocument();
  });

  it("shows the outcome without an error line for the no-organisation 403 on return", async () => {
    serveOptions(403, { error: "org not found" });
    const { qc } = renderAt("/settings?stepup=denied&reason=not_admin");
    expect(await screen.findByText(`Administrator confirmation was denied: ${PAC75_REASONS.not_admin}`)).toBeInTheDocument();
    await optionsFailed(qc);
    expect(screen.queryByTestId("sso-stepup-options-error")).toBeNull();
  });

  it("shows no error line for a request cancelled because the page is being left", async () => {
    fetchMock.mockImplementation(async () => {
      window.dispatchEvent(new Event("pagehide"));
      throw new TypeError("cancelled");
    });
    const { container } = renderAt();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    await new Promise((r) => setTimeout(r, 20));
    window.dispatchEvent(new Event("pageshow"));
    expect(screen.queryByTestId("sso-stepup-options-error")).toBeNull();
    expect(container).toBeEmptyDOMElement();
  });
});
