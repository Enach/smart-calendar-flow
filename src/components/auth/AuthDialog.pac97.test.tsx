/**
 * PAC-97 AC-19..AC-22, AC-25 (dialog half), AC-26 (storage half): when sign-in
 * detection cannot tell the provider (`choose`, or a value this web does not
 * know), the dialog offers the available providers for the typed email, each
 * carrying it as the login hint, and never the password step. The typed email
 * is kept in this tab's sessionStorage only.
 */
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";

vi.hoisted(() => {
  (window as Window & { __API_BASE_URL__?: string }).__API_BASE_URL__ = "https://api.paceday.test/api";
});

vi.mock("@/contexts/useAuth", () => ({
  useAuth: () => ({ enterDemo: vi.fn(), refresh: vi.fn() }),
}));

import { AuthDialog } from "./AuthDialog";
import { readRememberedSignInEmail, rememberSignInEmail } from "./rememberedEmail";
import { resetApiAvailability } from "@/lib/api";

const API = "https://api.paceday.test";
const fetchMock = vi.fn<typeof fetch>();
const assigned: string[] = [];
const realLocation = window.location;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

function availability(google: boolean, microsoft: boolean) {
  return {
    google: { available: google, reason: google ? "configured" : "not_configured" },
    microsoft: { available: microsoft, reason: microsoft ? "configured" : "not_configured" },
    zoom: { available: false, reason: "not_configured" },
    slack: { available: false, reason: "not_configured" },
    notion: { available: false, reason: "not_configured" },
    webcal: { available: true, reason: "built_in" },
  };
}

function serve(detect: unknown, avail = availability(true, true)) {
  fetchMock.mockImplementation(async (input) => {
    const url = String(input);
    if (url.endsWith("/integrations/availability")) return json(avail);
    if (url.endsWith("/api/auth/detect")) return json(detect);
    if (url.endsWith("/api/health")) return json({ status: "ok" });
    return json({ error: "not here" }, 404);
  });
}

function renderDialog(props: { mode?: "signin" | "signup"; offerSwitch?: boolean } = {}) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <AuthDialog open onOpenChange={() => {}} {...props} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function submitEmail(email: string) {
  fireEvent.change(screen.getByLabelText("Work email"), { target: { value: email } });
  fireEvent.click(screen.getByRole("button", { name: /^continue$/i }));
}

function detectCalls() {
  return fetchMock.mock.calls.filter(([u]) => String(u).endsWith("/api/auth/detect")).length;
}

