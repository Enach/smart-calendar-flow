import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";

vi.mock("@/contexts/useAuth", () => ({
  useAuth: () => ({ user: null, isDemo: false, logout: vi.fn() }),
}));
vi.mock("@/components/auth/AuthDialog", () => ({
  AuthDialog: ({ open, mode }: { open: boolean; mode: string }) =>
    open ? <div role="dialog">auth dialog ({mode})</div> : null,
}));

import Index from "./Index";

function Where() {
  const loc = useLocation();
  return <span data-testid="where">{loc.pathname + loc.search}</span>;
}

function renderAt(entry: string) {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <Index />
      <Where />
    </MemoryRouter>,
  );
}

// PAC-35 AC-5: the sign-in failure state the server and the completion page
// both send the user to.
describe("landing page sign-in failure state (PAC-35)", () => {
  it("says sign-in did not complete, offers a retry and shows no server detail", () => {
    renderAt("/?error=auth_failed");
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent(/sign-in did not complete/i);
    expect(alert).not.toHaveTextContent(/auth_failed|error|500|token|jwt|secret/i);

    fireEvent.click(screen.getByRole("button", { name: /try again/i }));
    expect(screen.getByRole("dialog")).toHaveTextContent("auth dialog (signin)");
    // Retrying clears the failure from the URL, so it is not shown again.
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByTestId("where")).toHaveTextContent(/^\/$/);
  });

  it("shows nothing on a normal visit or an unknown error value", () => {
    renderAt("/");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("ignores an error value it does not know", () => {
    renderAt("/?error=<script>");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
