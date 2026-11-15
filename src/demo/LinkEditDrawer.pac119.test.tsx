/**
 * PAC-119 AC-24 / contract §7.1, §7.5: in a demo session the link create still
 * reaches the demo implementation with exactly today's arguments (`[input]`),
 * ignores the attempt key, and makes one demo link per successful press. It
 * lives here because only src/demo may import demo code (PAC-83). [unit]
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { LinkEditDrawer } from "@/components/links/LinkEditDrawer";
import { api } from "@/api/client";
import { clearFreebusyCache } from "@/api/coverageCache";
import { schedulingLinksApi } from "@/api/schedulingLinks";
import { toast } from "@/hooks/useToast";
import { demoSchedulingLinksOps } from "./schedulingLinks";

const KEY = "3f0c2a8e-1d4b-4c6a-9e7f-0123456789ab";
const INPUT = {
  title: "Intro", slug: "", durations: [30], days: ["mon" as const], window_start: "09:00", window_end: "17:00",
  buffer_before: 0, buffer_after: 0, min_notice_minutes: 0, usage_type: "reusable" as const,
};
const fetchMock = vi.fn<typeof fetch>();
const ownedCount = () => demoSchedulingLinksOps.listLinks().owned.length;

beforeEach(() => {
  clearFreebusyCache();
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  sessionStorage.setItem("paceday:demo", "1");
  vi.spyOn(api, "freebusy").mockImplementation(async (input) => ({
    start_time: input.start_time, end_time: input.end_time,
    participants: input.emails.map((email) => ({ email, status: "unknown" as const, busy: [] })),
  }));
  vi.spyOn(toast, "success");
});
afterEach(() => {
  sessionStorage.removeItem("paceday:demo");
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("demo create (AC-24)", () => {
  it("the API's demo path receives exactly [input], ignores the key, and makes one link per call", async () => {
    const demoCreate = vi.spyOn(demoSchedulingLinksOps, "createLink");
    const before = ownedCount();

    const first = await schedulingLinksApi.createLink(INPUT, KEY);
    expect(demoCreate).toHaveBeenCalledTimes(1);
    expect(demoCreate.mock.calls[0]).toEqual([INPUT]);
    expect(ownedCount()).toBe(before + 1);

    // The same key again is a second demo link: the demo has no replay and no refusal.
    const second = await schedulingLinksApi.createLink(INPUT, KEY);
    expect(demoCreate.mock.calls[1]).toEqual([INPUT]);
    expect(second.link.id).not.toBe(first.link.id);
    expect(ownedCount()).toBe(before + 2);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("from the editor: one press, one demo link, and the demo receives one argument (the input)", async () => {
    const demoCreate = vi.spyOn(demoSchedulingLinksOps, "createLink");
    const before = ownedCount();
    const onOpenChange = vi.fn();
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <LinkEditDrawer open onOpenChange={onOpenChange} link={null} />
      </QueryClientProvider>,
    );
    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "Demo intro" } });
    fireEvent.click(screen.getByRole("button", { name: /create link/i }));
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    expect(demoCreate).toHaveBeenCalledTimes(1);
    expect(demoCreate.mock.calls[0]).toHaveLength(1);
    expect(demoCreate.mock.calls[0][0]).toMatchObject({ title: "Demo intro" });
    expect(JSON.stringify(demoCreate.mock.calls[0])).not.toMatch(/Idempotency/i);
    expect(ownedCount()).toBe(before + 1);
    expect(toast.success).toHaveBeenCalledWith("Link created.");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
