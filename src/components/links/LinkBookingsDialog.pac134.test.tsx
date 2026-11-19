import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { LinkBookingsDialog } from "./LinkBookingsDialog";
import { formatArchiveDate } from "./ArchiveFormat";
import { schedulingLinksApi } from "@/api/schedulingLinks";
import type { BookingConfirmation, SchedulingLink } from "@/api/types";
import { jsonResponse } from "@/test/pac40Fixtures";
import { ERASED, LIVE } from "@/test/pac134Fixtures";

// PAC-134 AC-6w (web), contract md 5: the live bookings dialog shows an erased
// booking with its time and duration and the archive's wording "Name and
// email erased on <date>" (same date format), no name, no email, no notes.
// The other bookings render as today.

const fetchMock = vi.fn<typeof fetch>();
const LINK = { id: "l1", title: "Intro call" } as SchedulingLink;

function renderDialog() {
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <LinkBookingsDialog open onOpenChange={() => {}} link={LINK} />
    </QueryClientProvider>,
  );
}

describe("PAC-134 LinkBookingsDialog", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterAll(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("AC-6w: the list renders; the erased booking shows the archive's wording and no name or email", async () => {
    fetchMock.mockImplementation(async () => jsonResponse([LIVE, ERASED]));
    renderDialog();
    const erased = await screen.findByTestId("link-booking-erased");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.queryByText(/could not be read/)).not.toBeInTheDocument();

    const items = screen.getAllByRole("listitem");
    expect(items).toHaveLength(2);

    // The other booking: as today.
    expect(within(items[0]).getByText("Zoe · zoe@co.com · 30 min")).toBeInTheDocument();
    expect(within(items[0]).getByText("Agenda")).toBeInTheDocument();
    expect(within(items[0]).queryByTestId("link-booking-erased")).not.toBeInTheDocument();

    // The erased booking: time, duration, the archive's wording, nothing else.
    expect(items[1]).toContainElement(erased);
    expect(erased).toHaveTextContent(`Name and email erased on ${formatArchiveDate(ERASED.booker_erased_at)}`);
    expect(erased.textContent).toMatch(/^Name and email erased on .*Mar 1, 2027$/);
    expect(items[1]).toHaveTextContent("60 min");
    expect(items[1].textContent).not.toMatch(/null|undefined|@/);
    expect(items[1].querySelectorAll("p")).toHaveLength(2);
  });

  it("a list without an erased booking renders exactly as before (no erased marker)", async () => {
    fetchMock.mockImplementation(async () => jsonResponse([LIVE]));
    renderDialog();
    expect(await screen.findByText("Zoe · zoe@co.com · 30 min")).toBeInTheDocument();
    expect(screen.queryByTestId("link-booking-erased")).not.toBeInTheDocument();
  });

  it("demo mode: the demo's bookings (never erased) render with name and email", async () => {
    const demoBooking: BookingConfirmation = {
      id: "d1", link_slug: "intro", title: "Intro call", start: LIVE.start_time, end: LIVE.end_time,
      duration_minutes: 30, hosts: [], booker_name: "Demo Booker", booker_email: "demo@example.com",
    };
    vi.spyOn(schedulingLinksApi, "listBookings").mockResolvedValue([demoBooking]);
    renderDialog();
    expect(await screen.findByText("Demo Booker · demo@example.com · 30 min")).toBeInTheDocument();
    expect(screen.queryByTestId("link-booking-erased")).not.toBeInTheDocument();
  });
});
