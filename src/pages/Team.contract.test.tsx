import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { ScanPreview } from "@/contracts/managerTeam";
import { ScanPreviewDialog } from "./Team";

function preview(teamId: string, name: string, email: string): ScanPreview {
  return {
    team_id: teamId,
    scanned_at: "2026-09-13T20:00:00Z",
    detected: 1,
    eligible: 1,
    assigned: 0,
    skipped: 0,
    candidates: [{ email, display_name: name, already_assigned: false }],
  };
}

describe("Team scan preview contract view", () => {
  it("renders only the active team's preview after a team switch", () => {
    const props = {
      selected: [] as string[],
      confirming: false,
      onSelectedChange: vi.fn(),
      onClose: vi.fn(),
      onConfirm: vi.fn(),
    };
    const { rerender } = render(
      <ScanPreviewDialog {...props} preview={preview("team-a", "Alice", "alice@example.com")} />,
    );
    expect(screen.getByText("Alice")).toBeInTheDocument();

    rerender(<ScanPreviewDialog {...props} preview={preview("team-b", "Bob", "bob@example.com")} />);
    expect(screen.queryByText("Alice")).not.toBeInTheDocument();
    expect(screen.getByText("Bob")).toBeInTheDocument();
  });

  it("requires selection before confirmation", () => {
    const onSelectedChange = vi.fn();
    const onConfirm = vi.fn();
    const candidate = preview("team-a", "Alice", "alice@example.com");
    const { rerender } = render(
      <ScanPreviewDialog preview={candidate} selected={[]} confirming={false} onSelectedChange={onSelectedChange} onClose={() => {}} onConfirm={onConfirm} />,
    );
    expect(screen.getByRole("button", { name: "Add 0 selected" })).toBeDisabled();
    fireEvent.click(screen.getByRole("checkbox"));
    expect(onSelectedChange).toHaveBeenCalledWith(["alice@example.com"]);

    rerender(
      <ScanPreviewDialog preview={candidate} selected={["alice@example.com"]} confirming={false} onSelectedChange={onSelectedChange} onClose={() => {}} onConfirm={onConfirm} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Add 1 selected" }));
    expect(onConfirm).toHaveBeenCalledOnce();
  });
});
