/**
 * PAC-98 AC-8..AC-12, AC-14, AC-15: Paceday has no password sign-in. A
 * personal address (detection answers `generic`) gets the personal-address
 * step: Google with the typed email as the login hint, no Microsoft button
 * until PAC-77, a "not yet" sentence, "Use a different email", and a "not
 * available" state. No answer ever shows a password field or posts to a
 * password route. A direct answer for a provider this deployment does not
 * offer gets the provider step instead of a start that cannot work. A failure
 * return offers the step that fits the remembered address.
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
import {
  forgetSignInEmail,
  readRememberedSignInEmail,
  readRememberedSignInEmailKind,
  rememberSignInEmail,
  rememberSignInEmailKind,
} from "./rememberedEmail";
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

type Avail = ReturnType<typeof availability> | "pending" | "error";

function serve(detect: unknown, avail: Avail = availability(true, true)) {
  fetchMock.mockImplementation(async (input) => {
    const url = String(input);
    if (url.endsWith("/integrations/availability")) {
      if (avail === "pending") return new Promise<Response>(() => {});
      if (avail === "error") return json({ error: "boom" }, 500);
      return json(avail);
    }
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

/** AC-12: nothing labelled password, and no request to a password route. */
function expectNoPasswordAnywhere() {
  expect(screen.queryByLabelText(/password/i)).not.toBeInTheDocument();
  expect(document.querySelector('input[type="password"]')).toBeNull();
  const passwordRoutes = fetchMock.mock.calls.filter(([u]) => /\/api\/auth\/(login|register)$/.test(String(u)));
  expect(passwordRoutes).toEqual([]);
}

/** Waits until the availability read has settled, so D-6 sees it loaded. */
async function availabilityLoaded() {
  await waitFor(() =>
    expect(fetchMock.mock.calls.some(([u]) => String(u).endsWith("/integrations/availability"))).toBe(true),
  );
  // The top buttons render once availability is in.
  await screen.findByRole("button", { name: /continue with google|continue with microsoft|sign up with/i }).catch(() => undefined);
}

