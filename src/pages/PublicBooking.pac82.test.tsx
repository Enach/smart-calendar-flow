/**
 * PAC-82 on the public booking page (spec docs/specs/PAC-82.md in the api
 * repo): AC-25 (a fresh Idempotency-Key per attempt), AC-26 (one "Try again"
 * that re-sends the same attempt, nothing re-sent without the press), AC-27
 * as amended by the orchestrator's C-8 decision (what each answer to
 * "Try again" shows). The fake server sits at fetch, so keys, bodies and
 * request counts are read on the wire.
 */
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { findTimeButtons, pickFirstSelectableDay } from "@/test/bookingPage";
import PublicBooking from "./PublicBooking";
import { API_MESSAGES } from "@/api/client";
import { newBookingAttemptKey } from "@/api/schedulingLinks";
import { addDaysToKey, dateKeyInZone } from "@/lib/timeZone";

const fetchMock = vi.fn<typeof fetch>();
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const html = (status: number) => new Response("<html><body>502 Bad Gateway</body></html>", { status, headers: { "content-type": "text/html" } });

const LINK = { slug: "intro", title: "Intro call", durations: [30, 60], hosts: [{ email: "host@co.com", name: "Host" }], min_notice_minutes: 0, usage_type: "reusable" };
const SLOTS = [
  { start: "2030-03-04T09:00:00Z", end: "2030-03-04T09:30:00Z" },
  { start: "2030-03-04T10:00:00Z", end: "2030-03-04T10:30:00Z" },
];
const CONFIRMED = {
  id: "7d2c6a3e-1b4f-4c55-9a0e-3f1d2b6c8e90", link_slug: "intro", title: "Intro call",
  start: SLOTS[0]!.start, end: SLOTS[0]!.end, duration_minutes: 30,
  hosts: [{ email: "host@co.com", name: "Host" }], booker_name: "Booker", booker_email: "booker@co.com", notes: "Agenda",
};
const KEY_REUSED = { error: "idempotency key already used" };
const KEY_FORMAT = /^[A-Za-z0-9_-]{16,255}$/;

type Sent = { key: string | null; body: string };
let sent: Sent[];
let answers: Array<() => Promise<Response> | Response>;

function slotsAnswer(url: URL) {
  const zone = url.searchParams.get("display_time_zone") ?? "UTC";
  const date = url.searchParams.get("date");
  const from = date ?? url.searchParams.get("from")!;
  const to = date ?? url.searchParams.get("to")!;
  const base = { time_zone: "UTC", display_time_zone: zone, range_from: from, range_to: to };
  if (date) {
    const d = Number(url.searchParams.get("duration") ?? "30");
    return json({ ...base, slots: SLOTS.map((s) => ({ start: s.start, end: new Date(new Date(s.start).getTime() + d * 60_000).toISOString().replace(".000", "") })), available_dates: [] });
  }
  const today = dateKeyInZone(Date.now(), zone);
  const days: string[] = [];
  for (let d = from; d <= to; d = addDaysToKey(d, 1)) if (d > today) days.push(d);
  return json({ ...base, slots: [], available_dates: days });
}

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

async function fill(slot = 0, details: { name?: string; email?: string; notes?: string } = {}) {
  fireEvent.click((await findTimeButtons())[slot]!);
  fireEvent.change(screen.getByLabelText("Name", { exact: true }), { target: { value: details.name ?? "Booker" } });
  fireEvent.change(screen.getByLabelText("Email", { exact: true }), { target: { value: details.email ?? "booker@co.com" } });
  fireEvent.change(screen.getByLabelText(/notes/i), { target: { value: details.notes ?? "Agenda" } });
}

function submit() {
  fireEvent.click(screen.getByRole("button", { name: /confirm booking/i }));
}

const lost = () => {
  throw new TypeError("Failed to fetch");
};

/** The first send is lost; the page then shows the notice and Try again. */
async function loseFirstSend() {
  renderPage();
  await pickFirstSelectableDay();
  await fill();
  submit();
  return screen.findByTestId("booking-try-again");
}

