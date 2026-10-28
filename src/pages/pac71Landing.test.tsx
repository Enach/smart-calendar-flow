import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";

const refresh = vi.hoisted(() => vi.fn());
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), info: vi.fn() }));
vi.mock("@/hooks/useToast", () => ({ toast }));
vi.mock("@/contexts/useAuth", () => ({
  useAuth: () => ({ user: null, isDemo: false, logout: vi.fn(), refresh }),
}));
vi.mock("@/components/auth/AuthDialog", () => ({
  AuthDialog: ({ open, mode }: { open: boolean; mode: string }) =>
    open ? <div role="dialog">auth dialog ({mode})</div> : null,
}));

import Index from "./Index";
import AuthCallback from "./AuthCallback";

function Where() {
  const loc = useLocation();
  return <span data-testid="where">{loc.pathname + loc.search}</span>;
}

function renderAt(entry: string) {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <Routes>
        <Route path="/" element={<Index />} />
        <Route path="/auth/callback" element={<AuthCallback />} />
        <Route path="*" element={<span>elsewhere</span>} />
      </Routes>
      <Where />
    </MemoryRouter>,
  );
}

// PAC-71 AC-19 (web): the refusal landing.
describe("landing page sign-in refusal (PAC-71)", () => {
  it("shows the fixed two-part message, distinct from the failure state, and a control that opens the sign-in dialog", () => {
    renderAt("/?error=signin_refused");
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("Paceday could not sign you in with this account.");
    expect(alert).toHaveTextContent(
      "If you already use Paceday, sign in the way you did before. Otherwise, contact your workspace administrator or the Paceday operator.",
    );
    expect(alert).not.toHaveTextContent(/did not complete/i);
    // Names no address, no account, no cause, no server detail.
    expect(alert).not.toHaveTextContent(/@|signin_refused|refused|exists|bound|error|token/i);

    fireEvent.click(within(alert).getByRole("button", { name: "Sign in" }));
    expect(screen.getByRole("dialog")).toHaveTextContent("auth dialog (signin)");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByTestId("where")).toHaveTextContent(/^\/$/);
  });

  it("shows the same message whatever else the URL carries", () => {
    renderAt("/?error=signin_refused&reason=bound_elsewhere&email=henry%40acme.com");
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("Paceday could not sign you in with this account.");
    expect(alert).not.toHaveTextContent(/henry|acme|bound_elsewhere/i);
  });

  it("keeps the PAC-35 failure state for auth_failed", () => {
    renderAt("/?error=auth_failed");
    expect(screen.getByRole("alert")).toHaveTextContent(/sign-in did not complete/i);
    expect(screen.getByRole("alert")).not.toHaveTextContent(/could not sign you in with this account/i);
  });
});

// PAC-71 contract §4: a connect credited to nobody, and a credited one.
describe("connect outcomes (PAC-71)", () => {
  it("says a not-credited connect changed nothing and offers the way back into the app", () => {
    renderAt("/?connect=not_credited");
    const status = screen.getByRole("status");
    expect(status).toHaveTextContent("Your calendar was not connected.");
    expect(status).toHaveTextContent(/nothing was changed/i);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Open Paceday" }));
    expect(screen.getByTestId("where")).toHaveTextContent(/^\/app$/);
  });

  it("ignores another connect value on the landing page", () => {
    renderAt("/?connect=credited");
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it.each(["google", "microsoft"])("a credited %s connect says the calendar is connected and goes on to the app", async (provider) => {
    toast.success.mockReset();
    refresh.mockResolvedValueOnce({ id: "u1", email: "a@x.com", name: "A" });
    renderAt(`/auth/callback?provider=${provider}&connect=credited`);
    expect(await screen.findByText("elsewhere")).toBeInTheDocument();
    expect(screen.getByTestId("where")).toHaveTextContent(/^\/app$/);
    expect(toast.success).toHaveBeenCalledWith("Your calendar is connected.");
  });

  it("an ordinary sign-in completion says nothing about a calendar", async () => {
    toast.success.mockReset();
    refresh.mockResolvedValueOnce({ id: "u1", email: "a@x.com", name: "A" });
    renderAt("/auth/callback?provider=google");
    expect(await screen.findByText("elsewhere")).toBeInTheDocument();
    expect(toast.success).not.toHaveBeenCalled();
  });
});
