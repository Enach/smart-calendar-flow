/**
 * PAC-92 (PAC-83 contract §5.1): a failed slot search in the "Schedule
 * meeting" modal is shown as an API error surface — `data-testid="api-error"`
 * with the failure's kind and effect — so the e2e `assertNotDemo` guard can
 * see it, and it never offers invented slots. The form's own validation is
 * not an API failure and stays untagged.
 */
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

vi.mock("@/contexts/useAuth", () => ({ useAuth: () => ({ isDemo: false }) }));

import { ScheduleSuggestModal } from "./ScheduleSuggestModal";
import { API_MESSAGES } from "@/api/client";

const fetchMock = vi.fn<typeof fetch>();

function renderModal() {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <ScheduleSuggestModal
        defaultRangeStart="2026-11-19T08:00:00Z"
        defaultRangeEnd="2026-11-19T18:00:00Z"
        onClose={() => {}}
      />
    </QueryClientProvider>,
  );
}

/** Ask for slots with a suggest call that fails as `answer` says. */
async function searchFailing(answer: () => Promise<Response>) {
  fetchMock.mockImplementation(async (u) => {
    const path = new URL(String(u), window.location.origin).pathname;
    if (path === "/api/schedule/suggest") return answer();
    return new Response("{}", { status: 200, headers: { "content-type": "application/json" } });
  });
  renderModal();
  fireEvent.change(screen.getByLabelText("Title"), { target: { value: "Sync" } });
  fireEvent.click(screen.getByRole("button", { name: /find slots/i }));
  return waitFor(() => screen.getByTestId("api-error"));
}

const budget503 = async () =>
  new Response(JSON.stringify({ error: "request timed out" }), { status: 503, headers: { "content-type": "application/json" } });
const server500 = async () =>
  new Response(JSON.stringify({ error: "internal error" }), { status: 500, headers: { "content-type": "application/json" } });

describe("PAC-92: the suggest failure in the Schedule meeting modal", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterAll(() => vi.unstubAllGlobals());

  it("an unreachable server: tagged lost, on a read, with no slot offered", async () => {
    const notice = await searchFailing(() => Promise.reject(new TypeError("Failed to fetch")));
    expect(notice).toHaveAttribute("data-error-kind", "lost");
    expect(notice).toHaveAttribute("data-effect", "read");
    expect(notice).toHaveTextContent(API_MESSAGES.lostRead);
    expect(notice.textContent ?? "").not.toMatch(/preview data|demo data/i);
    expect(screen.queryByRole("button", { name: /refresh suggestions/i })).toBeNull();
    expect(screen.getByRole("button", { name: /apply slot/i })).toBeDisabled();
  });

  it("the budget 503: tagged budget, on a read", async () => {
    const notice = await searchFailing(budget503);
    expect(notice).toHaveAttribute("data-error-kind", "budget");
    expect(notice).toHaveAttribute("data-effect", "read");
    expect(notice).toHaveTextContent(API_MESSAGES.budgetRead);
  });

  it("a 500: tagged http, on a read, and the server's own words are shown", async () => {
    const notice = await searchFailing(server500);
    expect(notice).toHaveAttribute("data-error-kind", "http");
    expect(notice).toHaveAttribute("data-effect", "read");
    expect(notice).toHaveTextContent("internal error");
  });

  it("a new search clears the previous failure", async () => {
    await searchFailing(server500);
    fetchMock.mockImplementation(async () =>
      new Response(JSON.stringify({ slots: [] }), { status: 200, headers: { "content-type": "application/json" } }),
    );
    fireEvent.click(screen.getByRole("button", { name: /find slots/i }));
    await waitFor(() => expect(screen.queryByTestId("api-error")).toBeNull());
  });

  it("the form's own validation is not an API failure", () => {
    renderModal();
    fireEvent.click(screen.getByRole("button", { name: /find slots/i }));
    expect(screen.getByText("Add a meeting title.")).toBeInTheDocument();
    expect(screen.queryByTestId("api-error")).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
