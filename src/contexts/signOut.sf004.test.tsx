import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";

import { AuthProvider } from "./AuthContext";
import { useAuth } from "./useAuth";
import { SignOutFailedAlert } from "@/components/SignOutFailedAlert";
import { SIGN_OUT_NOT_CONFIRMED_TITLE, signOutFailureReason } from "@/components/signOutFailure";
import { ApiHttpError } from "@/api/client";
import { Navbar } from "@/components/Navbar";
import Logout from "@/pages/Logout";

// SF-004: a failed POST /api/auth/logout leaves the HttpOnly session cookie
// live (the contract's 500 says the cookie is NOT expired), so the web must
// not present the user as signed out. A 401 means the server has no session:
// that is a sign-out.

const fetchMock = vi.fn<typeof fetch>();

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

function Probe() {
  const { user, loading, logout, refresh } = useAuth();
  const location = useLocation();
  if (loading) return <span>loading</span>;
  return (
    <div>
      <span data-testid="who">{user ? `user:${user.email}` : "anon"}</span>
      <span data-testid="where">{location.pathname}</span>
      <button onClick={() => void logout()}>sign out</button>
      <button onClick={() => void refresh()}>refresh</button>
      <main>page</main>
    </div>
  );
}

function renderApp(initial = "/app") {
  return render(
    <MemoryRouter initialEntries={[initial]}>
      <AuthProvider>
        <SignOutFailedAlert />
        <Routes>
          <Route path="/logout" element={<Logout />} />
          <Route path="*" element={<Probe />} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  );
}

async function failSignOut(fail: () => void = () => fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch"))) {
  fail();
  fireEvent.click(screen.getByRole("button", { name: "sign out" }));
  return screen.findByRole("alert");
}

async function signedIn(timeout?: number) {
  fetchMock.mockResolvedValueOnce(jsonResponse({ id: "1", email: "a@x.com", name: "A" }));
  renderApp();
  await screen.findByText("user:a@x.com", {}, timeout ? { timeout } : undefined);
}

// PAC-139: "Retry succeeds" waits on three answers in a row and once passed
// 5 s under a full parallel run. The waits are event-driven; the longer bounds
// only matter on a loaded box.
const SLOW_WAIT = 4_000;
const SLOW_TEST = 20_000;

function logoutCalls() {
  return fetchMock.mock.calls.filter(([url]) => String(url).endsWith("/api/auth/logout"));
}

