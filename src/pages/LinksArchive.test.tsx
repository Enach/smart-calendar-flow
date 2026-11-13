import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";

vi.mock("@/components/Navbar", () => ({ Navbar: () => null }));

import LinksArchivePage from "./LinksArchive";
import {
  ARCHIVED_A,
  ARCHIVED_EMPTY,
  BOOKING,
  BOOKING_ID,
  ERASED_BOOKING,
  ERASED_BOOKING_ID,
  LINK_ID,
  POLICY_A,
  POLICY_B,
  jsonResponse,
  requestPath,
} from "@/test/pac40Fixtures";

// PAC-40 part A, web: the owner's read-only archive (spec section 3.2,
// contract sections 2.1-2.4 and 7).

const fetchMock = vi.fn<typeof fetch>();

function renderPage() {
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter initialEntries={["/app/links/archive"]}>
        <LinksArchivePage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function answer(list: unknown, detail?: unknown, detailStatus = 200) {
  fetchMock.mockImplementation(async (input) => {
    const path = requestPath(input);
    if (path === "/api/scheduling-links/archive") return jsonResponse(list);
    if (path.startsWith("/api/scheduling-links/archive/")) return jsonResponse(detail, detailStatus);
    return jsonResponse({ error: "unexpected" }, 500);
  });
}

describe("PAC-40 archive page", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterAll(() => vi.unstubAllGlobals());

  it("lists each deleted link with its title, former address, deletion date and booking count", async () => {
    answer({ links: [ARCHIVED_A, ARCHIVED_EMPTY], booker_erasure: POLICY_A });
    renderPage();
    const row = await screen.findByTestId("archive-row-intro-call");
    expect(row).toHaveAttribute("data-erasure-state", "awaiting_erasure");
    expect(within(row).getByRole("heading", { name: "Intro call" })).toBeInTheDocument();
    expect(within(row).getByText(/\/book\/intro-call$/)).toBeInTheDocument();
    expect(within(row).getByText(/Deleted .*Nov 10, 2026 · 2 bookings/)).toBeInTheDocument();
    const rows = within(screen.getByTestId("archive-list")).getAllByRole("listitem");
    expect(rows.map((r) => r.getAttribute("data-testid"))).toEqual(["archive-row-intro-call", "archive-row-old-demo"]);
  });

  it("part A (enabled=false): no erasure date, no erasure promise anywhere on the page", async () => {
    answer({ links: [ARCHIVED_A, ARCHIVED_EMPTY], booker_erasure: POLICY_A });
    renderPage();
    await screen.findByTestId("archive-row-intro-call");
    expect(screen.queryByTestId("archive-erasure")).not.toBeInTheDocument();
    expect(screen.queryByText(/erase/i)).not.toBeInTheDocument();
  });

  it("enabled=true: the due date is shown, and a link without bookings says there is nothing to erase", async () => {
    answer({
      links: [{ ...ARCHIVED_A, erasure_due_at: "2027-03-01T10:30:00Z" }, ARCHIVED_EMPTY],
      booker_erasure: POLICY_B,
    });
    renderPage();
    const row = await screen.findByTestId("archive-row-intro-call");
    expect(within(row).getByTestId("archive-erasure")).toHaveTextContent(/will be erased on .*Mar 1, 2027/);
    expect(within(screen.getByTestId("archive-row-old-demo")).getByTestId("archive-erasure")).toHaveTextContent(
      "nothing to erase",
    );
  });

  it("an erased link shows when it was erased (a fact, whatever the policy)", async () => {
    answer({
      links: [{ ...ARCHIVED_A, erasure_state: "erased", erased_at: "2027-03-01T03:00:00Z" }],
      booker_erasure: POLICY_A,
    });
    renderPage();
    const row = await screen.findByTestId("archive-row-intro-call");
    expect(row).toHaveAttribute("data-erasure-state", "erased");
    expect(within(row).getByTestId("archive-erasure")).toHaveTextContent(/erased on .*Mar 1, 2027/);
  });

  it("an owner who deleted nothing sees an empty archive (AC-24)", async () => {
    answer({ links: [], booker_erasure: POLICY_A });
    renderPage();
    expect(await screen.findByTestId("archive-empty")).toHaveTextContent("You haven’t deleted any links.");
  });

  it("the detail lists every booking; an erased booker is an explicit state, never a blank (AC-22, AC-32)", async () => {
    answer({ links: [ARCHIVED_A], booker_erasure: POLICY_A }, { link: ARCHIVED_A, bookings: [BOOKING, ERASED_BOOKING] });
    renderPage();
    fireEvent.click(await screen.findByTestId("archive-view-bookings"));
    const live = await screen.findByTestId(`archive-booking-${BOOKING_ID}`);
    expect(requestPath(fetchMock.mock.calls[fetchMock.mock.calls.length - 1][0])).toBe(`/api/scheduling-links/archive/${LINK_ID}`);
    expect(live).toHaveAttribute("data-erased", "false");
    expect(within(live).getByTestId("archive-booker-name")).toHaveTextContent("Ada Lovelace");
    expect(within(live).getByTestId("archive-booker-email")).toHaveTextContent("ada@example.com");
    expect(within(live).getByTestId("archive-booking-status")).toHaveTextContent("Confirmed");
    expect(within(live).getByText("About the roadmap")).toBeInTheDocument();
    expect(within(live).getByText(/Booked .*Nov 5, 2026/)).toBeInTheDocument();

    const erased = screen.getByTestId(`archive-booking-${ERASED_BOOKING_ID}`);
    expect(erased).toHaveAttribute("data-erased", "true");
    expect(within(erased).getByTestId("archive-booker-erased")).toHaveTextContent(/Name and email erased on .*Mar 1, 2027/);
    expect(within(erased).queryByTestId("archive-booker-name")).not.toBeInTheDocument();
    expect(within(erased).getByTestId("archive-booking-status")).toHaveTextContent("Cancelled");
  });

  it("is read-only: no control edits, resumes, restores or deletes a link (spec section 3.2)", async () => {
    answer({ links: [ARCHIVED_A], booker_erasure: POLICY_A }, { link: ARCHIVED_A, bookings: [BOOKING] });
    renderPage();
    fireEvent.click(await screen.findByTestId("archive-view-bookings"));
    await screen.findByTestId(`archive-booking-${BOOKING_ID}`);
    const forbidden = /edit|resume|restore|delete|pause|activate|invite|copy/i;
    expect(screen.queryAllByRole("button").filter((b) => forbidden.test(b.textContent ?? "") || forbidden.test(b.getAttribute("aria-label") ?? ""))).toEqual([]);
    expect(screen.queryAllByRole("switch")).toEqual([]);
    expect(fetchMock.mock.calls.every(([, init]) => (init?.method ?? "GET") === "GET")).toBe(true);
  });

  it("K4-7: a 200 that fails the schema shows 'archive unavailable' and nothing from the archive", async () => {
    answer({ links: [{ ...ARCHIVED_A, restored_at: null }], booker_erasure: POLICY_A });
    renderPage();
    expect(await screen.findByTestId("archive-unavailable")).toHaveTextContent("The archive is unavailable right now.");
    expect(screen.queryByTestId("archive-list")).not.toBeInTheDocument();
    expect(screen.queryByTestId("archive-empty")).not.toBeInTheDocument();
  });

  it("an older server's 400 shows 'archive unavailable' (contract section 7), and Try again reads again", async () => {
    answer({ error: "invalid id" });
    fetchMock.mockImplementationOnce(async () => jsonResponse({ error: "invalid id" }, 400));
    renderPage();
    const box = await screen.findByTestId("archive-unavailable");
    fetchMock.mockImplementation(async () => jsonResponse({ links: [], booker_erasure: POLICY_A }));
    fireEvent.click(within(box).getByRole("button", { name: /try again/i }));
    expect(await screen.findByTestId("archive-empty")).toBeInTheDocument();
  });

  it("PAC-83: an unreachable server keeps the 'can't reach' notice with its retry, not invented data", async () => {
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));
    renderPage();
    const notice = await screen.findByTestId("api-error");
    expect(notice).toHaveAttribute("data-error-kind", "lost");
    expect(notice).toHaveAttribute("data-effect", "read");
    expect(screen.getByTestId("api-error-retry")).toBeInTheDocument();
    expect(screen.queryByTestId("archive-unavailable")).not.toBeInTheDocument();
    expect(screen.queryByTestId("archive-list")).not.toBeInTheDocument();
  });

  it("detail 404 (no longer in the archive) says so and refreshes the list", async () => {
    answer({ links: [ARCHIVED_A], booker_erasure: POLICY_A }, { error: "not found" }, 404);
    renderPage();
    fireEvent.click(await screen.findByTestId("archive-view-bookings"));
    expect(await screen.findByTestId("archive-detail-not-found")).toHaveTextContent("This link is no longer in your archive.");
    await waitFor(() =>
      expect(fetchMock.mock.calls.filter(([i]) => requestPath(i) === "/api/scheduling-links/archive")).toHaveLength(2),
    );
  });

  it("K4-7 on the detail: a body that fails the schema shows the detail as unavailable", async () => {
    answer({ links: [ARCHIVED_A], booker_erasure: POLICY_A }, { link: ARCHIVED_A, bookings: [{ ...BOOKING, extra: 1 }] });
    renderPage();
    fireEvent.click(await screen.findByTestId("archive-view-bookings"));
    expect(await screen.findByTestId("archive-detail-unavailable")).toBeInTheDocument();
    expect(screen.queryByTestId("archive-bookings")).not.toBeInTheDocument();
  });

  it("a deleted link without bookings opens on an empty bookings state", async () => {
    answer({ links: [ARCHIVED_EMPTY], booker_erasure: POLICY_A }, { link: ARCHIVED_EMPTY, bookings: [] });
    renderPage();
    fireEvent.click(await screen.findByTestId("archive-view-bookings"));
    expect(await screen.findByTestId("archive-bookings-empty")).toBeInTheDocument();
  });
});
