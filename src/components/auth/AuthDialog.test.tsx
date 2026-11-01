import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";

// AC-7 needs the API on a different origin from the web app: the API base is
// read once at module load, so it is set before any import runs.
vi.hoisted(() => {
  (window as Window & { __API_BASE_URL__?: string }).__API_BASE_URL__ = "https://api.paceday.test/api";
});

vi.mock("@/contexts/useAuth", () => ({
  useAuth: () => ({ loginDemo: vi.fn(), refresh: vi.fn() }),
}));

import { AuthDialog } from "./AuthDialog";

const fetchMock = vi.fn<typeof fetch>();
const assigned: string[] = [];
const realLocation = window.location;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
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

async function submitEmail(email: string) {
  fireEvent.change(screen.getByLabelText("Work email"), { target: { value: email } });
  fireEvent.click(screen.getByRole("button", { name: /continue$/i }));
}

describe("AuthDialog sign-in routing (PAC-35)", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
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
  afterAll(() => {
    vi.unstubAllGlobals();
    Object.defineProperty(window, "location", { configurable: true, value: realLocation });
  });

  function serve(detect: unknown) {
    fetchMock.mockImplementation(async (input) => {
      const url = String(input);
      if (url.endsWith("/api/auth/detect")) return jsonResponse(detect);
      return jsonResponse({ error: "not here" }, 404);
    });
  }

  // AC-7 (and the client half of AC-8): the SSO answer's redirect_url is
  // followed, on the API origin, with the typed email as login_hint.
  it("sends an SSO-domain email to the server's SSO start on the API origin with a login hint", async () => {
    serve({ type: "sso", provider_name: "Acme IdP", redirect_url: "/api/auth/sso/acme.com" });
    renderDialog();
    await submitEmail("alice@acme.com");

    await waitFor(() => expect(assigned).toHaveLength(1));
    expect(assigned[0]).toBe("https://api.paceday.test/api/auth/sso/acme.com?login_hint=alice%40acme.com");
    expect(screen.queryByLabelText("Password")).not.toBeInTheDocument();
    const [input, init] = fetchMock.mock.calls.find(([u]) => String(u).endsWith("/api/auth/detect"))!;
    expect(String(input)).toBe("https://api.paceday.test/api/auth/detect");
    expect(JSON.parse(String(init?.body))).toEqual({ email: "alice@acme.com" });
  });

  it("still sends Google and Microsoft emails to their start routes with the hint", async () => {
    serve({ type: "google" });
    renderDialog();
    await submitEmail("bob@example.com");
    await waitFor(() => expect(assigned).toEqual(["https://api.paceday.test/api/auth/google?login_hint=bob%40example.com"]));
  });

  // PAC-71 AC-32: the public sign-in dialog's buttons keep the public sign-in
  // start (a GET navigation); they never start a connect.
  it.each([
    ["Google", "https://api.paceday.test/api/auth/google"],
    ["Microsoft", "https://api.paceday.test/api/auth/microsoft"],
  ])("the %s button still navigates to the public sign-in start", async (name, start) => {
    fetchMock.mockImplementation(async (input) => {
      const url = String(input);
      if (url.endsWith("/api/integrations/availability")) {
        return jsonResponse({ google: { available: true }, microsoft: { available: true } });
      }
      return jsonResponse({ status: "ok" });
    });
    renderDialog();
    fireEvent.click(await screen.findByRole("button", { name: new RegExp(`continue with ${name}`, "i") }));
    await waitFor(() => expect(assigned).toEqual([start]));
    expect(fetchMock.mock.calls.some(([u, init]) => String(u).includes("/connect") || init?.method === "POST")).toBe(false);
  });

  it("shows the password step for a generic answer", async () => {
    serve({ type: "generic" });
    renderDialog();
    await submitEmail("carol@gmail.com");
    expect(await screen.findByLabelText("Password")).toBeInTheDocument();
    expect(assigned).toHaveLength(0);
  });
});
