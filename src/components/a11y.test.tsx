import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { NLPBar } from "./NLPBar";
import { NLPConfirmModal } from "./NLPConfirmModal";
import { ScheduleSuggestModal } from "./ScheduleSuggestModal";

vi.mock("@/contexts/useAuth", () => ({
  useAuth: () => ({ user: { id: "1", email: "a@x.com", name: "A" }, isDemo: false }),
}));

describe("accessible names and dialogs", () => {
  it("names the natural-language input", () => {
    render(<NLPBar onSubmit={() => {}} />);
    expect(screen.getByRole("textbox", { name: "Describe what to schedule" })).toBeInTheDocument();
  });

  it("exposes the meeting confirmation as a named modal dialog that Escape closes", () => {
    const onClose = vi.fn();
    render(
      <NLPConfirmModal
        parseResult={{ title: "Sync", duration_minutes: 30, suggested_slots: [] } as never}
        onClose={onClose}
        onConfirm={() => {}}
      />,
    );
    const dialog = screen.getByRole("dialog", { name: "Confirm meeting" });
    expect(dialog).toHaveAccessibleDescription("Pick a time slot to schedule.");
    fireEvent.keyDown(dialog, { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
  });

  it("labels every field of the schedule dialog and reports the chosen duration", () => {
    const onClose = vi.fn();
    render(
      <QueryClientProvider client={new QueryClient()}>
        <ScheduleSuggestModal
          defaultRangeStart="2026-10-12T09:00:00Z"
          defaultRangeEnd="2026-10-16T17:00:00Z"
          onClose={onClose}
        />
      </QueryClientProvider>,
    );
    expect(screen.getByRole("dialog", { name: "Schedule meeting" })).toBeInTheDocument();
    for (const label of ["Title", "Attendees", "Search from", "Search until"]) {
      expect(screen.getByLabelText(label)).toBeInTheDocument();
    }
    const durations = screen.getByRole("group", { name: "Duration" });
    const pressed = durations.querySelectorAll('[aria-pressed="true"]');
    expect(pressed).toHaveLength(1);
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
  });
});
