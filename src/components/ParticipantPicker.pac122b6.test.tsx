/**
 * PAC-122 batch 6b, SF-087: the attendee suggestions read had `try/finally`
 * and no `catch`, so a failed read was an unhandled rejection and the last
 * suggestions stayed on screen as if current. The failure is now said in the
 * list, the stale suggestions are cleared, and typing a full email still adds
 * it.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";

import { ApiHttpError, api } from "@/api/client";
import { ParticipantPicker } from "./ParticipantPicker";

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

async function type(input: HTMLElement, value: string) {
  fireEvent.change(input, { target: { value } });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(350);
  });
}

describe("PAC-122 SF-087: a failed attendee suggestions read", () => {
  it("says the suggestions could not be loaded and drops the stale ones", async () => {
    vi.useFakeTimers();
    const suggest = vi
      .spyOn(api, "suggestAttendees")
      .mockResolvedValueOnce([{ email: "old@co.com", name: "Old Match" }])
      .mockRejectedValue(new ApiHttpError(500, { error: "internal error" }, "internal error"));
    render(<ParticipantPicker participants={[]} onChange={() => {}} />);
    const input = screen.getByPlaceholderText(/add participant/i);
    fireEvent.focus(input);
    await type(input, "ol");
    expect(screen.getByText("Old Match")).toBeInTheDocument();

    await type(input, "old");
    expect(suggest).toHaveBeenCalledTimes(2);
    const failure = screen.getByTestId("attendee-suggestions-error");
    expect(failure).toHaveTextContent(/could not load suggestions/i);
    expect(failure).toHaveTextContent("internal error");
    expect(screen.queryByText("Old Match")).not.toBeInTheDocument();
  });
});
