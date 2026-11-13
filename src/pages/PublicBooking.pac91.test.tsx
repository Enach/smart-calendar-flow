/**
 * PAC-91 on the public booking page (contract sections 3.2 and 4): every link
 * that leaves the booking page for another Paceday page targets the top-level
 * browsing context (TOP_LEVEL_LINK_TARGET), in every state, and activating one
 * never moves the app's client-side location off /book/<slug>.
 *
 * jsdom does not load documents, so "leaves the frame" is proven by the
 * rendered href/target and by the router staying put; the real top-level
 * navigation is the e2e's (AC-4, AC-5).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import PublicBooking from "./PublicBooking";
import { ApiHttpError, ApiUnreachableError } from "@/api/client";
import { schedulingLinksApi, type PublicSlotsParams } from "@/api/schedulingLinks";
import type { BookingConfirmation, PublicLinkInfo } from "@/api/types";
import { TOP_LEVEL_LINK_TARGET } from "@/lib/framing";
import { addDaysToKey, dateKeyInZone } from "@/lib/timeZone";

const SLUG = "intro";

const introLink: PublicLinkInfo = {
  slug: SLUG,
  title: "Intro call",
  durations: [30],
  hosts: [{ email: "host@co.com", name: "Host" }],
  min_notice_minutes: 0,
  usage_type: "reusable",
  coverage: { total: 1, checked: 1 },
};

const booked: BookingConfirmation = {
  id: "b1",
  link_slug: SLUG,
  title: "Intro call",
  start: "2030-03-04T09:00:00Z",
  end: "2030-03-04T09:30:00Z",
  duration_minutes: 30,
  hosts: [{ email: "host@co.com", name: "Host" }],
  booker_name: "Booker",
  booker_email: "booker@co.com",
};

/** A PAC-88 listing answer: every day after today is offered, a day lists one slot. */
function listing(params: PublicSlotsParams) {
  const zone = params.displayTimeZone ?? "UTC";
  const base = { time_zone: "UTC", display_time_zone: zone, range_from: params.date ?? params.from, range_to: params.date ?? params.to };
  if (params.date) return { ...base, available_dates: [], slots: [{ start: booked.start, end: booked.end }] };
  const today = dateKeyInZone(Date.now(), zone);
  const days: string[] = [];
  for (let d = params.from!; d <= params.to!; d = addDaysToKey(d, 1)) if (d > today) days.push(d);
  return { ...base, slots: [], available_dates: days };
}

function Where() {
  return <output data-testid="router-location">{useLocation().pathname}</output>;
}

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[`/book/${SLUG}`]}>
        <Routes>
          <Route path="/book/:slug" element={<PublicBooking />} />
          <Route path="*" element={<p>left the booking page</p>} />
        </Routes>
        <Where />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const location = () => screen.getByTestId("router-location").textContent;

/** Every anchor whose destination is a Paceday page (same origin). */
function internalAnchors(): HTMLAnchorElement[] {
  return Array.from(document.querySelectorAll<HTMLAnchorElement>("a[href]")).filter(
    (a) => new URL(a.getAttribute("href")!, window.location.href).origin === window.location.origin,
  );
}

/**
 * AC-3: each internal anchor carries the shared target, and activating it
 * leaves the router on /book/<slug>. React Router handles the click first
 * (a <Link> would navigate the router here); the window listener, which runs
 * after React's, only stops jsdom's own "navigation not implemented" noise.
 */
function expectEveryInternalAnchorLeavesTheFrame(minimum: number) {
  const anchors = internalAnchors();
  expect(anchors.length).toBeGreaterThanOrEqual(minimum);
  for (const a of anchors) {
    expect(a).toHaveAttribute("target", TOP_LEVEL_LINK_TARGET);
    fireEvent.click(a);
    expect(location()).toBe(`/book/${SLUG}`);
  }
  expect(screen.queryByText("left the booking page")).not.toBeInTheDocument();
}

/** Anchors only: a form's submit button must keep its default action. */
const stopJsdomNavigation = (e: Event) => {
  if (e.target instanceof Element && e.target.closest("a[href]")) e.preventDefault();
};

async function chooseFirstSlot() {
  await screen.findByRole("heading", { name: "Intro call" });
  const day = await vi.waitFor(() => {
    const d = within(screen.getByRole("grid"))
      .getAllByRole("button")
      .find((b) => !b.hasAttribute("disabled") && b.getAttribute("aria-disabled") !== "true");
    if (!d) throw new Error("no selectable day yet");
    return d;
  });
  fireEvent.click(day);
  fireEvent.click(await screen.findByRole("button", { name: /\d{1,2}:\d{2}/ }));
  await screen.findByRole("button", { name: /confirm booking/i });
}

