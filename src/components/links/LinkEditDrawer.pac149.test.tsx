/**
 * PAC-149 (spec §3.7, contract §5): "On Paceday" only for an accepted entry
 * with an account id. A pending entry reads "Invite pending" even when it
 * carries a `user_id` — as an old server's pending rows do during the release
 * window — and a pending entry without one reads the same.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { LinkEditDrawer } from "./LinkEditDrawer";
import { api } from "@/api/client";
import { clearFreebusyCache } from "@/api/coverageCache";
import { schedulingLinksApi } from "@/api/schedulingLinks";
import type { SchedulingHost, SchedulingLink } from "@/api/types";

const OWNER: SchedulingHost = { user_id: "u1", email: "owner@co.com", is_owner: true, status: "accepted" };

function makeLink(hosts: SchedulingHost[]): SchedulingLink {
  return {
    id: "l1", owner_id: "u1", title: "Intro", slug: "intro", durations: [30], days: ["mon"],
    window_start: "09:00", window_end: "17:00", buffer_before: 0, buffer_after: 0, min_notice_minutes: 0,
    usage_type: "reusable", uses_count: 0, active: true, hosts: [OWNER, ...hosts],
    created_at: "2026-01-01T00:00:00Z", is_owner: true, booking_horizon_days: 60, refusal_message: "generic",
    time_zone: "Europe/Paris",
  };
}

function renderDrawer(link: SchedulingLink) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <LinkEditDrawer open onOpenChange={vi.fn()} link={link} />
    </QueryClientProvider>,
  );
}

const chipFor = (email: string) => screen.getByRole("button", { name: `Remove ${email}` }).closest("li") as HTMLElement;

beforeEach(() => {
  clearFreebusyCache();
  // Free/busy says "known" for everyone, so only the host record can decide the chip.
  vi.spyOn(api, "freebusy").mockImplementation(async (input) => ({
    start_time: input.start_time, end_time: input.end_time,
    participants: input.emails.map((email) => ({ email, status: "known" as const, busy: [] })),
  }));
});
afterEach(() => vi.restoreAllMocks());

describe("PAC-149: the co-host chip in the editor", () => {
  it("a pending entry carrying a user_id (old server) reads 'Invite pending', never 'On Paceday'", async () => {
    const link = makeLink([{ user_id: "u_h", email: "h@x.example", is_owner: false, status: "pending" }]);
    vi.spyOn(schedulingLinksApi, "getLink").mockResolvedValue(link);
    renderDrawer(link);
    const li = await waitFor(() => chipFor("h@x.example"));
    expect(await within(li).findByText("Invite pending")).toBeInTheDocument();
    expect(within(li).queryByText("On Paceday")).toBeNull();
  });

  it("pending entries with and without a user_id render the same chip text", async () => {
    const withId = makeLink([{ user_id: "u_h", email: "h@x.example", is_owner: false, status: "pending" }]);
    const withoutId = makeLink([{ email: "h@x.example", is_owner: false, status: "pending" }]);
    const texts: string[] = [];
    for (const link of [withId, withoutId]) {
      const getLink = vi.spyOn(schedulingLinksApi, "getLink").mockResolvedValue(link);
      const view = renderDrawer(link);
      const li = await waitFor(() => chipFor("h@x.example"));
      await within(li).findByText("Invite pending");
      texts.push(li.textContent ?? "");
      view.unmount();
      getLink.mockRestore();
    }
    expect(texts[1]).toBe(texts[0]);
  });
});
