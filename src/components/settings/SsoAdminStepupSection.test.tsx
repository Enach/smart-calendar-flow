import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";

vi.hoisted(() => {
  (window as Window & { __API_BASE_URL__?: string }).__API_BASE_URL__ = "https://api.paceday.test/api";
});

import { SsoAdminStepupSection } from "./SsoAdminStepupSection";
import { setMockMode } from "@/api/client";

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
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[path]}>
        <SsoAdminStepupSection />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("SsoAdminStepupSection (PAC-50 AC-25)", () => {
  beforeEach(() => {
    setMockMode(false);
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
    const { container } = renderAt();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(container).toBeEmptyDOMElement());
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
