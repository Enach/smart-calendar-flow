import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

import { TodayAgenda } from "./TodayAgenda";
import { TimeFormatValue } from "@/contexts/TimeFormatContext";

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

// PAC-55 AC-9: the agenda shows the user's clock.
describe("TodayAgenda time format", () => {
  const today = new Date();
  const at = (h: number) => new Date(today.getFullYear(), today.getMonth(), today.getDate(), h, 0).toISOString();
  const events = [{ id: "e1", title: "Review", start: at(14), end: at(15) }] as unknown as Parameters<typeof TodayAgenda>[0]["events"];

  it("shows 14:00 – 15:00 with no AM/PM on 24h", () => {
    render(
      <TimeFormatValue value="24h">
        <TodayAgenda events={events} error={false} />
      </TimeFormatValue>,
    );
    expect(screen.getByText(/14:00 – 15:00/)).toBeInTheDocument();
    expect(screen.queryByText(/AM|PM/)).not.toBeInTheDocument();
  });

  it("shows 02:00 PM on 12h, as before", () => {
    render(<TodayAgenda events={events} error={false} />);
    expect(screen.getByText(/02:00 PM – 03:00 PM/)).toBeInTheDocument();
  });
});
