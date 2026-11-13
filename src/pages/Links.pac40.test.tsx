import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";

vi.mock("@/components/Navbar", () => ({ Navbar: () => null }));

import LinksPage from "./Links";
import { toast } from "@/hooks/useToast";
import { LINK_ID, POLICY_A, POLICY_B, jsonResponse, requestPath } from "@/test/pac40Fixtures";

// PAC-40 part A, web, on the Links page: the delete confirmation is built from
// the server's BookerErasurePolicy (contract section 2.4) and never promises
// erasure unless it says enabled; a deleted link leaves the list; a 404 from a
// link deleted elsewhere refreshes the list.

const fetchMock = vi.fn<typeof fetch>();

const LIVE = {
  id: LINK_ID,
  owner_id: "u1",
  slug: "intro-call",
  title: "Intro call",
  duration_options: [30],
  days_of_week: [1, 2, 3],
  window_start_time: "09:00",
  window_end_time: "17:00",
  buffer_before: 0,
  buffer_after: 0,
  min_notice_minutes: 0,
  usage_type: "reusable",
  uses_count: 1,
  active: true,
  hosts: [{ user_id: "u1", email: "owner@co.com", is_owner: true, status: "accepted" }],
  created_at: "2026-01-01T00:00:00Z",
  is_owner: true,
};

type Archive = { status: number; body: unknown } | "unreachable";

function server({ archive, deleteStatus = 204 }: { archive: Archive; deleteStatus?: number }) {
  let deleted = false;
  fetchMock.mockImplementation(async (input, init) => {
    const path = requestPath(input);
    const method = init?.method ?? "GET";
    if (path === "/api/scheduling-links/archive") {
      if (archive === "unreachable") throw new TypeError("Failed to fetch");
      return jsonResponse(archive.body, archive.status);
    }
    if (path === "/api/scheduling-links/" && method === "GET") {
      return jsonResponse({ owned: deleted ? [] : [LIVE], shared: [] });
    }
    if (path === "/api/scheduling-links/host-invites") return jsonResponse([]);
    if (path === "/api/auth/me") return jsonResponse({ id: "u1", email: "owner@co.com", name: "Owner" });
    if (path === `/api/scheduling-links/${LINK_ID}` && method === "DELETE") {
      deleted = true;
      return deleteStatus === 204 ? new Response(null, { status: 204 }) : jsonResponse({ error: "not found" }, deleteStatus);
    }
    if (path === `/api/scheduling-links/${LINK_ID}` && method === "GET") return jsonResponse({ error: "not found" }, 404);
    return jsonResponse({ error: "unexpected" }, 500);
  });
}

