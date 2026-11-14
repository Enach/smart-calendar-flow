import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { findTimeButton, pickFirstSelectableDay } from "@/test/bookingPage";
import PublicBooking from "./PublicBooking";
import { ApiHttpError } from "@/api/client";
import type { BookingRateLimitError, BookingSlotUnavailableError } from "@/api/generated/schemas";
import { schedulingLinksApi, type PublicSlotsParams } from "@/api/schedulingLinks";
import { toast } from "@/hooks/useToast";
import { addDaysToKey, dateKeyInZone } from "@/lib/timeZone";

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={["/book/intro"]}>
        <Routes>
          <Route path="/book/:slug" element={<PublicBooking />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("PublicBooking", () => {
  it("tells a visitor who lost the race to a slot why they are back on the slot list", async () => {
    vi.spyOn(schedulingLinksApi, "getPublicLink").mockResolvedValue({
      slug: "intro",
      title: "Intro call",
      durations: [30],
      hosts: [{ email: "host@co.com", name: "Host" }],
      min_notice_minutes: 0,
      usage_type: "reusable",
      coverage: { total: 1, checked: 1 },
    });
    vi.spyOn(schedulingLinksApi, "getPublicSlots").mockImplementation(async (_slug, params) => pac88Answer(params));
    vi.spyOn(schedulingLinksApi, "bookSlot").mockRejectedValue(
      new ApiHttpError(409, { error: "slot is no longer available" }),
    );

    renderPage();
    // Any selectable future day; the mocked slots don't depend on which.
    await pickFirstSelectableDay();

    fireEvent.click(await findTimeButton());
    fireEvent.change(screen.getByLabelText("Name", { exact: true }), { target: { value: "Slow Booker" } });
    fireEvent.change(screen.getByLabelText("Email", { exact: true }), { target: { value: "slow@co.com" } });
    fireEvent.click(screen.getByRole("button", { name: /confirm booking/i }));

    // Back on the slot list, with the reason announced.
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("slot is no longer available");
    expect(screen.queryByRole("button", { name: /confirm booking/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/you are confirmed/i)).not.toBeInTheDocument();
  });

  // PAC-72 revision 2: a link whose owner chose specific reasons answers the
  // 409 with {error, reason}; the page shows the server's text for the reason
  // and goes back to the slot list, exactly as for the generic body.
  it("shows the specific refusal text when the link owner chose specific reasons", async () => {
    vi.spyOn(schedulingLinksApi, "getPublicLink").mockResolvedValue(introLink);
    vi.spyOn(schedulingLinksApi, "getPublicSlots").mockImplementation(async (_slug, params) => pac88Answer(params));
    const specific: BookingSlotUnavailableError = { error: "a host is busy at that time", reason: "host_busy" };
    vi.spyOn(schedulingLinksApi, "bookSlot").mockRejectedValue(new ApiHttpError(409, specific));

    renderPage();
    await pickFirstSelectableDay();
    fireEvent.click(await findTimeButton());
    fireEvent.change(screen.getByLabelText("Name", { exact: true }), { target: { value: "Booker" } });
    fireEvent.change(screen.getByLabelText("Email", { exact: true }), { target: { value: "booker@co.com" } });
    fireEvent.click(screen.getByRole("button", { name: /confirm booking/i }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("a host is busy at that time");
    expect(screen.queryByRole("button", { name: /confirm booking/i })).not.toBeInTheDocument();
  });
});

// NEW-booking-rate-limit: the server answers 429 with this exact body when a
// client exceeds its booking or slot-listing budget.
const rateLimited: BookingRateLimitError = { error: "rate limit exceeded" };

const introLink = {
  slug: "intro",
  title: "Intro call",
  durations: [30],
  hosts: [{ email: "host@co.com", name: "Host" }],
  min_notice_minutes: 0,
  usage_type: "reusable" as const,
  coverage: { total: 1, checked: 1 },
};
/**
 * PAC-88: a server's listing answer (contract section 2.5). The overview lists
 * every day of the grid after today; a day lists one slot.
 */
function pac88Answer(params: PublicSlotsParams) {
  const zone = params.displayTimeZone ?? "UTC";
  const base = { time_zone: "UTC", display_time_zone: zone, range_from: params.date ?? params.from, range_to: params.date ?? params.to };
  if (params.date) return { ...base, available_dates: [], slots: [{ start: "2030-03-04T09:00:00Z", end: "2030-03-04T09:30:00Z" }] };
  const today = dateKeyInZone(Date.now(), zone);
  const days: string[] = [];
  for (let d = params.from!; d <= params.to!; d = addDaysToKey(d, 1)) if (d > today) days.push(d);
  return { ...base, slots: [], available_dates: days };
}

// PAC-105: the link was deleted or paused after the page loaded. The server
// answers the first send with 404 {"error":"not found"} and writes nothing.
describe("PublicBooking link gone on submit (PAC-105)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("a 404 on submit shows the page-load 'no longer active' wording, offers no retry, does not toast and never says it may have been saved", async () => {
    vi.spyOn(schedulingLinksApi, "getPublicLink").mockResolvedValue(introLink);
    vi.spyOn(schedulingLinksApi, "getPublicSlots").mockImplementation(async (_slug, params) => pac88Answer(params));
    const book = vi.spyOn(schedulingLinksApi, "bookSlot").mockRejectedValue(new ApiHttpError(404, { error: "not found" }));
    book.mockClear(); // the first describe block does not restore its spies
    const toastError = vi.spyOn(toast, "error");

    renderPage();
    await pickFirstSelectableDay();
    fireEvent.click(await findTimeButton());
    fireEvent.change(screen.getByLabelText("Name", { exact: true }), { target: { value: "Late Booker" } });
    fireEvent.change(screen.getByLabelText("Email", { exact: true }), { target: { value: "late@co.com" } });
    fireEvent.click(screen.getByRole("button", { name: /confirm booking/i }));

    expect(await screen.findByRole("heading", { name: "Link no longer active" })).toBeInTheDocument();
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("This booking link doesn't exist or is no longer active.");
    expect(alert).toHaveTextContent("Your booking was not made.");

    // Not the raw server text, no toast.
    expect(screen.queryByText(/^not found$/i)).not.toBeInTheDocument();
    expect(toastError).not.toHaveBeenCalled();
    // No retry of any kind.
    expect(screen.queryByRole("button", { name: /confirm booking/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /try again/i })).not.toBeInTheDocument();
    expect(screen.queryByTestId("booking-try-again")).not.toBeInTheDocument();
    // Never the "may have been saved" notice.
    expect(screen.queryByTestId("api-error")).not.toBeInTheDocument();
    expect(screen.queryByText(/may have been|may or may not/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/you are confirmed/i)).not.toBeInTheDocument();
    expect(screen.getByTestId("booking-error-home-link")).toHaveAttribute("href", "/");
    expect(book).toHaveBeenCalledTimes(1);
  });

  it("the page-load 404 keeps its wording (same sentence as the submit 404)", async () => {
    vi.spyOn(schedulingLinksApi, "getPublicLink").mockRejectedValue(new ApiHttpError(404, { error: "not found" }));
    renderPage();
    expect(await screen.findByRole("heading", { name: "Link not found" })).toBeInTheDocument();
    expect(screen.getByText("This booking link doesn't exist or is no longer active.")).toBeInTheDocument();
  });
});

describe("PublicBooking rate limits (NEW-booking-rate-limit)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("AC-10: a 429 on submit shows a friendly wait message, keeps the booker's input and slot, and neither toasts nor refetches", async () => {
    vi.spyOn(schedulingLinksApi, "getPublicLink").mockResolvedValue(introLink);
    const slotsSpy = vi.spyOn(schedulingLinksApi, "getPublicSlots").mockImplementation(async (_slug, params) => pac88Answer(params));
    vi.spyOn(schedulingLinksApi, "bookSlot").mockRejectedValue(new ApiHttpError(429, rateLimited));
    const toastError = vi.spyOn(toast, "error");

    renderPage();
    await pickFirstSelectableDay();
    fireEvent.click(await findTimeButton());
    fireEvent.change(screen.getByLabelText("Name", { exact: true }), { target: { value: "Eager Booker" } });
    fireEvent.change(screen.getByLabelText("Email", { exact: true }), { target: { value: "eager@co.com" } });
    fireEvent.change(screen.getByLabelText(/notes/i), { target: { value: "About the demo" } });
    const slotCallsBefore = slotsSpy.mock.calls.length;
    fireEvent.click(screen.getByRole("button", { name: /confirm booking/i }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/too many attempts/i);
    expect(alert).toHaveTextContent(/wait a few minutes/i);
    expect(screen.queryByText(/rate limit exceeded/i)).not.toBeInTheDocument();
    expect(toastError).not.toHaveBeenCalled();

    // Still on the details step, with everything the booker typed.
    expect(screen.getByRole("button", { name: /confirm booking/i })).toBeInTheDocument();
    expect(screen.getByLabelText("Name", { exact: true })).toHaveValue("Eager Booker");
    expect(screen.getByLabelText("Email", { exact: true })).toHaveValue("eager@co.com");
    expect(screen.getByLabelText(/notes/i)).toHaveValue("About the demo");
    expect(slotsSpy.mock.calls.length).toBe(slotCallsBefore);
  });

  it("AC-11: a 429 on the slot listing shows a friendly wait message with the manual Retry", async () => {
    vi.spyOn(schedulingLinksApi, "getPublicLink").mockResolvedValue(introLink);
    // PAC-88: the overview answers; the day listing is the one rate limited.
    let dayAnswers = 0;
    const slotsSpy = vi.spyOn(schedulingLinksApi, "getPublicSlots").mockImplementation(async (_slug, params) => {
      if (params.date && dayAnswers++ === 0) throw new ApiHttpError(429, rateLimited);
      return pac88Answer(params);
    });

    renderPage();
    await pickFirstSelectableDay();

    expect(await screen.findByText(/too many requests for available times/i)).toBeInTheDocument();
    expect(screen.getByText(/wait a minute/i)).toBeInTheDocument();
    expect(screen.queryByText(/rate limit exceeded/i)).not.toBeInTheDocument();
    expect(slotsSpy.mock.calls.filter(([, p]) => p.date).length).toBe(1);

    fireEvent.click(screen.getByRole("button", { name: /try again/i } /* PAC-83: the manual retry is labelled "Try again" (spec §3.4) */));
    expect(await findTimeButton()).toBeInTheDocument();
    expect(screen.queryByText(/too many requests for available times/i)).not.toBeInTheDocument();
  });
});