describe("AuthDialog provider choice (PAC-97)", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
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

  // AC-19: both providers for the typed email, nothing navigates until a click.
  it.each([
    ["google", "Continue with Google"],
    ["microsoft", "Continue with Microsoft"],
  ])("choose: offers both providers and %s navigates with the hint", async (provider, label) => {
    serve({ type: "choose" });
    renderDialog();
    submitEmail("alice@mimecast.test");

    const step = await screen.findByTestId("auth-choose-step");
    expect(screen.getByTestId("auth-choose-email")).toHaveTextContent("alice@mimecast.test");
    expect(await screen.findByTestId("auth-choose-google")).toHaveTextContent("Continue with Google");
    expect(screen.getByTestId("auth-choose-microsoft")).toHaveTextContent("Continue with Microsoft");
    expect(step).not.toContainElement(screen.queryByLabelText("Password"));
    expect(screen.queryByLabelText("Password")).not.toBeInTheDocument();
    expect(assigned).toHaveLength(0);

    fireEvent.click(screen.getByRole("button", { name: label }));
    await waitFor(() =>
      expect(assigned).toEqual([`${API}/api/auth/${provider}?login_hint=alice%40mimecast.test`]),
    );
  });

  it("choose in sign-up mode labels the providers 'Sign up with …'", async () => {
    serve({ type: "choose" });
    renderDialog({ mode: "signup" });
    submitEmail("alice@mimecast.test");

    expect(await screen.findByTestId("auth-choose-google")).toHaveTextContent("Sign up with Google");
    expect(screen.getByTestId("auth-choose-microsoft")).toHaveTextContent("Sign up with Microsoft");
    expect(screen.getByRole("heading", { name: "Choose how to sign up" })).toBeInTheDocument();
  });

  // AC-20: only the available providers.
  it("choose with only Microsoft available shows only Microsoft, and waits for the click", async () => {
    serve({ type: "choose" }, availability(false, true));
    renderDialog();
    submitEmail("alice@mimecast.test");

    expect(await screen.findByTestId("auth-choose-microsoft")).toBeInTheDocument();
    expect(screen.queryByTestId("auth-choose-google")).not.toBeInTheDocument();
    expect(screen.queryByTestId("auth-choose-unavailable")).not.toBeInTheDocument();
    expect(assigned).toHaveLength(0);
    fireEvent.click(screen.getByTestId("auth-choose-microsoft"));
    await waitFor(() => expect(assigned).toEqual([`${API}/api/auth/microsoft?login_hint=alice%40mimecast.test`]));
  });

  it("choose with no provider available says so and offers going back", async () => {
    serve({ type: "choose" }, availability(false, false));
    renderDialog();
    submitEmail("alice@mimecast.test");

    expect(await screen.findByTestId("auth-choose-unavailable")).toHaveTextContent(
      /not available on this deployment/i,
    );
    expect(screen.queryByTestId("auth-choose-google")).not.toBeInTheDocument();
    expect(screen.queryByTestId("auth-choose-microsoft")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Password")).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId("auth-choose-back"));
    expect(screen.getByLabelText("Work email")).toHaveValue("alice@mimecast.test");
  });

  // AC-21: back keeps the email.
  it("'Use a different email' returns to the email step with the email kept", async () => {
    serve({ type: "choose" });
    renderDialog();
    submitEmail("alice@mimecast.test");

    fireEvent.click(await screen.findByRole("button", { name: "Use a different email" }));
    expect(screen.queryByTestId("auth-choose-step")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Work email")).toHaveValue("alice@mimecast.test");
    expect(assigned).toHaveLength(0);
  });

  // AC-22: an unknown value is a choice, never the password step.
  it.each([[{ type: "future" }], [{}], [null]])("an answer this web does not know (%j) shows the choice", async (answer) => {
    serve(answer);
    renderDialog();
    submitEmail("alice@mimecast.test");

    expect(await screen.findByTestId("auth-choose-step")).toBeInTheDocument();
    expect(screen.queryByLabelText("Password")).not.toBeInTheDocument();
    expect(assigned).toHaveLength(0);
  });

  // AC-23 for microsoft (google is pinned in AuthDialog.test.tsx).
  it("a microsoft answer navigates to the Microsoft start with the hint, as today", async () => {
    serve({ type: "microsoft" });
    renderDialog();
    submitEmail("dan@contoso.test");
    await waitFor(() => expect(assigned).toEqual([`${API}/api/auth/microsoft?login_hint=dan%40contoso.test`]));
    expect(screen.queryByTestId("auth-choose-step")).not.toBeInTheDocument();
  });

  // A failed pre-sign-in check from the choice keeps PAC-83's failure state,
  // and its retry keeps the hint.
  it("a provider click while Paceday is unreachable shows the failure, and its retry keeps the hint", async () => {
    let healthy = false;
    fetchMock.mockImplementation(async (input) => {
      const url = String(input);
      if (url.endsWith("/integrations/availability")) return json(availability(true, true));
      if (url.endsWith("/api/auth/detect")) return json({ type: "choose" });
      if (url.endsWith("/api/health")) {
        if (!healthy) throw new TypeError("Failed to fetch");
        return json({ status: "ok" });
      }
      return json({ error: "not here" }, 404);
    });
    resetApiAvailability();
    renderDialog();
    submitEmail("alice@mimecast.test");

    fireEvent.click(await screen.findByTestId("auth-choose-google"));
    expect(await screen.findByTestId("sign-in-failure-heading")).toBeInTheDocument();
    expect(assigned).toHaveLength(0);
    expect(screen.queryByText(/demo/i)).not.toBeInTheDocument();

    healthy = true;
    fireEvent.click(screen.getByRole("button", { name: /try again|retry/i }));
    await waitFor(() => expect(assigned).toEqual([`${API}/api/auth/google?login_hint=alice%40mimecast.test`]));
  });

  // D-10 / AC-26 (storage half): the typed email is kept in sessionStorage
  // only, by the dialog, without any request of its own.
  it("remembers the typed email in sessionStorage only", async () => {
    const localSet = vi.spyOn(Storage.prototype, "setItem");
    serve({ type: "choose" });
    renderDialog();
    submitEmail("alice@mimecast.test");
    await screen.findByTestId("auth-choose-step");

    expect(readRememberedSignInEmail()).toBe("alice@mimecast.test");
    expect(localStorage.length).toBe(0);
    for (const call of localSet.mock.contexts) expect(call).toBe(sessionStorage);
    expect(document.cookie).not.toContain("mimecast");
    // The only request carrying the address is the detection the dialog
    // already made; remembering it sends nothing.
    const carrying = fetchMock.mock.calls.filter(([u, init]) =>
      `${String(u)} ${String(init?.body ?? "")}`.includes("alice"),
    );
    expect(carrying.map(([u]) => String(u))).toEqual([`${API}/api/auth/detect`]);
  });

  // AC-25 (dialog half): opened from a failure notice with a remembered email.
  it("opened from a failure notice, offers both providers for the remembered email", async () => {
    rememberSignInEmail("alice@gorgias.com");
    serve({ type: "google" });
    renderDialog({ offerSwitch: true });

    expect(screen.getByTestId("auth-choose-email")).toHaveTextContent("alice@gorgias.com");
    fireEvent.click(await screen.findByTestId("auth-choose-microsoft"));
    await waitFor(() => expect(assigned).toEqual([`${API}/api/auth/microsoft?login_hint=alice%40gorgias.com`]));
    expect(detectCalls()).toBe(0);
  });

  it("opened from a failure notice with nothing remembered, opens as usual", () => {
    serve({ type: "google" });
    renderDialog({ offerSwitch: true });
    expect(screen.queryByTestId("auth-choose-step")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Work email")).toHaveValue("");
  });

  it("opened normally, never starts at the choice even with a remembered email", () => {
    rememberSignInEmail("alice@gorgias.com");
    serve({ type: "google" });
    renderDialog();
    expect(screen.queryByTestId("auth-choose-step")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Work email")).toHaveValue("");
  });

  // AC-26: blocked storage still works, without the prefill.
  it("still works when sessionStorage throws", async () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("blocked", "SecurityError");
    });
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new DOMException("blocked", "SecurityError");
    });
    serve({ type: "choose" });
    renderDialog({ offerSwitch: true });

    expect(screen.queryByTestId("auth-choose-step")).not.toBeInTheDocument();
    submitEmail("alice@mimecast.test");
    fireEvent.click(await screen.findByTestId("auth-choose-google"));
    await waitFor(() => expect(assigned).toEqual([`${API}/api/auth/google?login_hint=alice%40mimecast.test`]));
  });
});
