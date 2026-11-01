import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import { AddressStandingNotice } from "./AddressStandingNotice";
import { AuthContext, type AuthContextValue } from "@/contexts/auth-context";
import type { AuthUser } from "@/contexts/AuthContext";

// PAC-71 spec §3 "What standing allows": Settings shows that an unconfirmed
// address is not confirmed and that invitations addressed to it cannot be
// accepted yet.

function renderWith(user: AuthUser | null) {
  const value: AuthContextValue = {
    user,
    isDemo: false,
    loading: false,
    sessionStale: false,
    refresh: async () => {},
    loginDemo: () => {},
    exitDemo: () => {},
    logout: async () => {},
  };
  return render(
    <AuthContext.Provider value={value}>
      <AddressStandingNotice />
    </AuthContext.Provider>,
  );
}

const henry = { id: "u1", email: "henry@acme.com", name: "Henry" };

describe("AddressStandingNotice (PAC-71)", () => {
  it("says an unconfirmed address is not confirmed and its invitations cannot be accepted yet", () => {
    renderWith({ ...henry, addressStanding: "unconfirmed" });
    const status = screen.getByRole("status");
    expect(status).toHaveTextContent("Your email address is not confirmed.");
    expect(status).toHaveTextContent("Invitations sent to henry@acme.com cannot be accepted yet.");
  });

  it("shows nothing for a domain-confirmed address", () => {
    const { container } = renderWith({ ...henry, addressStanding: "domain_confirmed" });
    expect(container).toBeEmptyDOMElement();
  });

  it("shows nothing when the standing is not known (demo user) or nobody is signed in", () => {
    expect(renderWith(henry).container).toBeEmptyDOMElement();
    expect(renderWith(null).container).toBeEmptyDOMElement();
  });
});
