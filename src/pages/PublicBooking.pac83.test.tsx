/**
 * PAC-83 on the public booking page: AC-4/AC-5 (still working, late real
 * slots), AC-10, AC-11, AC-12, AC-21, AC-22, AC-22b, AC-23, AC-25.
 * The fake server sits at fetch, so "exactly one booking request" is counted
 * on the wire.
 */
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import PublicBooking from "./PublicBooking";
import { API_MESSAGES } from "@/api/client";
import { addDaysToKey, dateKeyInZone } from "@/lib/timeZone";

const fetchMock = vi.fn<typeof fetch>();
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const html = (status: number) => new Response("<html><body>502 Bad Gateway</body></html>", { status, headers: { "content-type": "text/html" } });

const LINK = { slug: "intro", title: "Intro call", durations: [30], hosts: [{ email: "host@co.com", name: "Host" }, { email: "co@co.com", name: "Co" }], min_notice_minutes: 0, usage_type: "reusable" };
const SLOT = { start: "2030-03-04T09:00:00Z", end: "2030-03-04T09:30:00Z" };

type Handler = (method: string, path: string, url: URL) => Promise<Response> | Response;
let handler: Handler;
const calls = (method: string, path: string) =>
  fetchMock.mock.calls.filter(([u, init]) => (init?.method ?? "GET") === method && new URL(String(u), window.location.origin).pathname === path).length;
/** PAC-88: listing requests for one day (`date`), as opposed to the day overview (`from`/`to`). */
const dayCalls = () =>
  fetchMock.mock.calls.filter(([u]) => {
    const url = new URL(String(u), window.location.origin);
    return url.pathname === "/api/book/intro/slots" && url.searchParams.has("date");
  }).length;
const isDayRequest = (url: URL) => url.searchParams.has("date");

/**
 * A PAC-88 server's listing answer (contract section 2.5): the day overview
 * lists every day of the requested grid after today, a day lists SLOT; both
 * echo display_time_zone and state the link zone (UTC, the fixture has none).
 */
function slotsAnswer(url: URL) {
  const zone = url.searchParams.get("display_time_zone") ?? "UTC";
  const date = url.searchParams.get("date");
  const from = date ?? url.searchParams.get("from")!;
  const to = date ?? url.searchParams.get("to")!;
  const base = { time_zone: "UTC", display_time_zone: zone, range_from: from, range_to: to };
  if (date) return json({ ...base, slots: [SLOT], available_dates: [] });
  const today = dateKeyInZone(Date.now(), zone);
  const days: string[] = [];
  for (let d = from; d <= to; d = addDaysToKey(d, 1)) if (d > today) days.push(d);
  return json({ ...base, slots: [], available_dates: days });
}

