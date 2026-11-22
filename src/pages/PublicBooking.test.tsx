import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { findTimeButton, pickFirstSelectableDay } from "@/test/bookingPage";
import PublicBooking from "./PublicBooking";
import { API_MESSAGES, ApiHttpError, ApiRateLimitedError, RATE_LIMIT_DEFAULT_RETRY_MS } from "@/api/client";
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

/** A wait longer than the real Retry-After of the tests that time one out. */
const SLOW_TEST = 20_000;

/**
 * NEW-booking-rate-limit (clockwise-like#332). The three public booking calls
 * that declare a 429 - the link lookup, the slot listing and the booking
 * submit - all land in the one PAC-83 taxonomy case, so the visitor is never
 * told about limits, never shown the server's string, and never told the link
 * is gone. The mapping is on the status, not on the operation.
 */
describe("PublicBooking rate limits (NEW-booking-rate-limit)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  /** The server's 429: `{"error":"rate limit exceeded"}` and its Retry-After. */
  function limited(retryAfter?: string) {
    return new ApiRateLimitedError(rateLimited, retryAfter);
  }

  it("AC-10: a 429 on submit says the booking was not sent, keeps the booker's input and slot, and neither toasts nor refetches", async () => {
    vi.spyOn(schedulingLinksApi, "getPublicLink").mockResolvedValue(introLink);
    const slotsSpy = vi.spyOn(schedulingLinksApi, "getPublicSlots").mockImplementation(async (_slug, params) => pac88Answer(params));
    // createPublicBooking's own budget: Retry-After is 1..600 s there.
    vi.spyOn(schedulingLinksApi, "bookSlot").mockRejectedValue(limited("600"));
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
    expect(alert).toHaveTextContent(API_MESSAGES.rateLimitedBooking);
    // Never the server's string, never developer framing, and never the
    // "may have been saved" doubt: a 429 writes nothing.
    expect(screen.queryByText(/rate limit exceeded/i)).not.toBeInTheDocument();
    expect(alert).not.toHaveTextContent(/too many|429|rate limit|throttl/i);
    expect(alert).not.toHaveTextContent(/may have been|may or may not/i);
    expect(toastError).not.toHaveBeenCalled();

    // A 600-second wait gates no control: Confirm stays pressable rather than
    // being disabled for ten minutes, and everything typed is still there.
    expect(screen.getByRole("button", { name: /confirm booking/i })).toBeEnabled();
    expect(screen.getByLabelText("Name", { exact: true })).toHaveValue("Eager Booker");
    expect(screen.getByLabelText("Email", { exact: true })).toHaveValue("eager@co.com");
    expect(screen.getByLabelText(/notes/i)).toHaveValue("About the demo");
    expect(slotsSpy.mock.calls.length).toBe(slotCallsBefore);
  });

  it("AC-11: a 429 on the slot listing waits out Retry-After: 1 before its Try again can be pressed", async () => {
    vi.spyOn(schedulingLinksApi, "getPublicLink").mockResolvedValue(introLink);
    // PAC-88: the overview answers; the day listing is the one rate limited.
    let dayAnswers = 0;
    const slotsSpy = vi.spyOn(schedulingLinksApi, "getPublicSlots").mockImplementation(async (_slug, params) => {
      if (params.date && dayAnswers++ === 0) throw limited("1");
      return pac88Answer(params);
    });

    renderPage();
    await pickFirstSelectableDay();

    const notice = await screen.findByTestId("api-error");
    expect(notice).toHaveAttribute("data-error-kind", "rate-limited");
    expect(notice).toHaveTextContent(API_MESSAGES.rateLimitedRead);
    expect(screen.queryByText(/rate limit exceeded/i)).not.toBeInTheDocument();
    expect(slotsSpy.mock.calls.filter(([, p]) => p.date).length).toBe(1);

    // The retry is offered, but honours the server's delay rather than
    // immediately spending a budget that is already gone.
    const retry = within(notice).getByTestId("api-error-retry");
    expect(retry).toBeDisabled();
    await waitFor(() => expect(retry).toBeEnabled(), { timeout: 5_000 });

    fireEvent.click(retry);
    expect(await findTimeButton()).toBeInTheDocument();
    expect(screen.queryByTestId("api-error")).not.toBeInTheDocument();
  }, SLOW_TEST);

  it("a 429 with no readable Retry-After falls back to the client's own wait, never failing", async () => {
    // The real case: a deployment whose API base is on another origin cannot
    // read the header, which is not in Access-Control-Expose-Headers.
    vi.spyOn(schedulingLinksApi, "getPublicLink").mockResolvedValue(introLink);
    vi.spyOn(schedulingLinksApi, "getPublicSlots").mockImplementation(async (_slug, params) => {
      if (params.date) throw limited();
      return pac88Answer(params);
    });

    renderPage();
    await pickFirstSelectableDay();

    const notice = await screen.findByTestId("api-error");
    expect(notice).toHaveAttribute("data-error-kind", "rate-limited");
    expect(notice).toHaveTextContent(API_MESSAGES.rateLimitedRead);
    // The fallback covers the whole shared window, so it never under-waits.
    expect(RATE_LIMIT_DEFAULT_RETRY_MS).toBe(60_000);
    expect(within(notice).getByTestId("api-error-retry")).toBeDisabled();
  });

  /**
   * The gap this session was opened for. `GET /api/book/{slug}` is the first
   * call a visitor makes and shares the slot-listing budget, so reloading the
   * page is enough to trip it. Before this change the page rendered the
   * heading "We couldn't load this link" over the server's own
   * "rate limit exceeded", with a Try again that re-spent the budget at once.
   */
  it("a 429 on the link lookup never renders the not-found or no-longer-available shape", async () => {
    vi.spyOn(schedulingLinksApi, "getPublicLink").mockRejectedValue(limited("30"));
    renderPage();

    const notice = await screen.findByTestId("api-error");
    expect(notice).toHaveAttribute("data-error-kind", "rate-limited");
    expect(notice).toHaveTextContent(API_MESSAGES.rateLimitedRead);
    expect(screen.getByRole("heading", { name: "Just a moment" })).toBeInTheDocument();

    // Not the 404 shape, not the 410 shape, and not "we couldn't load it".
    expect(screen.queryByRole("heading", { name: "Link not found" })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Link no longer active" })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Link no longer available" })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /couldn't load this link/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/doesn't exist or is no longer active/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/used up or paused/i)).not.toBeInTheDocument();
    // Never the server's string, never developer framing.
    expect(screen.queryByText(/rate limit exceeded/i)).not.toBeInTheDocument();
    expect(notice).not.toHaveTextContent(/too many|429|rate limit|throttl/i);
  });
});
