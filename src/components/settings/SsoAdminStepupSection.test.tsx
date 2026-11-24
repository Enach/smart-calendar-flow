import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
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
 * Waits until the options request has answered the no-organisation 403 and
 * React Query has settled on it, so an assertion about what is shown is about
 * that answer, not about the loading state, which also renders nothing
 * (PAC-75 review F2). Since PAC-156 the 403 is the query's answer (`null`,
 * nothing to offer) rather than its error, so that it replaces an offer read
 * before the membership ended. Every other failure is still the query's
 * error, and is still stated in the error line.
 */
async function noOrganisationAnswered(qc: QueryClient) {
  await waitFor(() => {
    const state = qc.getQueryState(["sso-stepup-options"]);
    expect(state?.status).toBe("success");
    expect(state?.data).toBeNull();
  });
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
    await noOrganisationAnswered(qc);
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
    await noOrganisationAnswered(qc);
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
    await noOrganisationAnswered(qc);
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

// PAC-148 (spec §3.7 and §6; contract md 6): the step-up entry is offered
// only on the server's say-so. A user whose association fails PAC-148's rule
// gets the options' membership 403, and the section shows nothing; it reads
// no address, no /api/auth/me and no member list to decide otherwise.
// Regression pin: today's code already behaves this way.
describe("SsoAdminStepupSection (PAC-148, a user who is not a member)", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
    sessionStorage.removeItem("paceday:demo");
    assigned.length = 0;
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { origin: "https://app.paceday.test", href: "https://app.paceday.test/settings", search: "", assign: (v: string) => assigned.push(v) },
    });
  });
  afterEach(() => {
    Object.defineProperty(window, "location", { configurable: true, value: realLocation });
  });
  afterAll(() => {
    vi.unstubAllGlobals();
  });

  it("decides from the options' membership 403 alone: nothing shown, one request, no navigation", async () => {
    serveOptions(403, { error: "org membership required" });
    const { container, qc } = renderAt();
    await noOrganisationAnswered(qc);
    await new Promise((r) => setTimeout(r, 20));
    expect(fetchMock.mock.calls.map(([url, init]) => [String(url), init?.method ?? "GET"])).toEqual([
      ["https://api.paceday.test/api/admin/sso/stepup/options", "GET"],
    ]);
    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByRole("button")).toBeNull();
    expect(assigned).toEqual([]);
  });
});

// PAC-156: the membership ends while the section is on screen. The options
// request answered 200 once, so React Query holds that offer; the next answer
// is the membership 403. The section must then show nothing, and must not
// keep the offer for its next mount either. A failure that is not the
// membership 403 keeps today's behaviour: the section stays, with its error
// line.
describe("SsoAdminStepupSection (PAC-156, a 200 then the membership 403)", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
    sessionStorage.removeItem("paceday:demo");
    assigned.length = 0;
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { origin: "https://app.paceday.test", href: "https://app.paceday.test/settings", search: "", assign: (v: string) => assigned.push(v) },
    });
  });
  afterEach(() => {
    Object.defineProperty(window, "location", { configurable: true, value: realLocation });
  });
  afterAll(() => {
    vi.unstubAllGlobals();
  });

  /** A client whose cache outlives a mount, as the application's does. */
  function client() {
    return new QueryClient({ defaultOptions: { queries: { retry: false } } });
  }

  function mount(qc: QueryClient, path = "/settings") {
    return render(
      <QueryClientProvider client={qc}>
        <MemoryRouter initialEntries={[path]}>
          <SsoAdminStepupSection />
        </MemoryRouter>
      </QueryClientProvider>,
    );
  }

  const refetch = async (qc: QueryClient) => {
    await act(async () => {
      await qc.refetchQueries({ queryKey: ["sso-stepup-options"] });
    });
  };

  it.each(["org membership required", "org not found"])(
    "stops offering the entry when a refetch answers the membership 403 (%s)",
    async (error) => {
      serveOptions(200, options({ google: [GOOGLE_SCOPE] }));
      const qc = client();
      const { container } = mount(qc);
      expect(await screen.findByRole("button", { name: "Confirm with Google Workspace" })).toBeInTheDocument();

      serveOptions(403, { error });
      await refetch(qc);

      await waitFor(() => expect(container).toBeEmptyDOMElement());
      expect(screen.queryByRole("button")).toBeNull();
      // Nothing is said about it: the server refused the read, which is not a
      // failure to report (PAC-75 contract md 5.4).
      expect(screen.queryByTestId("sso-stepup-options-error")).toBeNull();
      expect(assigned).toEqual([]);
    },
  );

  it("keeps nothing of the 200 for its next mount: the membership 403 replaced it", async () => {
    serveOptions(200, options({ google: [GOOGLE_SCOPE] }));
    const qc = client();
    const first = mount(qc);
    expect(await screen.findByRole("button", { name: "Confirm with Google Workspace" })).toBeInTheDocument();

    serveOptions(403, { error: "org membership required" });
    await refetch(qc);
    first.unmount();

    // The cached answer is gone, so the remount offers nothing even before
    // its own request answers: no stale entry is shown in between.
    const { container } = mount(qc);
    expect(container).toBeEmptyDOMElement();
    await new Promise((r) => setTimeout(r, 20));
    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByTestId("sso-stepup-options-error")).toBeNull();
  });

  it("keeps the entry and says so when the refetch fails for another reason (500)", async () => {
    serveOptions(200, options({ google: [GOOGLE_SCOPE] }));
    const qc = client();
    mount(qc);
    expect(await screen.findByRole("button", { name: "Confirm with Google Workspace" })).toBeInTheDocument();

    serveOptions(500, { error: "internal error" });
    await refetch(qc);

    // A transient failure does not blank a section the user still has rights to.
    expect(screen.getByRole("button", { name: "Confirm with Google Workspace" })).toBeInTheDocument();
    expect(await screen.findByTestId("sso-stepup-options-error")).toBeInTheDocument();
  });
});
