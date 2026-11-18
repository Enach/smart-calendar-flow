/**
 * PAC-122 batch 6, SF-052 (drawer half): a new link showed
 * `/book/<slug from the title>` and said the address came from the title,
 * while the server assigns another one. The drawer now claims no address
 * before the server assigns it, and shows the saved link's real slug after.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { LinkEditDrawer } from "./LinkEditDrawer";
import { api } from "@/api/client";
import { clearFreebusyCache } from "@/api/coverageCache";
import { publicBookingUrl, schedulingLinksApi, type SchedulingLinkSaveResult } from "@/api/schedulingLinks";
import type { SchedulingLink } from "@/api/types";

const L = "7b0e7c1e-4a49-4d7e-9a43-2f4e0a6b5c11";
const SAVED: SchedulingLink = {
  id: L, owner_id: "u1", title: "Intro call", slug: "ana-30", durations: [30], days: ["mon"],
  window_start: "09:00", window_end: "17:00", buffer_before: 0, buffer_after: 0, min_notice_minutes: 0,
  usage_type: "reusable", uses_count: 0, active: true,
  hosts: [{ user_id: "u1", email: "owner@co.com", is_owner: true, status: "accepted" }],
  created_at: "2026-01-01T00:00:00Z", is_owner: true, booking_horizon_days: 60, refusal_message: "generic",
};

/** Mounted closed, then opened, as Links.tsx does (the drawer stays mounted). */
function renderDrawer(link: SchedulingLink | null) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const tree = (open: boolean) => (
    <QueryClientProvider client={client}>
      <LinkEditDrawer open={open} onOpenChange={() => {}} link={link} />
    </QueryClientProvider>
  );
  const view = render(tree(false));
  view.rerender(tree(true));
}

describe("PAC-122 SF-052: the address in the link drawer", () => {
  beforeEach(() => {
    clearFreebusyCache();
    vi.spyOn(api, "freebusy").mockResolvedValue({ start_time: "", end_time: "", participants: [] });
  });
  afterEach(() => vi.restoreAllMocks());

  it("a new link claims no address before the server assigns one", () => {
    renderDrawer(null);
    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "Intro call" } });
    expect(screen.getByTestId("link-address-pending")).toHaveTextContent("Your address is assigned when the link is created.");
    expect(screen.queryByText(publicBookingUrl("intro-call"))).not.toBeInTheDocument();
    expect(screen.queryByText(publicBookingUrl("your-link"))).not.toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/generated from the title/i);
  });

  it("after a create that stays open, the server's slug is shown", async () => {
    const result: SchedulingLinkSaveResult = {
      link: SAVED,
      co_host_changes: { addresses: [{ email: "c@nowhere.io", outcome: "not_added" }], removed: [], invited_count: 0, removed_count: 0, not_added_count: 1 },
      co_host_list_sent: true,
    };
    vi.spyOn(schedulingLinksApi, "createLink").mockResolvedValue(result);
    vi.spyOn(schedulingLinksApi, "getLink").mockResolvedValue(SAVED);
    renderDrawer(null);
    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "Intro call" } });
    fireEvent.change(screen.getByLabelText("Co-host email"), { target: { value: "c@nowhere.io" } });
    fireEvent.click(screen.getByRole("button", { name: /^add$/i }));
    fireEvent.click(screen.getByRole("button", { name: /create link/i }));
    await waitFor(() => expect(screen.getByText(publicBookingUrl("ana-30"))).toBeInTheDocument());
    expect(screen.queryByText(publicBookingUrl("intro-call"))).not.toBeInTheDocument();
  });

  it("an existing link shows its real address", async () => {
    vi.spyOn(schedulingLinksApi, "getLink").mockResolvedValue(SAVED);
    renderDrawer(SAVED);
    await waitFor(() => expect(screen.getByText(publicBookingUrl("ana-30"))).toBeInTheDocument());
    expect(screen.queryByTestId("link-address-pending")).not.toBeInTheDocument();
  });
});