function renderPage(slug = "intro") {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[`/book/${slug}`]}>
        <Routes>
          <Route path="/book/:slug" element={<PublicBooking />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

async function pickFirstDay() {
  await screen.findByRole("heading", { name: "Intro call" });
  // PAC-88: days become selectable once the day overview answers.
  const day = await vi.waitFor(() => {
    const d = within(screen.getByRole("grid"))
      .getAllByRole("button")
      .find((b) => !b.hasAttribute("disabled") && b.getAttribute("aria-disabled") !== "true");
    if (!d) throw new Error("no selectable day yet");
    return d;
  });
  fireEvent.click(day!);
}

async function fillAndSubmit() {
  fireEvent.click(await screen.findByRole("button", { name: /\d{1,2}:\d{2}/ }));
  fireEvent.change(screen.getByLabelText("Name", { exact: true }), { target: { value: "Booker" } });
  fireEvent.change(screen.getByLabelText("Email", { exact: true }), { target: { value: "booker@co.com" } });
  fireEvent.change(screen.getByLabelText(/notes/i), { target: { value: "Agenda" } });
  fireEvent.click(screen.getByRole("button", { name: /confirm booking/i }));
}

function serveBooking(book: () => Promise<Response> | Response) {
  handler = (method, path, url) => {
    if (method === "GET" && path === "/api/book/intro") return json(LINK);
    if (method === "GET" && path === "/api/book/intro/slots") return slotsAnswer(url);
    if (method === "POST" && path === "/api/book/intro") return book();
    return json({ error: "not here" }, 404);
  };
}

describe("PAC-83 public booking", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    fetchMock.mockImplementation(async (u, init) => {
      const url = new URL(String(u), window.location.origin);
      return handler((init?.method ?? "GET").toUpperCase(), url.pathname, url);
    });
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => {
    vi.useRealTimers();
  });
  afterAll(() => {
    vi.unstubAllGlobals();
  });

  it("AC-10: a link-info read that fails at the network level once says 'can't reach' with Try again, never 'Link not found'; retry shows the real link", async () => {
    let first = true;
    handler = (method, path) => {
      if (method === "GET" && path === "/api/book/intro") {
        if (first) {
          first = false;
          throw new TypeError("Failed to fetch");
        }
        return json(LINK);
      }
      return json([]);
    };
    renderPage();
    const notice = await screen.findByTestId("api-error");
    expect(notice).toHaveAttribute("data-error-kind", "lost");
    expect(notice).toHaveAttribute("data-effect", "read");
    expect(notice).toHaveTextContent(API_MESSAGES.lostRead);
    expect(screen.queryByText(/link not found/i)).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId("api-error-retry"));
    expect(await screen.findByRole("heading", { name: "Intro call" })).toBeInTheDocument();
  });

  it("AC-12: a demo seed slug with the server unreachable shows no demo link", async () => {
    handler = () => {
      throw new TypeError("Failed to fetch");
    };
    renderPage("intro-chat");
    await screen.findByTestId("api-error");
    expect(screen.queryByText(/intro chat/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("grid")).not.toBeInTheDocument();
  });

  it("AC-11: a slot listing that fails at the network level shows 'can't reach' with a retry — never an empty list or 'no time available'", async () => {
    handler = (method, path, url) => {
      if (path === "/api/book/intro") return json(LINK);
      if (!isDayRequest(url)) return slotsAnswer(url);
      throw new TypeError("Failed to fetch");
    };
    renderPage();
    await pickFirstDay();
    const notice = await screen.findByTestId("api-error");
    expect(notice).toHaveAttribute("data-error-kind", "lost");
    expect(screen.getByTestId("api-error-retry")).toBeInTheDocument();
    expect(screen.queryByText(/no time available|no available times/i)).not.toBeInTheDocument();
  });

  it("AC-4 / AC-5: a slot listing answered after 20 s shows 'still working' after 8 s, never 'no time available', then the real slots", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    handler = (method, path, url) => {
      if (path === "/api/book/intro") return json(LINK);
      if (!isDayRequest(url)) return slotsAnswer(url);
      return new Promise((r) => setTimeout(() => r(slotsAnswer(url)), 20_000));
    };
    renderPage();
    await pickFirstDay();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(7_000);
    });
    expect(screen.queryByTestId("still-working")).not.toBeInTheDocument();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_000);
    });
    expect(screen.getByTestId("still-working")).toBeInTheDocument();
    expect(screen.queryByText(/no time available|no available times/i)).not.toBeInTheDocument();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(12_000);
    });
    expect(await screen.findByRole("button", { name: /\d{1,2}:\d{2}/ })).toBeInTheDocument();
    expect(screen.queryByTestId("still-working")).not.toBeInTheDocument();
  });

  // Amended by PAC-82 AC-26 (spec docs/specs/PAC-82.md, PAC-83 §3.5): the one
  // control that re-sends is "Try again" (the same attempt, same key); nothing
  // else re-sends, and nothing re-sends without the press.
  it("AC-21 / AC-25 (amended by PAC-82 AC-26): a booking whose answer is lost is sent once, says it may have been saved, keeps the details, re-reads the day, offers only the one Try again", async () => {
    serveBooking(() => {
      throw new TypeError("Failed to fetch");
    });
    renderPage();
    await pickFirstDay();
    await fillAndSubmit();
    const notice = await screen.findByTestId("api-error");
    expect(notice).toHaveAttribute("data-effect", "booking");
    expect(notice).toHaveTextContent(API_MESSAGES.lostBooking);
    expect(within(notice).queryByRole("button")).not.toBeInTheDocument();
    expect(screen.queryByText(/you are confirmed/i)).not.toBeInTheDocument();
    // §3.5 as amended by PAC-82: the booker is back on the refreshed list,
    // told which time they had chosen; the one re-send control is Try again.
    expect(screen.queryByRole("button", { name: /confirm booking/i })).not.toBeInTheDocument();
    expect(screen.getAllByTestId("booking-try-again")).toHaveLength(1);
    expect(screen.getByTestId("unconfirmed-booking-time")).toHaveTextContent(/you had chosen/i);
    expect(calls("POST", "/api/book/intro")).toBe(1);
    await vi.waitFor(() => expect(dayCalls()).toBe(2));
    // Re-picking keeps the typed details.
    fireEvent.click(await screen.findByRole("button", { name: /\d{1,2}:\d{2}/ }));
    expect(screen.getByLabelText("Name", { exact: true })).toHaveValue("Booker");
    expect(screen.getByLabelText("Email", { exact: true })).toHaveValue("booker@co.com");
    expect(screen.getByLabelText(/notes/i)).toHaveValue("Agenda");
    expect(calls("POST", "/api/book/intro")).toBe(1);
    window.dispatchEvent(new Event("online"));
    window.dispatchEvent(new Event("focus"));
    await new Promise((r) => setTimeout(r, 50));
    expect(calls("POST", "/api/book/intro")).toBe(1);
  });

  it("AC-21: a booking with no answer within the client bound says it may have been saved", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    serveBooking(() => new Promise<Response>(() => {}));
    renderPage();
    await pickFirstDay();
    await fillAndSubmit();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(9_000);
    });
    expect(screen.getByTestId("still-working")).toBeInTheDocument();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(122_000);
    });
    expect(screen.queryByTestId("api-error")).not.toBeInTheDocument(); // still waiting at 131 s
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5_000);
    });
    expect(await screen.findByTestId("api-error")).toHaveTextContent(API_MESSAGES.lostBooking);
    expect(calls("POST", "/api/book/intro")).toBe(1);
  });

  it.each([
    ["a generic 500", () => json({ error: "internal error" }, 500)],
    ["nginx's HTML 502", () => html(502)],
    ["nginx's HTML 504", () => html(504)],
    ["a proxy's HTML 503", () => html(503)],
    ["Cloudflare's HTML 524", () => html(524)],
    ["a non-budget JSON 503 (AC-22b)", () => json({ error: "service unavailable" }, 503)],
    ["a proxy's JSON 502 (AC-22b)", () => json({ message: "An invalid response was received from the upstream server" }, 502)],
    ["a proxy's JSON 504 (AC-22b)", () => json({ message: "upstream timed out" }, 504)],
  ])("AC-22: %s says the booking may have been saved, never 'not made'", async (_label, answer) => {
    serveBooking(answer);
    renderPage();
    await pickFirstDay();
    await fillAndSubmit();
    const notice = await screen.findByTestId("api-error");
    expect(notice).toHaveTextContent(API_MESSAGES.lostBooking);
    expect(screen.queryByText(/was not made/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/<html|bad gateway/i)).not.toBeInTheDocument();
    expect(calls("POST", "/api/book/intro")).toBe(1);
  });

  it("AC-23: the budget 503 says the booking was not made; one request until the booker presses Book again", async () => {
    serveBooking(() => json({ error: "request timed out" }, 503));
    renderPage();
    await pickFirstDay();
    await fillAndSubmit();
    const notice = await screen.findByTestId("api-error");
    expect(notice).toHaveAttribute("data-error-kind", "budget");
    expect(notice).toHaveTextContent(API_MESSAGES.budgetBooking);
    expect(calls("POST", "/api/book/intro")).toBe(1);
    await new Promise((r) => setTimeout(r, 50));
    expect(calls("POST", "/api/book/intro")).toBe(1);
    fireEvent.click(screen.getByRole("button", { name: /confirm booking/i }));
    await vi.waitFor(() => expect(calls("POST", "/api/book/intro")).toBe(2));
  });
});
