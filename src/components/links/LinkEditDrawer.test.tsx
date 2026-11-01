import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { LinkEditDrawer } from "./LinkEditDrawer";
import { schedulingLinksApi } from "@/api/schedulingLinks";
import type { SchedulingLink } from "@/api/types";

// PAC-72 revision 2: the owner edits the link's booking horizon (D-1) and the
// refusal message visitors get (D-2/D-5).

const link: SchedulingLink = {
  id: "l1",
  owner_id: "u1",
  title: "Intro",
  slug: "intro",
  durations: [30],
  days: ["mon", "tue"],
  window_start: "09:00",
  window_end: "17:00",
  buffer_before: 0,
  buffer_after: 0,
  min_notice_minutes: 0,
  usage_type: "reusable",
  uses_count: 0,
  active: true,
  hosts: [{ user_id: "u1", email: "owner@co.com", is_owner: true, status: "accepted" }],
  created_at: "2026-01-01T00:00:00Z",
  is_owner: true,
  booking_horizon_days: 21,
  refusal_message: "generic",
  time_zone: "Europe/Paris",
};

function renderDrawer(edit?: SchedulingLink) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <LinkEditDrawer open onOpenChange={() => {}} link={edit} />
    </QueryClientProvider>,
  );
}

describe("LinkEditDrawer booking horizon and refusal message (PAC-72)", () => {
  afterEach(() => vi.restoreAllMocks());

  it("shows the link's settings and its zone, and saves the edited ones", async () => {
    const update = vi.spyOn(schedulingLinksApi, "updateLink").mockResolvedValue({ ...link, booking_horizon_days: 90, refusal_message: "specific" });
    renderDrawer(link);

    const horizon = screen.getByLabelText("How far ahead visitors can book") as HTMLInputElement;
    expect(horizon.value).toBe("21");
    expect(screen.getByText(/profile time zone \(Europe\/Paris\)/)).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /same message every time/i })).toHaveAttribute("aria-checked", "true");

    fireEvent.change(horizon, { target: { value: "90" } });
    fireEvent.click(screen.getByRole("radio", { name: /say why/i }));
    expect(screen.getByRole("radio", { name: /say why/i })).toHaveAttribute("aria-checked", "true");
    fireEvent.click(screen.getByRole("button", { name: /save changes/i }));

    await waitFor(() => expect(update).toHaveBeenCalled());
    expect(update.mock.calls[0][1]).toMatchObject({ booking_horizon_days: 90, refusal_message: "specific" });
  });

  it("a new link starts at 60 days and the generic message; an out-of-range horizon cannot be saved", () => {
    const create = vi.spyOn(schedulingLinksApi, "createLink");
    renderDrawer();
    const horizon = screen.getByLabelText("How far ahead visitors can book") as HTMLInputElement;
    expect(horizon.value).toBe("60");
    expect(screen.getByRole("radio", { name: /same message every time/i })).toHaveAttribute("aria-checked", "true");

    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "New" } });
    fireEvent.change(horizon, { target: { value: "400" } });
    const save = screen.getByRole("button", { name: /create link/i });
    expect(save).toBeDisabled();
    fireEvent.change(horizon, { target: { value: "" } });
    expect(save).toBeDisabled();
    fireEvent.change(horizon, { target: { value: "365" } });
    expect(save).not.toBeDisabled();
    expect(create).not.toHaveBeenCalled();
  });
});
