/**
 * PAC-122 batch 6b, SF-086: a co-host chip's availability badge stayed
 * "Checking…" when the free/busy read failed, because the failed query fell
 * through to `loading`. The chip now says availability was not checked, with
 * the read's error, and a chip the answer does not mention is "unknown",
 * never "Checking…" forever.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { LinkEditDrawer } from "./LinkEditDrawer";
import { ApiHttpError, api } from "@/api/client";
import { clearFreebusyCache } from "@/api/coverageCache";

function renderDrawer() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <LinkEditDrawer open onOpenChange={() => {}} link={null} />
    </QueryClientProvider>,
  );
}

function addCoHost(email: string) {
  fireEvent.change(screen.getByLabelText("Co-host email"), { target: { value: email } });
  fireEvent.click(screen.getByRole("button", { name: /^add$/i }));
}

describe("PAC-122 SF-086: co-host availability chips on a failed free/busy read", () => {
  beforeEach(() => clearFreebusyCache());
  afterEach(() => vi.restoreAllMocks());

  it("says availability was not checked, never 'Checking…' forever", async () => {
    vi.spyOn(api, "freebusy").mockRejectedValue(new ApiHttpError(500, { error: "internal error" }, "internal error"));
    renderDrawer();
    addCoHost("mate@co.com");
    const badge = await screen.findByTestId("coverage-badge-error");
    expect(badge).toHaveTextContent("Availability not checked");
    // The detail is exposed like the other chips' explanations: described by
    // text assistive technology reads, and shown in a tooltip.
    const describedBy = badge.getAttribute("aria-describedby");
    expect(describedBy).toBeTruthy();
    expect(document.getElementById(describedBy!)).toHaveTextContent("Paceday could not read free/busy for this person: internal error");
    expect(screen.queryByText("Checking…")).not.toBeInTheDocument();
  });

  it("a chip the answer does not mention is not left 'Checking…'", async () => {
    vi.spyOn(api, "freebusy").mockImplementation(async (input) => ({
      start_time: input.start_time,
      end_time: input.end_time,
      participants: [],
    }));
    renderDrawer();
    addCoHost("mate@co.com");
    expect(await screen.findByText(/availability unknown/i)).toBeInTheDocument();
    expect(screen.queryByText("Checking…")).not.toBeInTheDocument();
  });
});
