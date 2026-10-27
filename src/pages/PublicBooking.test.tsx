import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import PublicBooking from "./PublicBooking";
import { ApiHttpError } from "@/api/client";
import type { BookingRateLimitError } from "@/api/generated/schemas";
import { schedulingLinksApi } from "@/api/schedulingLinks";
import { toast } from "@/hooks/useToast";

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
    vi.spyOn(schedulingLinksApi, "getPublicSlots").mockResolvedValue({
      available_dates: [],
      slots: [{ start: "2030-03-04T09:00:00Z", end: "2030-03-04T09:30:00Z" }],
    });
    vi.spyOn(schedulingLinksApi, "bookSlot").mockRejectedValue(
      new ApiHttpError(409, { error: "slot is no longer available" }),
    );

    renderPage();
    await screen.findByRole("heading", { name: "Intro call" });

    // Any selectable future day; the mocked slots don't depend on which.
    const grid = screen.getByRole("grid");
    const day = within(grid)
      .getAllByRole("button")
      .find((b) => !b.hasAttribute("disabled") && b.getAttribute("aria-disabled") !== "true");
    expect(day).toBeDefined();
    fireEvent.click(day!);

    fireEvent.click(await screen.findByRole("button", { name: /\d{1,2}:\d{2}/ }));
    fireEvent.change(screen.getByLabelText("Name", { exact: true }), { target: { value: "Slow Booker" } });
    fireEvent.change(screen.getByLabelText("Email", { exact: true }), { target: { value: "slow@co.com" } });
    fireEvent.click(screen.getByRole("button", { name: /confirm booking/i }));

    // Back on the slot list, with the reason announced.
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("slot is no longer available");
    expect(screen.queryByRole("button", { name: /confirm booking/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/you are confirmed/i)).not.toBeInTheDocument();
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
const oneSlot = {
  available_dates: [],
  slots: [{ start: "2030-03-04T09:00:00Z", end: "2030-03-04T09:30:00Z" }],
};

async function pickFirstDay() {
  await screen.findByRole("heading", { name: "Intro call" });
  const grid = screen.getByRole("grid");
  const day = within(grid)
    .getAllByRole("button")
    .find((b) => !b.hasAttribute("disabled") && b.getAttribute("aria-disabled") !== "true");
  expect(day).toBeDefined();
  fireEvent.click(day!);
}

describe("PublicBooking rate limits (NEW-booking-rate-limit)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("AC-10: a 429 on submit shows a friendly wait message, keeps the booker's input and slot, and neither toasts nor refetches", async () => {
    vi.spyOn(schedulingLinksApi, "getPublicLink").mockResolvedValue(introLink);
    const slotsSpy = vi.spyOn(schedulingLinksApi, "getPublicSlots").mockResolvedValue(oneSlot);
    vi.spyOn(schedulingLinksApi, "bookSlot").mockRejectedValue(new ApiHttpError(429, rateLimited));
    const toastError = vi.spyOn(toast, "error");

    renderPage();
    await pickFirstDay();
    fireEvent.click(await screen.findByRole("button", { name: /\d{1,2}:\d{2}/ }));
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
    const slotsSpy = vi
      .spyOn(schedulingLinksApi, "getPublicSlots")
      .mockRejectedValueOnce(new ApiHttpError(429, rateLimited))
      .mockResolvedValue(oneSlot);

    renderPage();
    await pickFirstDay();

    expect(await screen.findByText(/too many requests for available times/i)).toBeInTheDocument();
    expect(screen.getByText(/wait a minute/i)).toBeInTheDocument();
    expect(screen.queryByText(/rate limit exceeded/i)).not.toBeInTheDocument();
    expect(slotsSpy).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: /retry/i }));
    expect(await screen.findByRole("button", { name: /\d{1,2}:\d{2}/ })).toBeInTheDocument();
    expect(screen.queryByText(/too many requests for available times/i)).not.toBeInTheDocument();
  });
});