describe("PAC-82 public booking: idempotent retry", () => {
  beforeEach(() => {
    sent = [];
    answers = [];
    fetchMock.mockReset();
    fetchMock.mockImplementation(async (u, init) => {
      const url = new URL(String(u), window.location.origin);
      const method = (init?.method ?? "GET").toUpperCase();
      if (method === "GET" && url.pathname === "/api/book/intro") return json(LINK);
      if (method === "GET" && url.pathname === "/api/book/intro/slots") return slotsAnswer(url);
      if (method === "POST" && url.pathname === "/api/book/intro") {
        const headers = new Headers(init?.headers);
        sent.push({ key: headers.get("Idempotency-Key"), body: String(init?.body) });
        const next = answers.shift();
        if (!next) throw new Error("unexpected booking request");
        return next();
      }
      return json({ error: "not here" }, 404);
    });
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => {
    vi.useRealTimers();
  });
  afterAll(() => {
    vi.unstubAllGlobals();
  });

  it("the key generator makes contract-valid, distinct keys", () => {
    const keys = new Set(Array.from({ length: 200 }, () => newBookingAttemptKey()));
    expect(keys.size).toBe(200);
    for (const k of keys) expect(k).toMatch(KEY_FORMAT);
  });

  // PAC-113: one booking pair per change, not six bookings in one test, so no
  // single test carries six full render-and-refuse round trips.
  it.each<[string, { slot?: number; duration?: RegExp; name?: string; email?: string; notes?: string }]>([
    ["the time", { slot: 1 }],
    ["the duration", { duration: /60 min/i }],
    ["the name", { name: "Other" }],
    ["the email", { email: "other@co.com" }],
    ["the notes", { notes: "Other agenda" }],
  ])("AC-25: each press of Book sends a fresh key; changing %s sends a different one", async (_label, change) => {
    const refuse = () => json({ error: "slot is no longer available" }, 409);
    renderPage();
    await pickFirstSelectableDay();
    answers.push(refuse);
    await fill(0);
    submit();
    await screen.findByText(/slot is no longer available/i);
    if (change.duration) fireEvent.click(screen.getByRole("button", { name: change.duration }));
    answers.push(refuse);
    await fill(change.slot ?? 0, change);
    submit();
    await vi.waitFor(() => expect(sent).toHaveLength(2));
    const keys = sent.map((s) => s.key);
    for (const k of keys) expect(k).toMatch(KEY_FORMAT);
    expect(new Set(keys).size).toBe(2);
    expect(new Set(sent.map((s) => s.body)).size).toBe(2);
  });

  it("AC-26: a lost answer shows 'may have been saved' and one Try again; nothing re-sends until it is pressed; pressing sends the same key and body once", async () => {
    answers.push(lost);
    const retry = await loseFirstSend();
    expect(screen.getAllByTestId("booking-try-again")).toHaveLength(1);
    expect(screen.getByTestId("api-error")).toHaveTextContent(API_MESSAGES.lostBooking);
    expect(sent).toHaveLength(1);
    window.dispatchEvent(new Event("online"));
    window.dispatchEvent(new Event("focus"));
    await new Promise((r) => setTimeout(r, 50));
    expect(sent).toHaveLength(1);

    answers.push(() => json(CONFIRMED, 201));
    fireEvent.click(retry);
    expect(await screen.findByText(/you are confirmed/i)).toBeInTheDocument();
    expect(sent).toHaveLength(2);
    expect(sent[1]!.key).toBe(sent[0]!.key);
    expect(sent[1]!.body).toBe(sent[0]!.body);
  });

  it.each([
    ["a generic 500", () => json({ error: "internal error" }, 500)],
    ["nginx's HTML 502", () => html(502)],
    ["a non-JSON 200", () => new Response("<html></html>", { status: 200, headers: { "content-type": "text/html" } })],
  ])("AC-26: %s on the first send offers Try again", async (_label, answer) => {
    answers.push(answer);
    await loseFirstSend();
    expect(screen.getByTestId("api-error")).toHaveTextContent(API_MESSAGES.lostBooking);
    expect(sent).toHaveLength(1);
  });

  it("AC-26: no answer within the client bound offers Try again", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    answers.push(() => new Promise<Response>(() => {}));
    renderPage();
    await pickFirstSelectableDay();
    await fill();
    submit();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(136_000);
    });
    expect(await screen.findByTestId("booking-try-again")).toBeInTheDocument();
    expect(sent).toHaveLength(1);
  });

  it("AC-26: the first send's budget 503 still says 'not made' and offers no Try again", async () => {
    answers.push(() => json({ error: "request timed out" }, 503));
    renderPage();
    await pickFirstSelectableDay();
    await fill();
    submit();
    const notice = await screen.findByTestId("api-error");
    expect(notice).toHaveTextContent(API_MESSAGES.budgetBooking);
    expect(screen.queryByTestId("booking-try-again")).not.toBeInTheDocument();
  });

  it.each([
    ["a slot 409 (generic)", () => json({ error: "slot is no longer available" }, 409)],
    ["a slot 409 (specific)", () => json({ error: "slot is already booked", reason: "taken" }, 409)],
    ["a 410", () => json({ error: "link is no longer accepting bookings" }, 410)],
  ])("AC-27 (C-8): Try again answered by %s never says the earlier attempt was not saved", async (_label, answer) => {
    answers.push(lost);
    const retry = await loseFirstSend();
    answers.push(answer);
    fireEvent.click(retry);
    expect(await screen.findByText(API_MESSAGES.retryRefusedBooking)).toBeInTheDocument();
    expect(screen.queryByText(/was not saved|not made/i)).not.toBeInTheDocument();
    expect(screen.queryByTestId("booking-try-again")).not.toBeInTheDocument();
    expect(sent).toHaveLength(2);
  });

  it.each([
    ["the key-reused 409", () => json(KEY_REUSED, 409)],
    ["a 404", () => json({ error: "not found" }, 404)],
  ])("AC-27: Try again answered by %s says it may have been saved and offers no further retry", async (_label, answer) => {
    answers.push(lost);
    const retry = await loseFirstSend();
    answers.push(answer);
    fireEvent.click(retry);
    await vi.waitFor(() => expect(screen.queryByTestId("booking-try-again")).not.toBeInTheDocument());
    expect(screen.getByTestId("api-error")).toHaveTextContent(API_MESSAGES.lostBooking);
    expect(screen.queryByText(/idempotency key/i)).not.toBeInTheDocument();
    expect(screen.queryByText(API_MESSAGES.retryRefusedBooking)).not.toBeInTheDocument();
  });

  it.each([
    ["lost again", lost],
    ["a 500", () => json({ error: "internal error" }, 500)],
    ["the budget 503", () => json({ error: "request timed out" }, 503)],
    ["a 429", () => json({ error: "rate limit exceeded" }, 429)],
    ["a 400", () => json({ error: "invalid duration" }, 400)],
  ])("AC-27: Try again answered by %s keeps 'may have been saved' and Try again", async (_label, answer) => {
    answers.push(lost);
    const retry = await loseFirstSend();
    answers.push(answer);
    fireEvent.click(retry);
    await vi.waitFor(() => expect(sent).toHaveLength(2));
    const again = await screen.findByTestId("booking-try-again");
    await vi.waitFor(() => expect(again).not.toBeDisabled());
    expect(screen.getByTestId("api-error")).toHaveTextContent(API_MESSAGES.lostBooking);
    expect(screen.queryByText(/was not made/i)).not.toBeInTheDocument();
    // The next press is still the same attempt.
    answers.push(() => json(CONFIRMED, 201));
    fireEvent.click(again);
    expect(await screen.findByText(/you are confirmed/i)).toBeInTheDocument();
    expect(new Set(sent.map((s) => s.key)).size).toBe(1);
    expect(new Set(sent.map((s) => s.body)).size).toBe(1);
  });

  it("AC-25: picking another time after a lost answer drops Try again; the next Book is a new attempt", async () => {
    answers.push(lost);
    await loseFirstSend();
    answers.push(() => json(CONFIRMED, 201));
    await fill(1);
    expect(screen.queryByTestId("booking-try-again")).not.toBeInTheDocument();
    submit();
    expect(await screen.findByText(/you are confirmed/i)).toBeInTheDocument();
    expect(sent[1]!.key).not.toBe(sent[0]!.key);
  });
});
