/**
 * 2026-11-22 audit follow-up: `POST /book/{slug}` is now parsed rather than
 * cast (src/api/schedulingLinks.ts), so a 201 whose facts cannot be read
 * raises BookingConfirmationUnreadableError instead of being mapped from
 * another answer's data.
 *
 * The sharp edge that test covers is this page's: the POST already succeeded,
 * so the booking EXISTS. The visitor must never be told it failed — that
 * would invite them to book a second slot — and must never be offered a
 * "Try again" that re-sends the same attempt key only to receive the same
 * unreadable answer. They are told the booking was made and to check their
 * email.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { findTimeButton, pickFirstSelectableDay } from "@/test/bookingPage";
import { toast } from "@/hooks/useToast";
import PublicBooking from "./PublicBooking";
import { BookingConfirmationUnreadableError, schedulingLinksApi, type PublicSlotsParams } from "@/api/schedulingLinks";
import type { PublicLinkInfo } from "@/api/types";
import { addDaysToKey, dateKeyInZone } from "@/lib/timeZone";

const link: PublicLinkInfo = {
  slug: "intro-call",
  title: "Intro call",
  durations: [30],
  hosts: [{ email: "host@co.com", name: "Alice Martin" }],
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

async function bookOnce() {
  renderPage();
  await pickFirstSelectableDay();
  fireEvent.click(await findTimeButton());
  fireEvent.change(screen.getByLabelText("Name", { exact: true }), { target: { value: "Booker" } });
  fireEvent.change(screen.getByLabelText("Email", { exact: true }), { target: { value: "booker@co.com" } });
  fireEvent.click(screen.getByRole("button", { name: /confirm booking/i }));
}

describe("a booking whose 201 could not be read", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("tells the visitor the booking was made, never that it failed", async () => {
    const toastError = vi.spyOn(toast, "error");
    vi.spyOn(schedulingLinksApi, "getPublicLink").mockResolvedValue(link);
    vi.spyOn(schedulingLinksApi, "getPublicSlots").mockImplementation(async (_slug, params) => slotsAnswer(params));
    const bookSlot = vi.spyOn(schedulingLinksApi, "bookSlot").mockRejectedValue(new BookingConfirmationUnreadableError());

    await bookOnce();

    const state = await screen.findByTestId("booking-confirmation-unreadable");
    expect(state).toHaveTextContent(/booking was made/i);
    expect(state).toHaveTextContent(/check your email/i);
    // Nothing that reads as a failure, and no invitation to book again.
    expect(screen.queryByText(/something went wrong/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/couldn't confirm your booking/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/was not made/i)).not.toBeInTheDocument();
    expect(toastError).not.toHaveBeenCalled();

    // No "Try again": re-sending this attempt's key only re-reads the same
    // unreadable answer, and the slot is taken.
    expect(screen.queryByTestId("api-error-retry")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /try again/i })).not.toBeInTheDocument();
    expect(bookSlot).toHaveBeenCalledTimes(1);
  });

  it("shows no confirmation details, rather than details it could not read", async () => {
    vi.spyOn(schedulingLinksApi, "getPublicLink").mockResolvedValue(link);
    vi.spyOn(schedulingLinksApi, "getPublicSlots").mockImplementation(async (_slug, params) => slotsAnswer(params));
    vi.spyOn(schedulingLinksApi, "bookSlot").mockRejectedValue(new BookingConfirmationUnreadableError());

    await bookOnce();

    await screen.findByTestId("booking-confirmation-unreadable");
    // Not the "You are confirmed!" screen: it would print a time and an
    // "Add to calendar" built from an answer that could not be read.
    expect(screen.queryByText(/you are confirmed/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /add to calendar/i })).not.toBeInTheDocument();
    expect(screen.queryByText("Alice")).not.toBeInTheDocument();
  });
});