describe("PAC-91 booking page links leave the frame", () => {
  beforeEach(() => {
    window.addEventListener("click", stopJsdomNavigation);
  });
  afterEach(() => {
    window.removeEventListener("click", stopJsdomNavigation);
    vi.restoreAllMocks();
  });

  it("AC-1: the loaded page's header link goes to / at the top level", async () => {
    vi.spyOn(schedulingLinksApi, "getPublicLink").mockResolvedValue(introLink);
    vi.spyOn(schedulingLinksApi, "getPublicSlots").mockImplementation(async (_s, p) => listing(p));
    renderPage();
    await screen.findByRole("heading", { name: "Intro call" });

    const link = screen.getByTestId("booking-home-link");
    expect(link.tagName).toBe("A");
    expect(link).toHaveAttribute("href", "/");
    expect(link).toHaveAttribute("target", TOP_LEVEL_LINK_TARGET);
    expect(link).toHaveAccessibleName("paceday");
  });

  it.each([
    ["generic error (answer lost)", new ApiUnreachableError("network"), "We couldn't load this link"],
    ["generic error (server error)", new ApiHttpError(500, { error: "boom" }), "We couldn't load this link"],
    ["404", new ApiHttpError(404, { error: "not found" }), "Link not found"],
    ["410", new ApiHttpError(410, { error: "gone" }), "Link no longer available"],
  ])("AC-2: the %s state's back link goes to / at the top level", async (_state, error, heading) => {
    vi.spyOn(schedulingLinksApi, "getPublicLink").mockRejectedValue(error);
    renderPage();
    await screen.findByRole("heading", { name: heading });

    const link = screen.getByTestId("booking-error-home-link");
    expect(link.tagName).toBe("A");
    expect(link).toHaveAttribute("href", "/");
    expect(link).toHaveAttribute("target", TOP_LEVEL_LINK_TARGET);
    expect(link).toHaveAccessibleName("← Back to Paceday");
  });

  it("AC-3: loaded — every internal anchor carries the target and the router stays on /book/<slug>", async () => {
    vi.spyOn(schedulingLinksApi, "getPublicLink").mockResolvedValue(introLink);
    vi.spyOn(schedulingLinksApi, "getPublicSlots").mockImplementation(async (_s, p) => listing(p));
    renderPage();
    await screen.findByRole("heading", { name: "Intro call" });
    expectEveryInternalAnchorLeavesTheFrame(1);
  });

  it("AC-3: slot chosen — every internal anchor carries the target and the router stays on /book/<slug>", async () => {
    vi.spyOn(schedulingLinksApi, "getPublicLink").mockResolvedValue(introLink);
    vi.spyOn(schedulingLinksApi, "getPublicSlots").mockImplementation(async (_s, p) => listing(p));
    renderPage();
    await chooseFirstSlot();
    expectEveryInternalAnchorLeavesTheFrame(1);
  });

  it("AC-3: booked — every internal anchor carries the target and the router stays on /book/<slug>", async () => {
    vi.spyOn(schedulingLinksApi, "getPublicLink").mockResolvedValue(introLink);
    vi.spyOn(schedulingLinksApi, "getPublicSlots").mockImplementation(async (_s, p) => listing(p));
    vi.spyOn(schedulingLinksApi, "bookSlot").mockResolvedValue(booked);
    renderPage();
    await chooseFirstSlot();
    fireEvent.change(screen.getByLabelText("Name", { exact: true }), { target: { value: "Booker" } });
    fireEvent.change(screen.getByLabelText("Email", { exact: true }), { target: { value: "booker@co.com" } });
    fireEvent.click(screen.getByRole("button", { name: /confirm booking/i }));
    await screen.findByRole("heading", { name: /you are confirmed/i });
    // The confirmation has no link to another Paceday page today; any added later is held to the rule.
    expectEveryInternalAnchorLeavesTheFrame(0);
  });

  it.each([
    ["generic error", new ApiUnreachableError("network")],
    ["404", new ApiHttpError(404, { error: "not found" })],
    ["410", new ApiHttpError(410, { error: "gone" })],
  ])("AC-3: %s — every internal anchor carries the target and the router stays on /book/<slug>", async (_state, error) => {
    vi.spyOn(schedulingLinksApi, "getPublicLink").mockRejectedValue(error);
    renderPage();
    await waitFor(() => expect(screen.getByTestId("booking-error-home-link")).toBeInTheDocument());
    expectEveryInternalAnchorLeavesTheFrame(1);
  });
});