describe("AuthDialog personal addresses, no password step (PAC-98)", () => {
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

  // AC-8
  it("AC-8: generic shows the personal-address step: Google with the hint, no Microsoft, the 'not yet' sentence", async () => {
    serve({ type: "generic" });
    renderDialog();
    submitEmail("dave@yahoo.com");

    const step = await screen.findByTestId("auth-personal-step");
    expect(screen.getByTestId("auth-personal-email")).toHaveTextContent("dave@yahoo.com");
    const google = await screen.findByTestId("auth-personal-google");
    expect(google).toHaveTextContent("Continue with Google");
    expect(step).not.toHaveTextContent(/continue with microsoft/i);
    expect(screen.queryByRole("button", { name: /microsoft/i })).not.toBeInTheDocument();
    expect(screen.getByTestId("auth-personal-microsoft-note")).toHaveTextContent(
      /personal Microsoft accounts .*can't sign in to Paceday yet/i,
    );
    // No date in the "not yet" sentence (PAC-77 is in Backlog).
    expect(screen.getByTestId("auth-personal-microsoft-note").textContent).not.toMatch(/\d{4}|january|february|march|april|may|june|july|august|september|october|november|december|soon/i);
    // Not the company copy.
    expect(step).not.toHaveTextContent(/your company/i);
    expect(screen.queryByTestId("auth-personal-unavailable")).not.toBeInTheDocument();
    expectNoPasswordAnywhere();
    expect(assigned).toHaveLength(0);

    fireEvent.click(google);
    await waitFor(() => expect(assigned).toEqual([`${API}/api/auth/google?login_hint=dave%40yahoo.com`]));
  });

  // D-5: the step takes the focus from the email step it replaces.
  it("a11y: focus lands on the personal step's heading", async () => {
    serve({ type: "generic" });
    renderDialog();
    submitEmail("dave@yahoo.com");
    const heading = await screen.findByRole("heading", { name: "Sign in with your personal email" });
    await waitFor(() => expect(heading).toHaveFocus());
  });

  // AC-9
  it("AC-9: in sign-up mode the button reads 'Sign up with Google'", async () => {
    serve({ type: "generic" });
    renderDialog({ mode: "signup" });
    submitEmail("dave@yahoo.com");

    expect(await screen.findByTestId("auth-personal-google")).toHaveTextContent("Sign up with Google");
    expect(screen.getByRole("heading", { name: "Sign up with your personal email" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /microsoft/i })).not.toBeInTheDocument();
  });

  // AC-10
  it("AC-10: Google not available says personal sign-in is not available and offers going back", async () => {
    serve({ type: "generic" }, availability(false, true));
    renderDialog();
    submitEmail("dave@yahoo.com");

    expect(await screen.findByTestId("auth-personal-unavailable")).toHaveTextContent(
      /sign-in for personal addresses is not available on this deployment/i,
    );
    expect(screen.queryByTestId("auth-personal-google")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /microsoft/i })).not.toBeInTheDocument();
    expectNoPasswordAnywhere();
    fireEvent.click(screen.getByTestId("auth-personal-back"));
    expect(screen.getByLabelText("Work email")).toHaveValue("dave@yahoo.com");
  });

  it("availability loading shows a spinner, not the 'not available' state; a failed read offers a retry", async () => {
    serve({ type: "generic" }, "pending");
    const view = renderDialog();
    submitEmail("dave@yahoo.com");
    await screen.findByTestId("auth-personal-step");
    expect(screen.queryByTestId("auth-personal-unavailable")).not.toBeInTheDocument();
    expect(screen.queryByTestId("auth-personal-google")).not.toBeInTheDocument();
    view.unmount();

    serve({ type: "generic" }, "error");
    renderDialog();
    submitEmail("dave@yahoo.com");
    await screen.findByTestId("auth-personal-step");
    expect(await screen.findByTestId("api-error")).toBeInTheDocument();
    expect(screen.queryByTestId("auth-personal-unavailable")).not.toBeInTheDocument();
  });

  // AC-11
  it("AC-11: 'Use a different email' returns to the email step with the email kept", async () => {
    serve({ type: "generic" });
    renderDialog();
    submitEmail("dave@yahoo.com");

    fireEvent.click(await screen.findByRole("button", { name: "Use a different email" }));
    expect(screen.queryByTestId("auth-personal-step")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Work email")).toHaveValue("dave@yahoo.com");
    expect(assigned).toHaveLength(0);
  });

  // AC-12
  it.each([
    ["google", { type: "google" }, "navigates"],
    ["microsoft", { type: "microsoft" }, "navigates"],
    ["sso with a path", { type: "sso", provider_name: "Acme", redirect_url: "/api/auth/sso/acme.test" }, "navigates"],
    ["sso without a path", { type: "sso", provider_name: "Acme" }, "auth-choose-step"],
    ["generic", { type: "generic" }, "auth-personal-step"],
    ["choose", { type: "choose" }, "auth-choose-step"],
    ["an unknown value", { type: "future" }, "auth-choose-step"],
  ])("AC-12: %s never shows a password field or calls a password route", async (_name, answer, outcome) => {
    serve(answer);
    renderDialog();
    submitEmail("erin@acme.test");

    if (outcome === "navigates") {
      await waitFor(() => expect(assigned).toHaveLength(1));
    } else {
      expect(await screen.findByTestId(outcome)).toBeInTheDocument();
      expect(assigned).toHaveLength(0);
    }
    expectNoPasswordAnywhere();
  });

  // AC-14
  it("AC-14: google answered while Google is not offered shows the personal-address 'not available' state, no navigation", async () => {
    serve({ type: "google" }, availability(false, true));
    renderDialog();
    await availabilityLoaded();
    submitEmail("carol@gmail.com");

    expect(await screen.findByTestId("auth-personal-step")).toBeInTheDocument();
    expect(screen.getByTestId("auth-personal-unavailable")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /microsoft/i, hidden: false })).toBeNull();
    expect(assigned).toHaveLength(0);
    expectNoPasswordAnywhere();
  });

  it("AC-14: microsoft answered while Microsoft is not offered shows the PAC-97 choice, no navigation", async () => {
    serve({ type: "microsoft" }, availability(true, false));
    renderDialog();
    await availabilityLoaded();
    submitEmail("dan@contoso.test");

    expect(await screen.findByTestId("auth-choose-step")).toBeInTheDocument();
    expect(screen.getByTestId("auth-choose-email")).toHaveTextContent("dan@contoso.test");
    expect(await screen.findByTestId("auth-choose-google")).toBeInTheDocument();
    expect(screen.queryByTestId("auth-choose-microsoft")).not.toBeInTheDocument();
    expect(assigned).toHaveLength(0);
    fireEvent.click(screen.getByTestId("auth-choose-google"));
    await waitFor(() => expect(assigned).toEqual([`${API}/api/auth/google?login_hint=dan%40contoso.test`]));
  });

  it.each([
    ["loading", "pending" as const],
    ["failed", "error" as const],
  ])("AC-14: with availability %s, google navigates as before", async (_name, avail) => {
    serve({ type: "google" }, avail);
    renderDialog();
    submitEmail("carol@gmail.com");
    await waitFor(() => expect(assigned).toEqual([`${API}/api/auth/google?login_hint=carol%40gmail.com`]));
  });

  it("AC-14: google answered while Google is offered navigates with the hint", async () => {
    serve({ type: "google" }, availability(true, false));
    renderDialog();
    await availabilityLoaded();
    submitEmail("carol@gmail.com");
    await waitFor(() => expect(assigned).toEqual([`${API}/api/auth/google?login_hint=carol%40gmail.com`]));
  });

  // AC-15 / D-7: detection's kind is remembered with the email.
  it.each([
    [{ type: "generic" }, "personal"],
    [{ type: "choose" }, "company"],
    [{ type: "future" }, "company"],
  ])("D-7: detection answer %j is remembered as kind %s, in sessionStorage only", async (answer, kind) => {
    serve(answer);
    renderDialog();
    submitEmail("dave@yahoo.com");
    await waitFor(() => expect(readRememberedSignInEmailKind()).toBe(kind));
    expect(readRememberedSignInEmail()).toBe("dave@yahoo.com");
    expect(localStorage.length).toBe(0);
  });

  it("D-7: a new email drops the kind remembered for the previous one; forgetting clears both", () => {
    rememberSignInEmail("dave@yahoo.com");
    rememberSignInEmailKind("personal");
    rememberSignInEmail("alice@acme.test");
    expect(readRememberedSignInEmailKind()).toBeNull();
    rememberSignInEmailKind("company");
    forgetSignInEmail();
    expect(readRememberedSignInEmail()).toBeNull();
    expect(readRememberedSignInEmailKind()).toBeNull();
  });

  it.each(["dave@yahoo.com", "carol@outlook.com"])(
    "AC-15: failure return with %s remembered as personal: the personal-address step, Google with the hint, zero detection requests",
    async (address) => {
      rememberSignInEmail(address);
      rememberSignInEmailKind("personal");
      serve({ type: "generic" });
      renderDialog({ offerSwitch: true });

      expect(screen.getByTestId("auth-personal-email")).toHaveTextContent(address);
      fireEvent.click(await screen.findByTestId("auth-personal-google"));
      await waitFor(() =>
        expect(assigned).toEqual([`${API}/api/auth/google?login_hint=${encodeURIComponent(address)}`]),
      );
      expect(screen.queryByRole("button", { name: /microsoft/i })).not.toBeInTheDocument();
      expect(detectCalls()).toBe(0);
    },
  );

  it("AC-15: failure return with a remembered company address: both providers, zero detection requests", async () => {
    rememberSignInEmail("alice@gorgias.com");
    rememberSignInEmailKind("company");
    serve({ type: "google" });
    renderDialog({ offerSwitch: true });

    expect(await screen.findByTestId("auth-choose-google")).toBeInTheDocument();
    expect(await screen.findByTestId("auth-choose-microsoft")).toBeInTheDocument();
    expect(detectCalls()).toBe(0);
  });

  it.each([
    [{ type: "generic" }, "auth-personal-step"],
    [{ type: "google" }, "auth-choose-step"],
    [{ type: "choose" }, "auth-choose-step"],
  ])(
    "AC-15: failure return with an email remembered without its kind: exactly one detection request (%j → %s), no navigation",
    async (answer, testId) => {
      rememberSignInEmail("dave@yahoo.com");
      serve(answer);
      renderDialog({ offerSwitch: true });

      expect(screen.getByTestId("auth-resolving-step")).toHaveTextContent("dave@yahoo.com");
      // a11y: the sentence is the status region's accessible content.
      expect(screen.getByRole("status")).toHaveTextContent("Checking how dave@yahoo.com signs in…");
      expect(await screen.findByTestId(testId)).toBeInTheDocument();
      expect(detectCalls()).toBe(1);
      const [, init] = fetchMock.mock.calls.find(([u]) => String(u).endsWith("/api/auth/detect"))!;
      expect(JSON.parse(String(init?.body))).toEqual({ email: "dave@yahoo.com" });
      expect(assigned).toHaveLength(0);
      expect(readRememberedSignInEmailKind()).toBe(answer.type === "generic" ? "personal" : "company");
      expectNoPasswordAnywhere();
    },
  );

  it("AC-15: without a kind and Paceday unreachable: the failure view with a retry, never the demo or a password field", async () => {
    rememberSignInEmail("dave@yahoo.com");
    let reachable = false;
    fetchMock.mockImplementation(async (input) => {
      const url = String(input);
      if (url.endsWith("/integrations/availability")) return json(availability(true, true));
      if (url.endsWith("/api/auth/detect")) {
        if (!reachable) throw new TypeError("Failed to fetch");
        return json({ type: "generic" });
      }
      return json({ error: "not here" }, 404);
    });
    renderDialog({ offerSwitch: true });

    expect(await screen.findByTestId("sign-in-failure-heading")).toBeInTheDocument();
    expect(screen.getByTestId("api-error-retry")).toBeInTheDocument();
    expect(screen.queryByTestId("demo-entry")).not.toBeInTheDocument();
    expectNoPasswordAnywhere();
    expect(detectCalls()).toBe(1);

    reachable = true;
    fireEvent.click(screen.getByTestId("api-error-retry"));
    expect(await screen.findByTestId("auth-personal-step")).toBeInTheDocument();
    expect(detectCalls()).toBe(2);
  });

  it("AC-15: without a kind, Back from the failure view returns to the email step with the email kept", async () => {
    rememberSignInEmail("dave@yahoo.com");
    fetchMock.mockImplementation(async (input) => {
      const url = String(input);
      if (url.endsWith("/integrations/availability")) return json(availability(true, true));
      if (url.endsWith("/api/auth/detect")) throw new TypeError("Failed to fetch");
      return json({ error: "not here" }, 404);
    });
    renderDialog({ offerSwitch: true });

    await screen.findByTestId("sign-in-failure-heading");
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(screen.getByLabelText("Work email")).toHaveValue("dave@yahoo.com");
  });

  it("AC-15: without a kind, a detection error answer offers the PAC-97 choice", async () => {
    rememberSignInEmail("dave@yahoo.com");
    fetchMock.mockImplementation(async (input) => {
      const url = String(input);
      if (url.endsWith("/integrations/availability")) return json(availability(true, true));
      if (url.endsWith("/api/auth/detect")) return json({ error: "too many" }, 429);
      return json({ error: "not here" }, 404);
    });
    renderDialog({ offerSwitch: true });
    expect(await screen.findByTestId("auth-choose-step")).toBeInTheDocument();
    expect(detectCalls()).toBe(1);
  });
});
