/**
 * PAC-97 AC-26: the email the sign-in dialog remembers for a provider switch
 * is forgotten when a sign-in completes (the app loads with a signed-in user)
 * and when the user signs out. A visit without a session keeps it, so the
 * failure notice can still offer it. Blocked storage never breaks either.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

import { AuthProvider } from "./AuthContext";
import { useAuth } from "./useAuth";
import {
  forgetSignInEmail,
  readRememberedSignInEmail,
  rememberSignInEmail,
} from "@/components/auth/rememberedEmail";

const fetchMock = vi.fn<typeof fetch>();
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

const ME = {
  id: "11111111-1111-4111-8111-111111111111",
  email: "alice@gorgias.com",
  name: "Alice",
  avatarUrl: "",
  provider: "google",
  createdAt: "2026-01-01T00:00:00Z",
};

function Probe() {
  const { user, loading, logout } = useAuth();
  if (loading) return <span>loading</span>;
  return (
    <div>
      <span data-testid="who">{user?.email ?? "nobody"}</span>
      <button onClick={() => void logout()}>sign out</button>
    </div>
  );
}

function renderProvider() {
  return render(
    <AuthProvider>
      <Probe />
    </AuthProvider>,
  );
}

describe("the remembered sign-in email (PAC-97 D-10, AC-26)", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
    sessionStorage.clear();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("is forgotten when the app loads with a signed-in user", async () => {
    rememberSignInEmail("alice@gorgias.com");
    fetchMock.mockResolvedValueOnce(json(ME));
    renderProvider();

    expect(await screen.findByTestId("who")).toHaveTextContent("alice@gorgias.com");
    expect(readRememberedSignInEmail()).toBeNull();
  });

  it("is kept when the app loads without a session (the failure notice needs it)", async () => {
    rememberSignInEmail("alice@gorgias.com");
    fetchMock.mockResolvedValueOnce(json({ error: "unauthorized" }, 401));
    renderProvider();

    expect(await screen.findByTestId("who")).toHaveTextContent("nobody");
    expect(readRememberedSignInEmail()).toBe("alice@gorgias.com");
  });

  it("is forgotten on sign-out", async () => {
    fetchMock.mockResolvedValueOnce(json(ME));
    renderProvider();
    await screen.findByTestId("who");

    rememberSignInEmail("alice@gorgias.com");
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }));
    fireEvent.click(screen.getByRole("button", { name: "sign out" }));

    await waitFor(() => expect(screen.getByTestId("who")).toHaveTextContent("nobody"));
    expect(readRememberedSignInEmail()).toBeNull();
    // Remembering and forgetting send nothing: the only requests are /me and
    // the logout itself, and neither carries the address.
    for (const [url, init] of fetchMock.mock.calls) {
      expect(`${String(url)} ${String(init?.body ?? "")}`).not.toContain("alice@gorgias.com");
    }
  });

  it("never touches localStorage", () => {
    const setItem = vi.spyOn(Storage.prototype, "setItem");
    rememberSignInEmail("alice@gorgias.com");
    forgetSignInEmail();
    rememberSignInEmail("alice@gorgias.com");
    for (const store of setItem.mock.contexts) expect(store).toBe(sessionStorage);
    expect(localStorage.getItem("paceday:signin-email")).toBeNull();
  });

  it("ignores an empty remembered value", () => {
    sessionStorage.setItem("paceday:signin-email", "  ");
    expect(readRememberedSignInEmail()).toBeNull();
  });

  it("degrades to nothing remembered when storage throws", async () => {
    const blocked = () => {
      throw new DOMException("blocked", "SecurityError");
    };
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(blocked);
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(blocked);
    vi.spyOn(Storage.prototype, "removeItem").mockImplementation(blocked);

    expect(() => rememberSignInEmail("alice@gorgias.com")).not.toThrow();
    expect(readRememberedSignInEmail()).toBeNull();
    expect(() => forgetSignInEmail()).not.toThrow();

    fetchMock.mockResolvedValueOnce(json(ME));
    renderProvider();
    expect(await screen.findByTestId("who")).toHaveTextContent("alice@gorgias.com");
  });
});
