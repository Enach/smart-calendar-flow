import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { LinkEditDrawer } from "./LinkEditDrawer";
import { API_MESSAGES, ApiGatewayError, ApiHttpError, ApiUnreachableError, api } from "@/api/client";
import { clearFreebusyCache } from "@/api/coverageCache";
import { publicBookingUrl, schedulingLinkKeys, schedulingLinksApi, type SchedulingLinkSaveResult } from "@/api/schedulingLinks";
import type { SchedulingHost, SchedulingLink } from "@/api/types";
import { toast } from "@/hooks/useToast";
import { LINK_CREATE_TEXT } from "./linkCreateRetry";

// PAC-119 (contract §7.2-§7.4): the link editor's attempt key, its answers to
// a failed create, and no close while a save is pending, at the [unit] layer:
// what the editor sends, shows and invalidates, against a mocked API.

const L = "7b0e7c1e-4a49-4d7e-9a43-2f4e0a6b5c11";
const KEY_FORMAT = /^[A-Za-z0-9_-]{16,255}$/;
const OWNER: SchedulingHost = { user_id: "u1", email: "owner@co.com", is_owner: true, status: "accepted" };
const host = (email: string, status: SchedulingHost["status"] = "accepted"): SchedulingHost => ({
  user_id: `u_${email}`, email, is_owner: false, status,
});

function makeLink(hosts: SchedulingHost[], id = L, slug = "earlier-intro"): SchedulingLink {
  return {
    id, owner_id: "u1", title: "Intro", slug, durations: [30], days: ["mon", "tue"],
    window_start: "09:00", window_end: "17:00", buffer_before: 0, buffer_after: 0, min_notice_minutes: 0,
    usage_type: "reusable", uses_count: 0, active: true, hosts: [OWNER, ...hosts],
    created_at: "2026-01-01T00:00:00Z", is_owner: true, booking_horizon_days: 60, refusal_message: "generic",
    time_zone: "Europe/Paris",
  };
}
const saved = (link: SchedulingLink): SchedulingLinkSaveResult => ({ link, co_host_changes: undefined, co_host_list_sent: false });

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const LOST = () => new ApiUnreachableError("network");
const BUDGET = () => new ApiHttpError(503, { error: "request timed out" });
const USED = () => new ApiHttpError(409, { error: "idempotency key already used", link_id: L });
const EXPIRED = () => new ApiHttpError(409, { error: "idempotency key expired", link_id: L });
const DELETED = () => new ApiHttpError(409, { error: "idempotency key already used by a deleted link" });

/** A drawer whose `open` the test drives, as Links.tsx does (the component stays mounted). */
function renderDrawer(link: SchedulingLink | null = null) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const invalidate = vi.spyOn(client, "invalidateQueries");
  const onOpenChange = vi.fn();
  const tree = (open: boolean, l: SchedulingLink | null = link) => (
    <QueryClientProvider client={client}>
      <LinkEditDrawer open={open} onOpenChange={onOpenChange} link={l} />
    </QueryClientProvider>
  );
  const view = render(tree(true));
  const listInvalidations = () =>
    invalidate.mock.calls.filter(([f]) => JSON.stringify(f?.queryKey) === JSON.stringify(schedulingLinkKeys.links)).length;
  return {
    client, onOpenChange, view, listInvalidations,
    close: () => view.rerender(tree(false)),
    reopen: (l: SchedulingLink | null = link) => view.rerender(tree(true, l)),
  };
}

const emailInput = () => screen.getByLabelText("Co-host email") as HTMLInputElement;
function addCoHost(email: string) {
  fireEvent.change(emailInput(), { target: { value: email } });
  fireEvent.click(screen.getByRole("button", { name: /^add$/i }));
}
const removeChip = (email: string) => fireEvent.click(screen.getByRole("button", { name: `Remove ${email}` }));
const chipEmails = () =>
  screen.queryAllByRole("button", { name: /^Remove / }).map((b) => (b.getAttribute("aria-label") ?? "").replace(/^Remove /, ""));
