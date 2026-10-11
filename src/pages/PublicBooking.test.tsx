import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import PublicBooking from "./PublicBooking";
import { ApiHttpError } from "@/api/client";
import { schedulingLinksApi } from "@/api/schedulingLinks";

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
