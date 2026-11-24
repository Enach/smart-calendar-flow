import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

import { TodayAgenda } from "./TodayAgenda";
import { TimeFormatValue } from "@/contexts/TimeFormatContext";
import { ApiHttpError, ApiUnreachableError, apiErrorMessage } from "@/api/client";

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

  // PAC-92 (PAC-83 contract §5.1): the agenda's load failure is an API error
  // surface like any other, so the e2e suite's `assertNotDemo` guard can see it.
  it.each([
    ["network", new ApiUnreachableError("network"), "lost"],
    ["budget 503", new ApiHttpError(503, { error: "request timed out" }), "budget"],
    ["500", new ApiHttpError(500, { error: "internal error" }), "http"],
  ])("%s: the load failure carries the api-error test id and its kind", (_label, failure, kind) => {
    const onRetry = vi.fn();
    render(<TodayAgenda events={[]} error failure={failure} errorMessage={apiErrorMessage(failure, "read")} onRetry={onRetry} />);

    const notice = screen.getByTestId("api-error");
    expect(notice).toHaveAttribute("data-error-kind", kind);
    expect(notice).toHaveAttribute("data-effect", "read");
    expect(notice.textContent ?? "").not.toMatch(/preview data|demo data/i);
    // A read is retried by hand.
    fireEvent.click(screen.getByTestId("api-error-retry"));
    expect(onRetry).toHaveBeenCalled();
  });

  it("without the failure itself nothing is tagged (a caller that has only a message)", () => {
    render(<TodayAgenda events={[]} error errorMessage="The server had a problem. Try again shortly." />);
    expect(screen.queryByTestId("api-error")).not.toBeInTheDocument();
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

// PAC-122 batch 6b, SF-058: the agenda filtered the DISPLAYED range's events
// for today, so with another week on screen it said "No meetings today"
// without having looked at today.
describe("TodayAgenda when today is not displayed (PAC-122 SF-058)", () => {
  it("does not claim 'No meetings today', and offers to go to today", () => {
    const goToday = vi.fn();
    render(<TodayAgenda events={[]} error={false} todayShown={false} onGoToday={goToday} />);
    expect(screen.queryByText("No meetings today")).not.toBeInTheDocument();
    expect(screen.getByText(/today is not in the range on screen/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /go to today/i }));
    expect(goToday).toHaveBeenCalledOnce();
  });

  it("still says 'No meetings today' when today is displayed and empty", () => {
    render(<TodayAgenda events={[]} error={false} todayShown />);
    expect(screen.getByText("No meetings today")).toBeInTheDocument();
  });
});
