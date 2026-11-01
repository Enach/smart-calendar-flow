/**
 * PAC-83 AC-14, AC-15b, AC-15c, AC-15d: the sign-in dialog never starts,
 * offers or mentions the demo after an error; the one demo entry is on the
 * initial view of a non-production build only; a slow pre-sign-in check does
 * not block a sign-in.
 */
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";

vi.hoisted(() => {
  (window as Window & { __API_BASE_URL__?: string }).__API_BASE_URL__ = "https://api.paceday.test/api";
});

const enterDemo = vi.fn();
vi.mock("@/contexts/useAuth", () => ({
  useAuth: () => ({ enterDemo, refresh: vi.fn() }),
}));

import { AuthDialog } from "./AuthDialog";
import { API_MESSAGES } from "@/api/client";
import { resetApiAvailability } from "@/lib/api";

const fetchMock = vi.fn<typeof fetch>();
const assigned: string[] = [];
const realLocation = window.location;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const AVAILABLE = {
  google: { available: true, reason: "configured" },
  microsoft: { available: true, reason: "configured" },
  zoom: { available: false, reason: "not_configured" },
  slack: { available: false, reason: "not_configured" },
  notion: { available: false, reason: "not_configured" },
  webcal: { available: true, reason: "built_in" },
};

type Route = (url: string) => Promise<Response> | Response;
function serve(routes: Record<string, Route>) {
  fetchMock.mockImplementation(async (input) => {
    const url = String(input);
    if (url.endsWith("/integrations/availability")) return json(AVAILABLE);
    for (const [suffix, answer] of Object.entries(routes)) if (url.endsWith(suffix)) return answer(url);
    return json({ error: "not here" }, 404);
  });
}
const down: Route = () => {
  throw new TypeError("Failed to fetch");
};

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

async function expectErrorViewWithoutDemo() {
  const notice = await screen.findByTestId("api-error");
  expect(notice).toHaveAttribute("data-error-kind", "lost");
  expect(notice).toHaveTextContent(API_MESSAGES.lostRead);
  expect(screen.getByTestId("api-error-retry")).toBeInTheDocument();
  // AC-15c: the error view has no demo entry and no text mentioning a demo.
  expect(screen.queryByTestId("demo-entry")).not.toBeInTheDocument();
  expect(screen.getByRole("dialog").textContent ?? "").not.toMatch(/demo/i);
  // AC-14 / AC-15b: no demo session started.
  expect(enterDemo).not.toHaveBeenCalled();
  expect(sessionStorage.getItem("paceday:demo")).toBeNull();
}

describe("PAC-83 sign-in dialog", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    enterDemo.mockReset();
    resetApiAvailability();
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
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });
  afterAll(() => {
    Object.defineProperty(window, "location", { configurable: true, value: realLocation });
  });

  it("AC-15c: the initial view offers the one demo entry in a non-production build", async () => {
    serve({});
    renderDialog();
    expect(await screen.findByTestId("demo-entry")).toHaveTextContent("Explore a demo — made-up data");
  });

  it("AC-14: an unreachable health check before Google sign-in shows an error with a retry, never the demo; retry re-probes", async () => {
    serve({ "/api/health": down });
    renderDialog();
    fireEvent.click(await screen.findByRole("button", { name: /continue with google/i }));
    await expectErrorViewWithoutDemo();

    // A failed probe is not cached: "Try again" re-probes, and a now-healthy server proceeds.
    serve({ "/api/health": () => json({ status: "ok" }) });
    fireEvent.click(screen.getByTestId("api-error-retry"));
    await waitFor(() => expect(assigned).toEqual(["https://api.paceday.test/api/auth/google"]));
  });

  it("a11y: the failure view takes the focus (the step that held it is hidden)", async () => {
    serve({ "/api/health": down });
    renderDialog();
    fireEvent.click(await screen.findByRole("button", { name: /continue with google/i }));
    const heading = await screen.findByTestId("sign-in-failure-heading");
    await waitFor(() => expect(heading).toHaveFocus());
  });

  it("AC-14: a failed sign-in discovery shows an error with a retry, never the demo", async () => {
    serve({ "/api/auth/detect": down });
    renderDialog();
    fireEvent.change(await screen.findByLabelText("Work email"), { target: { value: "a@acme.com" } });
    fireEvent.click(screen.getByRole("button", { name: /continue$/i }));
    await expectErrorViewWithoutDemo();
  });

  it("AC-14: a failed password sign-in shows an error with a retry, never the demo", async () => {
    serve({ "/api/auth/detect": () => json({ type: "generic" }), "/api/auth/login": down });
    renderDialog();
    fireEvent.change(await screen.findByLabelText("Work email"), { target: { value: "a@acme.com" } });
    fireEvent.click(screen.getByRole("button", { name: /continue$/i }));
    fireEvent.change(await screen.findByLabelText("Password"), { target: { value: "secret12" } });
    fireEvent.click(screen.getAllByRole("button", { name: /^sign in$/i }).find((b) => b.getAttribute("type") === "submit")!);
    await expectErrorViewWithoutDemo();
    // Retry re-sends the sign-in the user made.
    serve({ "/api/auth/login": () => json({ ok: true }) });
    const before = fetchMock.mock.calls.filter(([u]) => String(u).endsWith("/api/auth/login")).length;
    fireEvent.click(screen.getByTestId("api-error-retry"));
    await waitFor(() =>
      expect(fetchMock.mock.calls.filter(([u]) => String(u).endsWith("/api/auth/login")).length).toBe(before + 1),
    );
  });

  it("AC-14: a pre-sign-in check answered after 3 s does not block the Google sign-in", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    serve({ "/api/health": () => new Promise((r) => setTimeout(() => r(json({ status: "ok" })), 3_000)) });
    renderDialog();
    fireEvent.click(await screen.findByRole("button", { name: /continue with google/i }));
    await vi.advanceTimersByTimeAsync(3_000);
    await waitFor(() => expect(assigned).toEqual(["https://api.paceday.test/api/auth/google"]));
    expect(screen.queryByTestId("api-error")).not.toBeInTheDocument();
    expect(enterDemo).not.toHaveBeenCalled();
  });

  it("AC-15b: only the demo entry control starts the demo session", async () => {
    serve({});
    renderDialog();
    expect(sessionStorage.getItem("paceday:demo")).toBeNull();
    fireEvent.click(await screen.findByTestId("demo-entry"));
    expect(sessionStorage.getItem("paceday:demo")).toBe("1");
    expect(enterDemo).toHaveBeenCalledWith(expect.objectContaining({ id: "demo" }));
  });

  it("AC-15d: with the production value of the flag, no demo entry in the initial or the error view", async () => {
    // Positive control first, in this test: with the flag on, the (lazy) entry
    // does appear — so its absence below is the flag's doing, whatever ran before.
    serve({ "/api/health": down });
    const control = renderDialog();
    expect(await screen.findByTestId("demo-entry")).toBeInTheDocument();
    control.unmount();

    vi.stubGlobal("__PACEDAY_DEMO_BUILD__", false);
    renderDialog();
    await screen.findByRole("button", { name: /continue with google/i });
    await expect(screen.findByTestId("demo-entry", {}, { timeout: 300 })).rejects.toThrow();
    fireEvent.click(screen.getByRole("button", { name: /continue with google/i }));
    await screen.findByTestId("api-error");
    expect(screen.queryByTestId("demo-entry")).not.toBeInTheDocument();
  });
});