describe("SF-004: a failed sign-out is not shown as signed out", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
    sessionStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("keeps the user signed in and raises an alert with a retry when the logout request fails on the network", async () => {
    await signedIn();
    fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    fireEvent.click(screen.getByRole("button", { name: "sign out" }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(SIGN_OUT_NOT_CONFIRMED_TITLE);
    expect(alert).toHaveTextContent("still signed in");
    expect(alert).toHaveTextContent("Can't reach Paceday right now.");
    expect(alert).toHaveAttribute("data-error-kind", "lost");
    expect(screen.getByRole("button", { name: /retry sign-out/i })).toBeEnabled();
    expect(screen.getByTestId("who")).toHaveTextContent("user:a@x.com");
  });

  it("keeps the user signed in and raises an alert when the logout answers 5xx", async () => {
    await signedIn();
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: "internal error" }, 500));
    fireEvent.click(screen.getByRole("button", { name: "sign out" }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(SIGN_OUT_NOT_CONFIRMED_TITLE);
    expect(alert).toHaveTextContent("The server had a problem.");
    expect(alert).not.toHaveTextContent("internal error");
    expect(screen.getByTestId("who")).toHaveTextContent("user:a@x.com");
  });

  it("treats a gateway 502 (non-JSON 5xx) as not confirmed", async () => {
    await signedIn();
    fetchMock.mockResolvedValueOnce(new Response("<html>Bad Gateway</html>", { status: 502, headers: { "content-type": "text/html" } }));
    fireEvent.click(screen.getByRole("button", { name: "sign out" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(SIGN_OUT_NOT_CONFIRMED_TITLE);
    expect(screen.getByTestId("who")).toHaveTextContent("user:a@x.com");
  });

  it("treats a 401 as already signed out: no alert, user cleared", async () => {
    await signedIn();
    fetchMock.mockResolvedValueOnce(new Response("unauthorized\n", { status: 401, headers: { "content-type": "text/plain" } }));
    fireEvent.click(screen.getByRole("button", { name: "sign out" }));

    await waitFor(() => expect(screen.getByTestId("who")).toHaveTextContent("anon"));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("signs out and clears the alert when Retry succeeds", async () => {
    await signedIn(SLOW_WAIT);
    fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    fireEvent.click(screen.getByRole("button", { name: "sign out" }));
    await screen.findByRole("alert", {}, { timeout: SLOW_WAIT });

    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }));
    fireEvent.click(screen.getByRole("button", { name: /retry sign-out/i }));

    await waitFor(() => expect(screen.getByTestId("who")).toHaveTextContent("anon"), { timeout: SLOW_WAIT });
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    // The redirect runs in the continuation after `logout()` resolves, one
    // commit after the identity clears, so it needs its own wait: reading the
    // route synchronously here raced the navigation and flaked (#212).
    await waitFor(() => expect(screen.getByTestId("where")).toHaveTextContent(/^\/$/), { timeout: SLOW_WAIT });
    expect(logoutCalls()).toHaveLength(2);
  }, SLOW_TEST);

  it("keeps the alert when Retry fails again", async () => {
    await signedIn();
    fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    fireEvent.click(screen.getByRole("button", { name: "sign out" }));
    await screen.findByRole("alert");

    fetchMock.mockResolvedValueOnce(jsonResponse({ error: "internal error" }, 500));
    fireEvent.click(screen.getByRole("button", { name: /retry sign-out/i }));

    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("The server had a problem."));
    expect(screen.getByTestId("who")).toHaveTextContent("user:a@x.com");
    expect(logoutCalls()).toHaveLength(2);
  });

  it("the /logout route lands on the home page still signed in, under the alert, when sign-out fails", async () => {
    fetchMock.mockImplementation(async (url) => {
      if (String(url).endsWith("/api/auth/logout")) throw new TypeError("Failed to fetch");
      return jsonResponse({ id: "1", email: "a@x.com", name: "A" });
    });
    renderApp("/logout");

    expect(await screen.findByRole("alert")).toHaveTextContent(SIGN_OUT_NOT_CONFIRMED_TITLE);
    await waitFor(() => expect(screen.getByTestId("where")).toHaveTextContent(/^\/$/));
    expect(screen.getByTestId("who")).toHaveTextContent("user:a@x.com");
  });

  it("the navbar's sign-out stays on the page when the server does not confirm it", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ id: "1", email: "a@x.com", name: "A" }));
    render(
      <MemoryRouter initialEntries={["/app"]}>
        <AuthProvider>
          <SignOutFailedAlert />
          <Navbar showSettingsLink={false} />
          <Probe />
        </AuthProvider>
      </MemoryRouter>,
    );
    await screen.findByText("user:a@x.com");
    fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch"));

    fireEvent.pointerDown(screen.getByRole("button", { name: "Account menu" }), { button: 0, ctrlKey: false });
    fireEvent.click(await screen.findByRole("menuitem", { name: /sign out|log out/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(SIGN_OUT_NOT_CONFIRMED_TITLE);
    expect(screen.getByTestId("where")).toHaveTextContent("/app");
    expect(screen.getByTestId("who")).toHaveTextContent("user:a@x.com");

    fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(screen.getByRole("button", { name: "Account menu" })).toHaveFocus();
  });

  it.runIf(__PACEDAY_DEMO_BUILD__)("signing out of a demo sends no logout request and raises no alert", async () => {
    sessionStorage.setItem("paceday:demo", "1");
    renderApp();
    await screen.findByTestId("who");
    fireEvent.click(screen.getByRole("button", { name: "sign out" }));

    await waitFor(() => expect(screen.getByTestId("who")).toHaveTextContent("anon"));
    expect(logoutCalls()).toHaveLength(0);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
  // ---- review follow-ups on PR #169 ----

  it("is fixed above the sticky navbar and takes focus on its Retry when it appears", async () => {
    await signedIn();
    const alert = await failSignOut();
    expect(alert).toHaveClass("fixed", "top-0", "z-40");
    expect(screen.getByRole("button", { name: /retry sign-out/i })).toHaveFocus();
  });

  it("treats a 403 as not confirmed: the user stays signed in under the alert", async () => {
    await signedIn();
    const alert = await failSignOut(() =>
      fetchMock.mockResolvedValueOnce(jsonResponse({ error: "csrf token missing" }, 403)),
    );
    expect(alert).toHaveTextContent(SIGN_OUT_NOT_CONFIRMED_TITLE);
    expect(alert).toHaveTextContent("HTTP 403");
    expect(screen.getByTestId("who")).toHaveTextContent("user:a@x.com");
  });

  it("never shows a JSON body's error, message or detail word for word", async () => {
    await signedIn();
    const alert = await failSignOut(() =>
      fetchMock.mockResolvedValueOnce(jsonResponse({ error: "upstream proxy said boom" }, 400)),
    );
    expect(alert).not.toHaveTextContent("upstream proxy said boom");
    expect(alert).toHaveTextContent("HTTP 400");
    for (const data of [{ error: "raw-e" }, { message: "raw-m" }, { detail: "raw-d" }]) {
      for (const status of [400, 403, 404, 409, 500]) {
        expect(signOutFailureReason(new ApiHttpError(status, data))).not.toMatch(/raw-/);
      }
    }
  });

  it("clears the alert when /api/auth/me later answers 401 (the session is gone)", async () => {
    await signedIn();
    await failSignOut();
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: "unauthorized" }, 401));
    fireEvent.click(screen.getByRole("button", { name: "refresh" }));

    await waitFor(() => expect(screen.getByTestId("who")).toHaveTextContent("anon"));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("Dismiss hides the alert, keeps the user signed in and returns focus to the page", async () => {
    await signedIn();
    await failSignOut();
    fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByTestId("who")).toHaveTextContent("user:a@x.com");
    expect(screen.getByRole("main")).toHaveFocus();
  });

  it("marks Retry aria-busy, not disabled, while the retry is in flight", async () => {
    await signedIn();
    await failSignOut();
    let answer: (r: Response) => void = () => {};
    fetchMock.mockReturnValueOnce(new Promise<Response>((resolve) => (answer = resolve)));
    const retry = screen.getByTestId("sign-out-retry");
    fireEvent.click(retry);

    await waitFor(() => expect(retry).toHaveAttribute("aria-busy", "true"));
    expect(retry).toBeEnabled();
    fireEvent.click(retry); // a repeat click sends nothing more
    expect(logoutCalls()).toHaveLength(2);

    answer(new Response(null, { status: 204 }));
    await waitFor(() => expect(screen.getByTestId("who")).toHaveTextContent("anon"));
  });
});
