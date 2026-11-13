/**
 * PAC-97 AC-25: after a failed (`?error=auth_failed`) or refused
 * (`?error=signin_refused`) provider sign-in, the notice's retry offers both
 * available providers for the email typed earlier in this tab, each with it as
 * the login hint. A fresh tab opens the dialog as today. The notices still
 * read nothing from the URL but the fixed error value.
 */
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";

vi.hoisted(() => {
  (window as Window & { __API_BASE_URL__?: string }).__API_BASE_URL__ = "https://api.paceday.test/api";
});

vi.mock("@/contexts/useAuth", () => ({
  useAuth: () => ({ user: null, isDemo: false, logout: vi.fn(), enterDemo: vi.fn(), refresh: vi.fn() }),
}));

import Index from "./Index";
import { rememberSignInEmail } from "@/components/auth/rememberedEmail";

const API = "https://api.paceday.test";
const fetchMock = vi.fn<typeof fetch>();
const assigned: string[] = [];
const realLocation = window.location;
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

function renderAt(entry: string) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[entry]}>
        <Index />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("switching provider after a failed sign-in (PAC-97 AC-25)", () => {
  beforeEach(() => {
    sessionStorage.clear();
    assigned.length = 0;
    fetchMock.mockReset();
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
      if (url.endsWith("/api/health")) return json({ status: "ok" });
      return json({ error: "not here" }, 404);
    });
    vi.stubGlobal("fetch", fetchMock);
    Object.defineProperty(window, "location", {
      configurable: true,
      value: {
        origin: "https://app.paceday.test",
        search: "",
        get href() {
          return "https://app.paceday.test/";
        },
        set href(v: string) {
          assigned.push(v);
        },
      },
    });
  });
  afterAll(() => {
    vi.unstubAllGlobals();
    Object.defineProperty(window, "location", { configurable: true, value: realLocation });
  });

  it.each([
    ["auth_failed", /try again/i, "google"],
    ["auth_failed", /try again/i, "microsoft"],
    ["signin_refused", /^sign in$/i, "google"],
    ["signin_refused", /^sign in$/i, "microsoft"],
  ])("?error=%s: the retry offers both providers for the remembered email (%s)", async (error, retry, provider) => {
    rememberSignInEmail("alice@gorgias.com");
    renderAt(`/?error=${error}`);

    const alert = screen.getByRole("alert");
    expect(alert).not.toHaveTextContent("alice@gorgias.com");
    fireEvent.click(within(alert).getByRole("button", { name: retry }));

    expect(await screen.findByTestId("auth-choose-step")).toBeInTheDocument();
    expect(screen.getByTestId("auth-choose-email")).toHaveTextContent("alice@gorgias.com");
    expect(await screen.findByTestId("auth-choose-google")).toBeInTheDocument();
    expect(screen.getByTestId("auth-choose-microsoft")).toBeInTheDocument();
    expect(assigned).toHaveLength(0);

    fireEvent.click(screen.getByTestId(`auth-choose-${provider}`));
    await waitFor(() => expect(assigned).toEqual([`${API}/api/auth/${provider}?login_hint=alice%40gorgias.com`]));
  });

  it.each(["auth_failed", "signin_refused"])("?error=%s in a fresh tab: the retry opens the dialog as today", (error) => {
    renderAt(`/?error=${error}`);
    fireEvent.click(
      within(screen.getByRole("alert")).getByRole("button", {
        name: error === "auth_failed" ? /try again/i : /^sign in$/i,
      }),
    );

    expect(screen.getByLabelText("Work email")).toHaveValue("");
    expect(screen.queryByTestId("auth-choose-step")).not.toBeInTheDocument();
  });

  it("the ordinary sign-in entry never starts at the choice", () => {
    rememberSignInEmail("alice@gorgias.com");
    renderAt("/");
    fireEvent.click(screen.getAllByRole("button", { name: /sign in/i })[0]);

    expect(screen.getByLabelText("Work email")).toHaveValue("");
    expect(screen.queryByTestId("auth-choose-step")).not.toBeInTheDocument();
  });
});
