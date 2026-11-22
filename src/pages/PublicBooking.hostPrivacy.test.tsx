/**
 * 2026-11-22 audit, finding 4: `/book/:slug` is unauthenticated and its slug
 * is guessable, so anything this page prints about a host is harvestable by a
 * dictionary walk. A host without a display name used to be named by its
 * address — in the chip tooltip, and as the local part in the header label.
 * The page now shows no address of a host at all, before or after booking.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { findTimeButton, pickFirstSelectableDay } from "@/test/bookingPage";
import PublicBooking from "./PublicBooking";
import { schedulingLinksApi, type PublicSlotsParams } from "@/api/schedulingLinks";
import type { BookingConfirmation, PublicLinkInfo } from "@/api/types";
import { addDaysToKey, dateKeyInZone } from "@/lib/timeZone";

const HOST_ADDRESS = "secret.owner@private.example";

const namelessLink: PublicLinkInfo = {
  slug: "intro-call",
  title: "Intro call",
  durations: [30],
  hosts: [{ email: HOST_ADDRESS }],
  min_notice_minutes: 0,
  usage_type: "reusable",
};

function slotsAnswer(params: PublicSlotsParams) {
  const zone = params.displayTimeZone ?? "UTC";
  const base = { time_zone: "UTC", display_time_zone: zone, range_from: params.date ?? params.from, range_to: params.date ?? params.to };
  if (params.date) return { ...base, available_dates: [], slots: [{ start: "2030-03-04T09:00:00Z", end: "2030-03-04T09:30:00Z" }] };
  const today = dateKeyInZone(Date.now(), zone);
  const days: string[] = [];
  for (let d = params.from!; d <= params.to!; d = addDaysToKey(d, 1)) if (d > today) days.push(d);
  return { ...base, slots: [], available_dates: days };
}

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={["/book/intro-call"]}>
        <Routes>
          <Route path="/book/:slug" element={<PublicBooking />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("PublicBooking host addresses", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders no host address when the host has no display name", async () => {
    vi.spyOn(schedulingLinksApi, "getPublicLink").mockResolvedValue(namelessLink);
    vi.spyOn(schedulingLinksApi, "getPublicSlots").mockImplementation(async (_slug, params) => slotsAnswer(params));

    const { container } = renderPage();
    await screen.findByText("Intro call");

    expect(container.innerHTML).not.toContain(HOST_ADDRESS);
    // Not the local part either: that is the half of an address a walk wants.
    expect(container.innerHTML).not.toContain("secret.owner");
    expect(screen.getByText("Your host")).toBeInTheDocument();
  });

  it("renders no host address on the confirmation either", async () => {
    const confirmation: BookingConfirmation = {
      id: "bkg_1",
      link_slug: "intro-call",
      title: "Intro call",
      start: "2030-03-04T09:00:00Z",
      end: "2030-03-04T09:30:00Z",
      duration_minutes: 30,
      hosts: [{ email: HOST_ADDRESS }],
      booker_name: "Booker",
      booker_email: "booker@co.com",
    };
    vi.spyOn(schedulingLinksApi, "getPublicLink").mockResolvedValue(namelessLink);
    vi.spyOn(schedulingLinksApi, "getPublicSlots").mockImplementation(async (_slug, params) => slotsAnswer(params));
    vi.spyOn(schedulingLinksApi, "bookSlot").mockResolvedValue(confirmation);

    const { container } = renderPage();
    await pickFirstSelectableDay();
    fireEvent.click(await findTimeButton());
    fireEvent.change(screen.getByLabelText("Name", { exact: true }), { target: { value: "Booker" } });
    fireEvent.change(screen.getByLabelText("Email", { exact: true }), { target: { value: "booker@co.com" } });
    fireEvent.click(screen.getByRole("button", { name: /confirm booking/i }));

    await screen.findByText(/you are confirmed/i);
    expect(container.innerHTML).not.toContain(HOST_ADDRESS);
    expect(container.innerHTML).not.toContain("secret.owner");
    // The booker's own address is still confirmed back to them.
    expect(container.innerHTML).toContain("booker@co.com");
  });

  it("still names a host that has a display name", async () => {
    vi.spyOn(schedulingLinksApi, "getPublicLink").mockResolvedValue({
      ...namelessLink,
      hosts: [{ email: HOST_ADDRESS, name: "Alice Martin" }],
    });
    vi.spyOn(schedulingLinksApi, "getPublicSlots").mockImplementation(async (_slug, params) => slotsAnswer(params));

    const { container } = renderPage();
    expect(await screen.findByText("Alice")).toBeInTheDocument();
    expect(container.innerHTML).not.toContain(HOST_ADDRESS);
  });
});
