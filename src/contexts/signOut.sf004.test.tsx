import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";

import { AuthProvider } from "./AuthContext";
import { useAuth } from "./useAuth";
import { SignOutFailedAlert, SIGN_OUT_NOT_CONFIRMED_TITLE } from "@/components/SignOutFailedAlert";
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
  const { user, loading, logout } = useAuth();
  const location = useLocation();
  if (loading) return <span>loading</span>;
  return (
    <div>
      <span data-testid="who">{user ? `user:${user.email}` : "anon"}</span>
      <span data-testid="where">{location.pathname}</span>
      <button onClick={() => void logout()}>sign out</button>
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

async function signedIn() {
  fetchMock.mockResolvedValueOnce(jsonResponse({ id: "1", email: "a@x.com", name: "A" }));
  renderApp();
  await screen.findByText("user:a@x.com");
}

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
    await signedIn();
    fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    fireEvent.click(screen.getByRole("button", { name: "sign out" }));
    await screen.findByRole("alert");

    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }));
    fireEvent.click(screen.getByRole("button", { name: /retry sign-out/i }));

    await waitFor(() => expect(screen.getByTestId("who")).toHaveTextContent("anon"));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByTestId("where")).toHaveTextContent(/^\/$/);
    expect(logoutCalls()).toHaveLength(2);
  });

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
});
