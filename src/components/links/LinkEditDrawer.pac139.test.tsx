/**
 * PAC-139 item 3: a drawer mounted already open on an existing link shows that
 * link's address and saves its slug. Before the fix, the title-to-slug effect
 * ran on the first render with an empty title and overwrote the hydrated slug.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { publicBookingUrl, schedulingLinksApi } from "@/api/schedulingLinks";
import type { SchedulingLink } from "@/api/types";
import { LinkEditDrawer } from "./LinkEditDrawer";

const link: SchedulingLink = {
  id: "l1",
  owner_id: "u1",
  title: "Intro call",
  slug: "intro-x7k2",
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

describe("PAC-139: LinkEditDrawer mounted open on an existing link", () => {
  afterEach(() => vi.restoreAllMocks());

  it("shows the link's own address and saves its slug, not one derived from the title", async () => {
    vi.spyOn(schedulingLinksApi, "getLink").mockResolvedValue(link);
    const update = vi.spyOn(schedulingLinksApi, "updateLink").mockResolvedValue({ link, co_host_list_sent: false });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <LinkEditDrawer open onOpenChange={() => {}} link={link} />
      </QueryClientProvider>,
    );

    expect(screen.getByText(publicBookingUrl("intro-x7k2"))).toBeInTheDocument();
    expect(screen.queryByTestId("link-address-pending")).not.toBeInTheDocument();

    // Editing the title of an existing link never changes its address.
    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "Renamed call" } });
    expect(screen.getByText(publicBookingUrl("intro-x7k2"))).toBeInTheDocument();

    await waitFor(() => expect(screen.getByRole("button", { name: /save changes/i })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: /save changes/i }));
    await waitFor(() => expect(update).toHaveBeenCalled());
    expect(update.mock.calls[0][1]).toMatchObject({ title: "Renamed call", slug: "intro-x7k2" });
  });
});
