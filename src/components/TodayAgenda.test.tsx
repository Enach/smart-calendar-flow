import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

import { TodayAgenda } from "./TodayAgenda";

vi.mock("@/contexts/useAuth", () => ({
  useAuth: () => ({ user: { id: "1", email: "a@x.com", name: "A" } }),
}));

describe("TodayAgenda", () => {
  it("shows a setup prompt, not a session error, when no calendar is connected", () => {
    render(<TodayAgenda events={[]} notConnected error={false} errorMessage="Your session expired. Please sign in again." />);
    expect(screen.getByText("No calendar connected")).toBeInTheDocument();
    expect(screen.queryByText(/session expired/i)).not.toBeInTheDocument();
    expect(screen.queryByText("Couldn't load today's agenda")).not.toBeInTheDocument();
  });

  it("still reports a real load failure", () => {
    render(<TodayAgenda events={[]} error errorMessage="The server had a problem. Try again shortly." />);
    expect(screen.getByText("Couldn't load today's agenda")).toBeInTheDocument();
  });
});