function renderPage() {
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter initialEntries={["/app/links"]}>
        <LinksPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

async function openDelete() {
  const row = await screen.findByTestId("link-row-intro-call");
  fireEvent.click(within(row).getByRole("button", { name: "Delete Intro call" }));
  return screen.findByTestId("link-delete-dialog");
}

const archivedCalls = () => fetchMock.mock.calls.filter(([i]) => requestPath(i) === "/api/scheduling-links/archive").length;

describe("PAC-40 Links page", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => vi.restoreAllMocks());
  afterAll(() => vi.unstubAllGlobals());

  it("offers the archive from the Links page", async () => {
    server({ archive: { status: 200, body: { links: [], booker_erasure: POLICY_A } } });
    renderPage();
    expect(await screen.findByTestId("links-archive-link")).toHaveAttribute("href", "/app/links/archive");
  });

  it("part A (enabled=false): the confirmation names the archive and promises no erasure", async () => {
    server({ archive: { status: 200, body: { links: [], booker_erasure: POLICY_A } } });
    renderPage();
    await waitFor(() => expect(archivedCalls()).toBeGreaterThan(0));
    const dialog = await openDelete();
    expect(within(dialog).getByTestId("link-delete-copy")).toHaveTextContent(
      "People with this link will no longer be able to book. The link and its bookings move to your archive",
    );
    expect(within(dialog).queryByTestId("link-delete-erasure")).not.toBeInTheDocument();
    expect(within(dialog).queryByText(/erase/i)).not.toBeInTheDocument();
  });

  it("enabled=true: the confirmation quotes the server's retention_days", async () => {
    server({ archive: { status: 200, body: { links: [], booker_erasure: POLICY_B } } });
    renderPage();
    await waitFor(() => expect(archivedCalls()).toBeGreaterThan(0));
    const dialog = await openDelete();
    await waitFor(() =>
      expect(within(dialog).getByTestId("link-delete-erasure")).toHaveTextContent(
        "Bookers’ names and emails are erased 90 days after the link’s last booking.",
      ),
    );
  });

  it.each<[string, Archive]>([
    ["an older server's 400", { status: 400, body: { error: "invalid id" } }],
    ["a body that fails the schema (K4-7)", { status: 200, body: { links: [], booker_erasure: { ...POLICY_B, extra: true } } }],
    ["an unreachable archive", "unreachable"],
  ])("policy not loaded (%s): no erasure promise", async (_name, archive) => {
    server({ archive });
    renderPage();
    await waitFor(() => expect(archivedCalls()).toBeGreaterThan(0));
    const dialog = await openDelete();
    expect(within(dialog).getByTestId("link-delete-copy")).toBeInTheDocument();
    expect(within(dialog).queryByTestId("link-delete-erasure")).not.toBeInTheDocument();
  });

  it("cancel deletes nothing", async () => {
    server({ archive: { status: 200, body: { links: [], booker_erasure: POLICY_A } } });
    renderPage();
    const dialog = await openDelete();
    fireEvent.click(within(dialog).getByTestId("link-delete-cancel"));
    await waitFor(() => expect(screen.queryByTestId("link-delete-dialog")).not.toBeInTheDocument());
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === "DELETE")).toBe(false);
    expect(screen.getByTestId("link-row-intro-call")).toBeInTheDocument();
  });

  it("confirming deletes the link, it leaves the list, and the archive is read again", async () => {
    server({ archive: { status: 200, body: { links: [], booker_erasure: POLICY_A } } });
    const info = vi.spyOn(toast, "info");
    renderPage();
    await waitFor(() => expect(archivedCalls()).toBe(1));
    const dialog = await openDelete();
    fireEvent.click(within(dialog).getByTestId("link-delete-confirm"));
    await waitFor(() => expect(screen.queryByTestId("link-row-intro-call")).not.toBeInTheDocument());
    expect(fetchMock.mock.calls.filter(([, init]) => init?.method === "DELETE").map(([i]) => requestPath(i))).toEqual([
      `/api/scheduling-links/${LINK_ID}`,
    ]);
    expect(info).toHaveBeenCalledWith("Link deleted. It is in your archive.");
    await waitFor(() => expect(archivedCalls()).toBe(2));
  });

  it("404 on delete (deleted elsewhere): says the link no longer exists and refreshes the list", async () => {
    server({ archive: { status: 200, body: { links: [], booker_erasure: POLICY_A } }, deleteStatus: 404 });
    const info = vi.spyOn(toast, "info");
    const error = vi.spyOn(toast, "error");
    renderPage();
    const dialog = await openDelete();
    fireEvent.click(within(dialog).getByTestId("link-delete-confirm"));
    await waitFor(() => expect(info).toHaveBeenCalledWith("This link no longer exists. The list has been refreshed."));
    expect(error).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByTestId("link-row-intro-call")).not.toBeInTheDocument());
  });

  it("404 on pause (deleted elsewhere): same message and refresh, not a raw 'not found'", async () => {
    server({ archive: { status: 200, body: { links: [], booker_erasure: POLICY_A } } });
    const info = vi.spyOn(toast, "info");
    renderPage();
    const row = await screen.findByTestId("link-row-intro-call");
    fireEvent.click(within(row).getByRole("switch", { name: "Intro call active" }));
    await waitFor(() => expect(info).toHaveBeenCalledWith("This link no longer exists. The list has been refreshed."));
  });
});
