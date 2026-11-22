/**
 * Read-only security audit of 2026-11-22, follow-up item 1: the sign-in
 * dialog's `redirect_url`.
 *
 * POST /api/auth/detect answers `redirect_url` for an `sso` address, and the
 * dialog sent the browser to `apiUrl(redirect_url + "?login_hint=…")`. The
 * contract calls that a path on the API origin, but it is typed
 * `z.string().optional()` and the dialog reads the answer through a bare cast,
 * so nothing checked it. `apiUrl` prefixes `API_BASE`, which is empty whenever
 * no API host is injected — `bun run dev`, the documented local workflow, and
 * the local Docker image, neither of which sends a CSP — and there
 * `"//evil.example/signin"` stays protocol-relative: the browser leaves the
 * origin, mid sign-in, with the typed address in the query.
 *
 * No `__API_BASE_URL__` is stubbed here, deliberately: that is the deployment
 * where the gap bites.
 */
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";

vi.mock("@/contexts/useAuth", () => ({
  useAuth: () => ({ enterDemo: vi.fn(), refresh: vi.fn() }),
}));

import { AuthDialog } from "./AuthDialog";
import { resetApiAvailability } from "@/lib/api";

const fetchMock = vi.fn<typeof fetch>();
const assigned: string[] = [];
const realLocation = window.location;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

function serve(detect: unknown) {
  fetchMock.mockImplementation(async (input) => {
    const url = String(input);
    if (url.endsWith("/integrations/availability")) {
      return json({
        google: { available: true, reason: "configured" },
        microsoft: { available: true, reason: "configured" },
        zoom: { available: false, reason: "not_configured" },
        slack: { available: false, reason: "not_configured" },
        notion: { available: false, reason: "not_configured" },
        webcal: { available: true, reason: "built_in" },
      });
    }
    if (url.endsWith("/api/auth/detect")) return json(detect);
    if (url.endsWith("/api/health")) return json({ status: "ok" });
    return json({ error: "not here" }, 404);
  });
}

function renderDialog() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <AuthDialog open onOpenChange={() => {}} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function submitEmail(email: string) {
  fireEvent.change(screen.getByLabelText("Work email"), { target: { value: email } });
  fireEvent.click(screen.getByRole("button", { name: /^continue$/i }));
}

describe("an sso redirect_url that is not a path on the API origin is not followed", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
    resetApiAvailability();
    sessionStorage.clear();
    localStorage.clear();
    assigned.length = 0;
    Object.defineProperty(window, "location", {
      configurable: true,
      value: {
        origin: "https://app.paceday.test",
        search: "",
        get href() {
          return "https://app.paceday.test/signin";
        },
        set href(v: string) {
          assigned.push(v);
        },
      },
    });
  });
  afterEach(() => vi.restoreAllMocks());
  afterAll(() => {
    vi.unstubAllGlobals();
    Object.defineProperty(window, "location", { configurable: true, value: realLocation });
  });

  it.each([
    ["protocol-relative", "//evil.example/signin"],
    ["a backslash authority, which browsers normalise to //", "/\\evil.example/signin"],
    ["absolute and off-origin", "https://evil.example/signin"],
    ["schemeless and host-shaped", "evil.example/signin"],
    ["a scheme we never navigate to", "javascript:alert(1)"],
    ["empty", ""],
  ])("navigates nowhere when redirect_url is %s", async (_name, redirectUrl) => {
    serve({ type: "sso", provider_name: "Acme", redirect_url: redirectUrl });
    renderDialog();
    submitEmail("erin@acme.test");

    // The same state as an sso answer that sent no path at all (PAC-98 AC-12):
    // the user picks a provider.
    expect(await screen.findByTestId("auth-choose-step")).toBeInTheDocument();
    expect(assigned).toEqual([]);
  });

  it("still follows an ordinary path on the API origin, with the typed address as the hint", async () => {
    serve({ type: "sso", provider_name: "Acme", redirect_url: "/api/auth/sso/acme.test" });
    renderDialog();
    submitEmail("erin@acme.test");

    await waitFor(() => expect(assigned).toHaveLength(1));
    expect(assigned[0]).toBe("/api/auth/sso/acme.test?login_hint=erin%40acme.test");
    // And it stays on the page's own origin, which is the API's here.
    expect(new URL(assigned[0], "https://app.paceday.test").origin).toBe("https://app.paceday.test");
  });
});