const setTitle = (v: string) => fireEvent.change(screen.getByLabelText("Title"), { target: { value: v } });
const pressCreate = () => fireEvent.click(screen.getByRole("button", { name: /create link/i }));
const pressSave = () => fireEvent.click(screen.getByRole("button", { name: /save changes/i }));
const alertText = () => screen.queryByRole("alert")?.textContent ?? null;
const heading = () => screen.getByRole("heading", { level: 2 }).textContent;

let createLink: ReturnType<typeof vi.spyOn>;
let getLink: ReturnType<typeof vi.spyOn>;
let updateLink: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  clearFreebusyCache();
  vi.spyOn(api, "freebusy").mockImplementation(async (input) => ({
    start_time: input.start_time, end_time: input.end_time,
    participants: input.emails.map((email) => ({ email, status: "unknown" as const, busy: [] })),
  }));
  vi.spyOn(toast, "success");
  vi.spyOn(toast, "error");
  createLink = vi.spyOn(schedulingLinksApi, "createLink");
  getLink = vi.spyOn(schedulingLinksApi, "getLink");
  updateLink = vi.spyOn(schedulingLinksApi, "updateLink");
});
afterEach(() => vi.restoreAllMocks());

const keyOf = (call: number) => createLink.mock.calls[call][1] as string | undefined;
const bodyOf = (call: number) => createLink.mock.calls[call][0];

