import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

import { FocusStats } from "./FocusStats";

vi.mock("@/hooks/useFocusBlocks", () => ({
  useFocusBlocks: () => ({
    data: [{ start_time: "2026-10-05T09:00:00Z", end_time: "2026-10-05T10:30:00Z" }],
    isLoading: false,
    isError: false,
    error: null,
    isFetching: false,
    refetch: vi.fn(),
  }),
}));

describe("FocusStats", () => {
  it("shows progress against the weekly target", () => {
    render(<FocusStats weekISO="2026-10-05T00:00:00Z" dailyTargetMinutes={60} focusColor="#4F46E5" />);
    expect(screen.getByText("30%")).toBeInTheDocument();
    expect(screen.getByText("of 5 h weekly target")).toBeInTheDocument();
  });

  it("never renders NaN when the target is missing", () => {
    render(
      <FocusStats
        weekISO="2026-10-05T00:00:00Z"
        dailyTargetMinutes={undefined as unknown as number}
        focusColor="#4F46E5"
      />,
    );
    expect(screen.queryByText(/NaN/)).not.toBeInTheDocument();
    expect(screen.getByText("—")).toBeInTheDocument();
    expect(screen.getByText("No weekly target set")).toBeInTheDocument();
    expect(screen.getByText("1 h 30 min")).toBeInTheDocument();
  });
});