describe("the attempt key (contract §7.2)", () => {
  it.each([
    ["a lost answer", LOST],
    ["a gateway error", () => new ApiGatewayError(504)],
    ["the budget 503", BUDGET],
    ["a 500", () => new ApiHttpError(500, { error: "internal error" })],
    ["a 422", () => new ApiHttpError(422, { error: "title is required" })],
    ["the slug 409", () => new ApiHttpError(409, { error: "slug already exists" })],
  ])("AC-16: after %s, the next press re-sends the same key and the same body", async (_label, failure) => {
    createLink.mockRejectedValueOnce(failure()).mockResolvedValueOnce(saved(makeLink([], "new", "intro")));
    renderDrawer();
    setTitle("Intro");
    pressCreate();
    await waitFor(() => expect(alertText()).not.toBeNull());
    pressCreate();
    await waitFor(() => expect(createLink).toHaveBeenCalledTimes(2));
    expect(keyOf(0)).toMatch(KEY_FORMAT);
    expect(keyOf(1)).toBe(keyOf(0));
    expect(bodyOf(1)).toEqual(bodyOf(0));
  });

  it("the slug 409 keeps today's message (the server's text) and the key", async () => {
    createLink.mockRejectedValue(new ApiHttpError(409, { error: "slug already exists" }));
    renderDrawer();
    setTitle("Intro");
    pressCreate();
    await waitFor(() => expect(alertText()).toBe("slug already exists"));
    expect(heading()).toBe("New scheduling link");
  });

  it("no key is made before the first press, and a local validation refusal sends nothing", async () => {
    renderDrawer();
    expect(createLink).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "30 min" })); // no duration left
    setTitle("Intro");
    expect(screen.getByRole("button", { name: /create link/i })).toBeDisabled();
    expect(createLink).not.toHaveBeenCalled();
  });

  it("AC-17: closing after a lost answer and opening a new-link editor again makes a different key", async () => {
    createLink.mockRejectedValueOnce(LOST()).mockResolvedValue(saved(makeLink([], "new", "intro")));
    const d = renderDrawer();
    setTitle("Intro");
    pressCreate();
    await waitFor(() => expect(alertText()).toBe(LINK_CREATE_TEXT.outcomeUnknown));
    d.close();
    d.reopen();
    // The reopened editor is blank: a deliberate new create.
    expect((screen.getByLabelText("Title") as HTMLInputElement).value).toBe("");
    setTitle("Intro");
    pressCreate();
    await waitFor(() => expect(createLink).toHaveBeenCalledTimes(2));
    expect(keyOf(1)).toMatch(KEY_FORMAT);
    expect(keyOf(1)).not.toBe(keyOf(0));
  });

  it("AC-17: two successful creates in two editor sessions carry different keys", async () => {
    createLink.mockResolvedValue(saved(makeLink([], "new", "intro")));
    const d = renderDrawer();
    setTitle("One");
    pressCreate();
    await waitFor(() => expect(d.onOpenChange).toHaveBeenCalledWith(false));
    d.close();
    d.reopen();
    setTitle("Two");
    pressCreate();
    await waitFor(() => expect(createLink).toHaveBeenCalledTimes(2));
    expect(keyOf(0)).toMatch(KEY_FORMAT);
    expect(keyOf(1)).toMatch(KEY_FORMAT);
    expect(keyOf(1)).not.toBe(keyOf(0));
  });

  it("AC-18: after a create that stays open, the next save is an edit and carries no key", async () => {
    createLink.mockResolvedValue({
      link: makeLink([], "new", "intro"),
      co_host_changes: { addresses: [{ email: "c@nowhere.io", outcome: "not_added" }], removed: [], invited_count: 0, removed_count: 0, not_added_count: 1 },
      co_host_list_sent: true,
    });
    getLink.mockResolvedValue(makeLink([], "new", "intro"));
    updateLink.mockResolvedValue(saved(makeLink([], "new", "intro")));
    renderDrawer();
    setTitle("Intro");
    addCoHost("c@nowhere.io");
    pressCreate();
    await waitFor(() => expect(getLink).toHaveBeenCalledWith("new"));
    setTitle("Renamed");
    pressSave();
    await waitFor(() => expect(updateLink).toHaveBeenCalledTimes(1));
    // updateLink takes (id, input) only: no key argument exists or is passed.
    expect(updateLink.mock.calls[0]).toHaveLength(2);
    expect(createLink).toHaveBeenCalledTimes(1);
  });

  it("AC-18: an edit of an existing link never carries a key", async () => {
    getLink.mockResolvedValue(makeLink([]));
    updateLink.mockRejectedValueOnce(LOST()).mockResolvedValue(saved(makeLink([])));
    renderDrawer(makeLink([]));
    await waitFor(() => expect(emailInput()).not.toBeDisabled());
    pressSave();
    await waitFor(() => expect(alertText()).toBe(API_MESSAGES.lostWrite));
    pressSave();
    await waitFor(() => expect(updateLink).toHaveBeenCalledTimes(2));
    for (const call of updateLink.mock.calls) expect(call).toHaveLength(2);
    expect(createLink).not.toHaveBeenCalled();
  });

  it("AC-23: the key lives in page memory only", async () => {
    const idbOpen = vi.fn();
    vi.stubGlobal("indexedDB", { open: idbOpen, deleteDatabase: vi.fn() });
    const setItem = vi.spyOn(Storage.prototype, "setItem");
    const pushState = vi.spyOn(window.history, "pushState");
    const replaceState = vi.spyOn(window.history, "replaceState");
    try {
      createLink.mockRejectedValue(LOST());
      renderDrawer();
      setTitle("Intro");
      pressCreate();
      await waitFor(() => expect(createLink).toHaveBeenCalledTimes(1));
      await waitFor(() => expect(alertText()).toBe(LINK_CREATE_TEXT.outcomeUnknown));
      const key = keyOf(0) as string;
      expect(key).toMatch(KEY_FORMAT);

      const stored = (s: Storage) => Array.from({ length: s.length }, (_, i) => `${s.key(i)}=${s.getItem(s.key(i) as string)}`).join("\n");
      expect(stored(localStorage)).not.toContain(key);
      expect(stored(sessionStorage)).not.toContain(key);
      for (const call of setItem.mock.calls) expect(String(call[1])).not.toContain(key);
      expect(idbOpen).not.toHaveBeenCalled();
      expect(document.cookie).not.toContain(key);
      expect(window.location.href).not.toContain(key);
      expect(JSON.stringify(window.history.state ?? null)).not.toContain(key);
      for (const call of [...pushState.mock.calls, ...replaceState.mock.calls]) expect(JSON.stringify(call)).not.toContain(key);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe("outcome unknown (contract §7.4, AC-19, AC-22)", () => {
  it.each([
    ["a lost answer", LOST],
    ["a gateway error", () => new ApiGatewayError(502)],
    ["the budget 503", BUDGET],
    ["a 500", () => new ApiHttpError(500, { error: "internal error" })],
  ])("AC-19: %s on a create says pressing again is safe, never 'refresh to check', and keeps the input", async (_label, failure) => {
    createLink.mockRejectedValue(failure());
    const d = renderDrawer();
    setTitle("Intro");
    pressCreate();
    await waitFor(() => expect(alertText()).toBe(LINK_CREATE_TEXT.outcomeUnknown));
    expect(alertText()).not.toMatch(/refresh to check/i);
    expect(toast.error).toHaveBeenCalledWith(LINK_CREATE_TEXT.outcomeUnknown);
    expect((screen.getByLabelText("Title") as HTMLInputElement).value).toBe("Intro");
    expect(heading()).toBe("New scheduling link");
    expect(d.onOpenChange).not.toHaveBeenCalled();
  });

  it("AC-19: the same failures on an edit keep PAC-83's texts", async () => {
    getLink.mockResolvedValue(makeLink([]));
    updateLink
      .mockRejectedValueOnce(LOST())
      .mockRejectedValueOnce(BUDGET())
      .mockRejectedValueOnce(new ApiHttpError(500, { error: "internal error" }));
    renderDrawer(makeLink([]));
    await waitFor(() => expect(emailInput()).not.toBeDisabled());
    pressSave();
    await waitFor(() => expect(alertText()).toBe(API_MESSAGES.lostWrite));
    pressSave();
    await waitFor(() => expect(alertText()).toBe(API_MESSAGES.budgetRead + API_MESSAGES.budgetWriteSuffix));
    pressSave();
    await waitFor(() => expect(alertText()).toBe("internal error"));
  });

  it("AC-22: closing after an unknown outcome invalidates the links list", async () => {
    createLink.mockRejectedValue(LOST());
    const d = renderDrawer();
    setTitle("Intro");
    pressCreate();
    await waitFor(() => expect(alertText()).toBe(LINK_CREATE_TEXT.outcomeUnknown));
    expect(d.listInvalidations()).toBe(0);
    d.close();
    expect(d.listInvalidations()).toBe(1);
    // Opening and closing again with nothing sent invalidates nothing more.
    d.reopen();
    d.close();
    expect(d.listInvalidations()).toBe(1);
  });

  it.each([
    ["a 422", () => new ApiHttpError(422, { error: "title is required" })],
    ["a 401", () => new ApiHttpError(401, { error: "unauthorized" })],
  ])("AC-22: an unknown outcome followed by %s still invalidates on close", async (_label, then) => {
    createLink.mockRejectedValueOnce(LOST()).mockRejectedValueOnce(then());
    const d = renderDrawer();
    setTitle("Intro");
    pressCreate();
    await waitFor(() => expect(alertText()).toBe(LINK_CREATE_TEXT.outcomeUnknown));
    pressCreate();
    await waitFor(() => expect(createLink).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(alertText()).not.toBe(LINK_CREATE_TEXT.outcomeUnknown));
    d.close();
    expect(d.listInvalidations()).toBe(1);
  });

  it("AC-22: an unknown outcome ended by the deleted refusal does not invalidate on close", async () => {
    createLink.mockRejectedValueOnce(LOST()).mockRejectedValueOnce(DELETED());
    const d = renderDrawer();
    setTitle("Intro");
    pressCreate();
    await waitFor(() => expect(alertText()).toBe(LINK_CREATE_TEXT.outcomeUnknown));
    pressCreate();
    await waitFor(() => expect(alertText()).toBe(LINK_CREATE_TEXT.keyDeleted));
    d.close();
    expect(d.listInvalidations()).toBe(0);
  });

  it("AC-22: an unknown outcome ended by a 201 (a replay) closes as PAC-112 does", async () => {
    createLink.mockRejectedValueOnce(LOST()).mockResolvedValueOnce(saved(makeLink([], "new", "intro")));
    const d = renderDrawer();
    setTitle("Intro");
    pressCreate();
    await waitFor(() => expect(alertText()).toBe(LINK_CREATE_TEXT.outcomeUnknown));
    pressCreate();
    await waitFor(() => expect(d.onOpenChange).toHaveBeenCalledWith(false));
    expect(toast.success).toHaveBeenCalledWith("Link created.");
    const afterSuccess = d.listInvalidations();
    d.close();
    expect(d.listInvalidations()).toBe(afterSuccess);
  });

  it("AC-22: unmounting with an unknown outcome invalidates the links list", async () => {
    createLink.mockRejectedValue(LOST());
    const d = renderDrawer();
    setTitle("Intro");
    pressCreate();
    await waitFor(() => expect(alertText()).toBe(LINK_CREATE_TEXT.outcomeUnknown));
    d.view.unmount();
    expect(d.listInvalidations()).toBe(1);
  });
});

describe.each([
  ["key-reused", USED, LINK_CREATE_TEXT.keyReused, LINK_CREATE_TEXT.keyReusedBaselineFailed],
  ["expired", EXPIRED, LINK_CREATE_TEXT.keyExpired, LINK_CREATE_TEXT.keyExpiredBaselineFailed],
])("the %s refusal (AC-20, AC-31, AC-32)", (_label, refusal, text, failedText) => {
  it("AC-20/AC-32: becomes an editor of L, keeps title and settings, reads L's strict baseline, and the next press edits L", async () => {
    createLink.mockRejectedValueOnce(LOST()).mockRejectedValueOnce(refusal());
    getLink.mockResolvedValue(makeLink([]));
    updateLink.mockResolvedValue(saved(makeLink([])));
    const d = renderDrawer();
    setTitle("Intro");
    fireEvent.click(screen.getByRole("button", { name: "45 min" }));
    pressCreate();
    await waitFor(() => expect(alertText()).toBe(LINK_CREATE_TEXT.outcomeUnknown));
    pressCreate();
    await waitFor(() => expect(getLink).toHaveBeenCalledWith(L));
    await waitFor(() => expect(alertText()).toBe(text));
    expect(heading()).toBe("Edit link");
    expect((screen.getByLabelText("Title") as HTMLInputElement).value).toBe("Intro");
    expect(screen.getByRole("button", { name: "45 min" })).toHaveAttribute("aria-pressed", "true");

    pressSave();
    await waitFor(() => expect(updateLink).toHaveBeenCalledTimes(1));
    expect(updateLink.mock.calls[0][0]).toBe(L);
    expect(updateLink.mock.calls[0][1]).toMatchObject({ title: "Intro", durations: [30, 45] });
    expect(createLink).toHaveBeenCalledTimes(2);
    expect(d.onOpenChange).toHaveBeenCalledWith(false);
  });

  it("AC-22: invalidates the links list when the refusal arrives", async () => {
    let resolveRead!: (l: SchedulingLink) => void;
    getLink.mockReturnValue(new Promise<SchedulingLink>((r) => (resolveRead = r)));
    createLink.mockRejectedValueOnce(refusal());
    const d = renderDrawer();
    setTitle("Intro");
    pressCreate();
    await waitFor(() => expect(d.listInvalidations()).toBe(1));
    await act(async () => resolveRead(makeLink([])));
  });

  it("the slug is empty and dirty until L's baseline answers, then L's slug, never the title-derived one", async () => {
    const read = deferred<SchedulingLink>();
    getLink.mockReturnValue(read.promise);
    createLink.mockRejectedValueOnce(refusal());
    renderDrawer();
    setTitle("Brand new title");
    // PAC-122 SF-052: no title-derived address is ever shown.
    expect(screen.queryByText(publicBookingUrl("brand-new-title"))).toBeNull();
    pressCreate();
    await waitFor(() => expect(getLink).toHaveBeenCalledWith(L));
    expect(screen.queryByText(publicBookingUrl("brand-new-title"))).toBeNull();
    expect(screen.getByTestId("link-address-pending")).toBeInTheDocument();
    await act(async () => read.resolve(makeLink([], L, "earlier-intro")));
    await waitFor(() => expect(screen.getByText(publicBookingUrl("earlier-intro"))).toBeInTheDocument());
    // Still dirty: a title change never re-derives it.
    setTitle("Another title");
    expect(screen.getByText(publicBookingUrl("earlier-intro"))).toBeInTheDocument();
  });

  it("AC-31: chips removed and added after a lost answer stay {G} over a baseline holding B, and the next save sends {G}", async () => {
    createLink.mockRejectedValueOnce(LOST()).mockRejectedValueOnce(refusal());
    getLink.mockResolvedValue(makeLink([host("b@co.com", "pending")]));
    updateLink.mockResolvedValue(saved(makeLink([host("g@co.com", "pending")])));
    renderDrawer();
    setTitle("Intro");
    addCoHost("b@co.com");
    pressCreate();
    await waitFor(() => expect(alertText()).toBe(LINK_CREATE_TEXT.outcomeUnknown));
    removeChip("b@co.com");
    addCoHost("g@co.com");
    setTitle("Intro renamed");
    pressCreate();
    await waitFor(() => expect(getLink).toHaveBeenCalledWith(L));
    await waitFor(() => expect(emailInput()).not.toBeDisabled());
    expect(chipEmails()).toEqual(["g@co.com"]);
    expect(alertText()).toBe(text);

    pressSave();
    await waitFor(() => expect(updateLink).toHaveBeenCalledTimes(1));
    expect(updateLink.mock.calls[0][0]).toBe(L);
    expect(updateLink.mock.calls[0][1]).toMatchObject({ title: "Intro renamed", co_host_emails: ["g@co.com"] });
    expect(createLink).toHaveBeenCalledTimes(2);
  });

  it("AC-31 (review M-1): while L's baseline is pending, Save changes is disabled and sends nothing; once it answers, Save sends exactly {G}", async () => {
    const read = deferred<SchedulingLink>();
    createLink.mockRejectedValueOnce(LOST()).mockRejectedValueOnce(refusal());
    getLink.mockReturnValue(read.promise);
    updateLink.mockResolvedValue(saved(makeLink([host("g@co.com", "pending")])));
    renderDrawer();
    setTitle("Intro");
    addCoHost("b@co.com");
    pressCreate();
    await waitFor(() => expect(alertText()).toBe(LINK_CREATE_TEXT.outcomeUnknown));
    removeChip("b@co.com");
    addCoHost("g@co.com");
    pressCreate();
    await waitFor(() => expect(getLink).toHaveBeenCalledWith(L));
    await waitFor(() => expect(heading()).toBe("Edit link"));

    expect(alertText()).toBe(LINK_CREATE_TEXT.refusalBaselinePending);
    expect(alertText()).not.toMatch(/press Save changes/i);
    const saveButton = screen.getByRole("button", { name: /save changes/i });
    expect(saveButton).toBeDisabled();
    pressSave();
    await new Promise((r) => setTimeout(r, 10));
    expect(updateLink).not.toHaveBeenCalled();
    expect(createLink).toHaveBeenCalledTimes(2);
    expect(chipEmails()).toEqual(["g@co.com"]);

    await act(async () => read.resolve(makeLink([host("b@co.com", "pending")])));
    await waitFor(() => expect(alertText()).toBe(text));
    expect(screen.getByRole("button", { name: /save changes/i })).not.toBeDisabled();
    expect(chipEmails()).toEqual(["g@co.com"]);
    pressSave();
    await waitFor(() => expect(updateLink).toHaveBeenCalledTimes(1));
    expect(updateLink.mock.calls[0][0]).toBe(L);
    expect(updateLink.mock.calls[0][1].co_host_emails).toEqual(["g@co.com"]);
  });

  it("AC-31: chips equal to the baseline as case-insensitive sets send no list", async () => {
    createLink.mockRejectedValueOnce(LOST()).mockRejectedValueOnce(refusal());
    getLink.mockResolvedValue(makeLink([host("B@Co.com", "pending")]));
    updateLink.mockResolvedValue(saved(makeLink([host("B@Co.com", "pending")])));
    renderDrawer();
    setTitle("Intro");
    addCoHost("b@co.com");
    pressCreate();
    await waitFor(() => expect(alertText()).toBe(LINK_CREATE_TEXT.outcomeUnknown));
    pressCreate();
    await waitFor(() => expect(getLink).toHaveBeenCalledWith(L));
    await waitFor(() => expect(emailInput()).not.toBeDisabled());
    expect(chipEmails()).toEqual(["b@co.com"]);
    pressSave();
    await waitFor(() => expect(updateLink).toHaveBeenCalledTimes(1));
    expect(updateLink.mock.calls[0][1]).not.toHaveProperty("co_host_emails");
  });

  it("AC-31: a failed baseline disables co-host editing, says so without 'reopen', and the next save carries the title and no list", async () => {
    createLink.mockRejectedValueOnce(LOST()).mockRejectedValueOnce(refusal());
    getLink.mockRejectedValue(new ApiHttpError(500, { error: "internal error" }));
    updateLink.mockResolvedValue(saved(makeLink([])));
    renderDrawer();
    setTitle("Intro");
    addCoHost("g@co.com");
    pressCreate();
    await waitFor(() => expect(alertText()).toBe(LINK_CREATE_TEXT.outcomeUnknown));
    setTitle("Intro renamed");
    pressCreate();
    await waitFor(() => expect(alertText()).toBe(failedText));
    expect(emailInput()).toBeDisabled();
    expect(document.getElementById("co-hosts-blocked")).toHaveTextContent(LINK_CREATE_TEXT.coHostsBlockedAfterRefusal);
    expect(document.body.textContent).not.toMatch(/reopen the editor/i);
    // PAC-122 SF-052: no address is known here, so none is shown.
    expect(screen.getByTestId("link-address-pending")).toBeInTheDocument();

    pressSave();
    await waitFor(() => expect(updateLink).toHaveBeenCalledTimes(1));
    expect(updateLink.mock.calls[0][0]).toBe(L);
    expect(updateLink.mock.calls[0][1]).toMatchObject({ title: "Intro renamed" });
    expect(updateLink.mock.calls[0][1]).not.toHaveProperty("co_host_emails");
  });

  it("an edit of L that later stays open hydrates the chips from the next baseline again (PAC-112 §5.4)", async () => {
    createLink.mockRejectedValueOnce(refusal());
    getLink
      .mockResolvedValueOnce(makeLink([]))
      .mockResolvedValue(makeLink([host("b@co.com", "pending")]));
    updateLink.mockResolvedValue({
      link: makeLink([host("b@co.com", "pending")]),
      co_host_changes: {
        addresses: [{ email: "b@co.com", outcome: "invited" }, { email: "c@nowhere.io", outcome: "not_added" }],
        removed: [], invited_count: 1, removed_count: 0, not_added_count: 1,
      },
      co_host_list_sent: true,
    });
    renderDrawer();
    setTitle("Intro");
    addCoHost("b@co.com");
    addCoHost("c@nowhere.io");
    pressCreate();
    await waitFor(() => expect(alertText()).toBe(text));
    await waitFor(() => expect(emailInput()).not.toBeDisabled());
    expect(chipEmails()).toEqual(["b@co.com", "c@nowhere.io"]);
    pressSave();
    await waitFor(() => expect(getLink).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(chipEmails()).toEqual(["b@co.com"]));
    expect(alertText()).toBeNull();
  });
});

describe("the deleted refusal (AC-21)", () => {
  it("stays a create editor with the typed values, reads and edits nothing, and the next press uses a new key", async () => {
    createLink.mockRejectedValueOnce(LOST()).mockRejectedValueOnce(DELETED()).mockResolvedValueOnce(saved(makeLink([], "new", "intro")));
    const d = renderDrawer();
    setTitle("Intro");
    addCoHost("g@co.com");
    pressCreate();
    await waitFor(() => expect(alertText()).toBe(LINK_CREATE_TEXT.outcomeUnknown));
    pressCreate();
    await waitFor(() => expect(alertText()).toBe(LINK_CREATE_TEXT.keyDeleted));
    expect(heading()).toBe("New scheduling link");
    expect(screen.getByRole("button", { name: /create link/i })).toBeInTheDocument();
    expect((screen.getByLabelText("Title") as HTMLInputElement).value).toBe("Intro");
    expect(chipEmails()).toEqual(["g@co.com"]);
    expect(getLink).not.toHaveBeenCalled();
    expect(updateLink).not.toHaveBeenCalled();
    expect(d.listInvalidations()).toBe(0);

    pressCreate();
    await waitFor(() => expect(createLink).toHaveBeenCalledTimes(3));
    expect(keyOf(1)).toBe(keyOf(0));
    expect(keyOf(2)).toMatch(KEY_FORMAT);
    expect(keyOf(2)).not.toBe(keyOf(0));
    expect(bodyOf(2)).toMatchObject({ title: "Intro", co_host_emails: ["g@co.com"] });
    expect(getLink).not.toHaveBeenCalled();
    expect(updateLink).not.toHaveBeenCalled();
  });
});

describe("no close path while a save is pending (contract §7.3, AC-27)", () => {
  const closeButton = () => screen.getByRole("button", { name: "Close" });
  const pressEscape = () => fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape" });
  const clickOutside = () => {
    const overlay = document.querySelector("[data-state='open'].fixed.inset-0") as HTMLElement;
    fireEvent.pointerDown(overlay);
    fireEvent.click(overlay);
  };
  const tryEveryClose = () => {
    fireEvent.click(closeButton());
    pressEscape();
    clickOutside();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
  };

  it("a pending create: X, Escape, outside click and Cancel are refused; the answer lands in this session; after it settles each closes", async () => {
    const pending = deferred<SchedulingLinkSaveResult>();
    createLink.mockReturnValueOnce(pending.promise);
    const d = renderDrawer();
    setTitle("Intro");
    pressCreate();
    await waitFor(() => expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled());
    expect(closeButton()).toBeDisabled();
    tryEveryClose();
    // The wrapped callback is the rule, whatever the X button's state.
    fireEvent.keyDown(document, { key: "Escape" });
    await new Promise((r) => setTimeout(r, 10));
    expect(d.onOpenChange).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    await act(async () => pending.resolve(saved(makeLink([], "new", "intro"))));
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Link created."));
    expect(d.onOpenChange).toHaveBeenCalledTimes(1);
    expect(d.onOpenChange).toHaveBeenCalledWith(false);
  });

  it("a pending create that fails settles in this session and then every path closes", async () => {
    const pending = deferred<SchedulingLinkSaveResult>();
    createLink.mockReturnValueOnce(pending.promise);
    const d = renderDrawer();
    setTitle("Intro");
    pressCreate();
    await waitFor(() => expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled());
    tryEveryClose();
    expect(d.onOpenChange).not.toHaveBeenCalled();
    await act(async () => pending.reject(LOST()));
    await waitFor(() => expect(alertText()).toBe(LINK_CREATE_TEXT.outcomeUnknown));

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(d.onOpenChange).toHaveBeenLastCalledWith(false);
    d.onOpenChange.mockClear();
    fireEvent.click(closeButton());
    expect(d.onOpenChange).toHaveBeenLastCalledWith(false);
    d.onOpenChange.mockClear();
    pressEscape();
    expect(d.onOpenChange).toHaveBeenLastCalledWith(false);
  });

  it("a pending edit: every close path is refused until it settles", async () => {
    const pending = deferred<SchedulingLinkSaveResult>();
    getLink.mockResolvedValue(makeLink([]));
    updateLink.mockReturnValueOnce(pending.promise);
    const d = renderDrawer(makeLink([]));
    await waitFor(() => expect(emailInput()).not.toBeDisabled());
    pressSave();
    await waitFor(() => expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled());
    tryEveryClose();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(d.onOpenChange).not.toHaveBeenCalled();

    await act(async () => pending.resolve(saved(makeLink([]))));
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Link updated."));
    expect(d.onOpenChange).toHaveBeenCalledTimes(1);
    expect(d.onOpenChange).toHaveBeenCalledWith(false);
  });

  it("with nothing pending, the X button and Escape close as today", () => {
    const d = renderDrawer();
    expect(closeButton()).not.toBeDisabled();
    fireEvent.click(closeButton());
    expect(d.onOpenChange).toHaveBeenCalledWith(false);
    d.onOpenChange.mockClear();
    pressEscape();
    expect(d.onOpenChange).toHaveBeenCalledWith(false);
  });
});
