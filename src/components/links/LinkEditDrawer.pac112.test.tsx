import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { LinkEditDrawer } from "./LinkEditDrawer";
import { api } from "@/api/client";
import { clearFreebusyCache } from "@/api/coverageCache";
import {
  schedulingLinkKeys,
  schedulingLinksApi,
  type SchedulingLinkCoHostChanges,
  type SchedulingLinkSaveResult,
} from "@/api/schedulingLinks";
import type { SchedulingHost, SchedulingLink } from "@/api/types";
import { AuthContext, type AuthContextValue } from "@/contexts/auth-context";
import { toast } from "@/hooks/useToast";

// PAC-112 (contract §5): the link editor's co-host baseline, list, refusals,
// messages and stay-open rule, at the [unit] layer: what the editor sends,
// shows or caches, against a mocked API.

const OWNER: SchedulingHost = { user_id: "u1", email: "owner@co.com", is_owner: true, status: "accepted" };
const host = (email: string, status: SchedulingHost["status"] = "accepted"): SchedulingHost => ({
  user_id: `u_${email}`, email, is_owner: false, status,
});

function makeLink(hosts: SchedulingHost[], id = "l1"): SchedulingLink {
  return {
    id, owner_id: "u1", title: "Intro", slug: "intro", durations: [30], days: ["mon", "tue"],
    window_start: "09:00", window_end: "17:00", buffer_before: 0, buffer_after: 0, min_notice_minutes: 0,
    usage_type: "reusable", uses_count: 0, active: true, hosts: [OWNER, ...hosts],
    created_at: "2026-01-01T00:00:00Z", is_owner: true, booking_horizon_days: 60, refusal_message: "generic",
    time_zone: "Europe/Paris",
  };
}

function changes(partial: Partial<SchedulingLinkCoHostChanges>): SchedulingLinkCoHostChanges {
  return { addresses: [], removed: [], invited_count: 0, removed_count: 0, not_added_count: 0, ...partial };
}
function saved(link: SchedulingLink, c?: SchedulingLinkCoHostChanges, sent = c !== undefined): SchedulingLinkSaveResult {
  return { link, co_host_changes: c, co_host_list_sent: sent };
}

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function renderDrawer(link: SchedulingLink | null, opts: { signedIn?: string } = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const onOpenChange = vi.fn();
  const auth = { user: opts.signedIn ? { email: opts.signedIn } : null } as unknown as AuthContextValue;
  const view = render(
    <AuthContext.Provider value={auth}>
      <QueryClientProvider client={client}>
        <LinkEditDrawer open onOpenChange={onOpenChange} link={link} />
      </QueryClientProvider>
    </AuthContext.Provider>,
  );
  return { client, onOpenChange, view };
}

const emailInput = () => screen.getByLabelText("Co-host email") as HTMLInputElement;
function addCoHost(email: string) {
  fireEvent.change(emailInput(), { target: { value: email } });
  fireEvent.click(screen.getByRole("button", { name: /^add$/i }));
}
const removeChip = (email: string) => fireEvent.click(screen.getByRole("button", { name: `Remove ${email}` }));
const chipEmails = () =>
  screen.queryAllByRole("button", { name: /^Remove / }).map((b) => (b.getAttribute("aria-label") ?? "").replace(/^Remove /, ""));
/** The lines of the always-mounted "Save results" live region (empty until a save keeps the editor open). */
const results = () =>
  Array.from(screen.getByRole("status", { name: "Save results" }).querySelectorAll("p")).map((p) => p.textContent ?? "");
const save = (name = /save changes/i) => fireEvent.click(screen.getByRole("button", { name }));
const PENDING = "Loading co-hosts…";
const FAILED = "Co-hosts can't be edited right now because the current list couldn't be loaded. Reopen the editor to try again.";

let success: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  clearFreebusyCache();
  vi.spyOn(api, "freebusy").mockImplementation(async (input) => ({
    start_time: input.start_time, end_time: input.end_time,
    participants: input.emails.map((email) => ({ email, status: "unknown" as const, busy: [] })),
  }));
  success = vi.spyOn(toast, "success");
  vi.spyOn(toast, "error");
});
afterEach(() => vi.restoreAllMocks());

describe("baseline (contract §5.1)", () => {
  it("AC-6: co-host editing is disabled until the strict read answers, and the chips are that read's roster, never the list's", async () => {
    const read = deferred<SchedulingLink>();
    const getLink = vi.spyOn(schedulingLinksApi, "getLink").mockReturnValue(read.promise);
    const fromList = makeLink([host("list-only@co.com")]);
    renderDrawer(fromList);

    expect(getLink).toHaveBeenCalledWith("l1");
    expect(screen.getByText(PENDING)).toBeInTheDocument();
    expect(emailInput()).toBeDisabled();
    expect(screen.getByRole("button", { name: /^add$/i })).toBeDisabled();
    expect(screen.queryByText("list-only@co.com")).toBeNull();

    read.resolve(makeLink([host("read@co.com")]));
    await waitFor(() => expect(chipEmails()).toEqual(["read@co.com"]));
    expect(emailInput()).not.toBeDisabled();
    expect(screen.queryByText(PENDING)).toBeNull();
    expect(screen.queryByText("list-only@co.com")).toBeNull();
  });

  it("AC-29: a failed read disables co-host editing with the reason, and a title-only save carries no list", async () => {
    vi.spyOn(schedulingLinksApi, "getLink").mockRejectedValue(new Error("500"));
    const update = vi.spyOn(schedulingLinksApi, "updateLink").mockResolvedValue(saved(makeLink([])));
    renderDrawer(makeLink([host("e@co.com")]));

    expect(await screen.findByText(FAILED)).toBeInTheDocument();
    expect(emailInput()).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "Renamed" } });
    save();
    await waitFor(() => expect(update).toHaveBeenCalledTimes(1));
    expect(update.mock.calls[0][1]).toMatchObject({ title: "Renamed" });
    expect(update.mock.calls[0][1]).not.toHaveProperty("co_host_emails");
  });

  it("reopening the editor retries the read", async () => {
    const getLink = vi.spyOn(schedulingLinksApi, "getLink").mockRejectedValueOnce(new Error("500"));
    const link = makeLink([host("e@co.com")]);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const tree = (open: boolean) => (
      <QueryClientProvider client={client}>
        <LinkEditDrawer open={open} onOpenChange={() => {}} link={link} />
      </QueryClientProvider>
    );
    const view = render(tree(true));
    expect(await screen.findByText(FAILED)).toBeInTheDocument();
    expect(getLink).toHaveBeenCalledTimes(1);

    getLink.mockResolvedValue(link);
    view.rerender(tree(false));
    view.rerender(tree(true));
    await waitFor(() => expect(chipEmails()).toEqual(["e@co.com"]));
    expect(getLink).toHaveBeenCalledTimes(2);
  });
});

describe("what a save sends (contract §5.1, AC-5)", () => {
  it("AC-5: removing E and adding G is one request carrying the fields and the complete list {G}", async () => {
    vi.spyOn(schedulingLinksApi, "getLink").mockResolvedValue(makeLink([host("E@co.com")]));
    const update = vi.spyOn(schedulingLinksApi, "updateLink").mockResolvedValue(saved(makeLink([host("g@co.com", "pending")]), changes({
      addresses: [{ email: "g@co.com", outcome: "invited" }], invited_count: 1, removed: [{ user_id: "u_E", email: "E@co.com", status: "accepted" }], removed_count: 1,
    })));
    const create = vi.spyOn(schedulingLinksApi, "createLink");
    renderDrawer(makeLink([host("E@co.com")]));
    await waitFor(() => expect(chipEmails()).toEqual(["E@co.com"]));

    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "Renamed" } });
    removeChip("E@co.com");
    addCoHost("g@co.com");
    save();
    await waitFor(() => expect(update).toHaveBeenCalledTimes(1));
    expect(update.mock.calls[0][0]).toBe("l1");
    expect(update.mock.calls[0][1]).toMatchObject({ title: "Renamed", co_host_emails: ["g@co.com"] });
    expect(create).not.toHaveBeenCalled();
  });

  it("AC-5: removing E and adding it back in a different case carries no list", async () => {
    vi.spyOn(schedulingLinksApi, "getLink").mockResolvedValue(makeLink([host("E@co.com")]));
    const update = vi.spyOn(schedulingLinksApi, "updateLink").mockResolvedValue(saved(makeLink([host("E@co.com")])));
    renderDrawer(makeLink([host("E@co.com")]));
    await waitFor(() => expect(chipEmails()).toEqual(["E@co.com"]));

    removeChip("E@co.com");
    addCoHost("e@CO.com");
    expect(chipEmails()).toEqual(["e@co.com"]);
    save();
    await waitFor(() => expect(update).toHaveBeenCalledTimes(1));
    expect(update.mock.calls[0][1]).not.toHaveProperty("co_host_emails");
  });

  it("removing the last co-host sends the empty list []", async () => {
    vi.spyOn(schedulingLinksApi, "getLink").mockResolvedValue(makeLink([host("b@co.com", "pending")]));
    const update = vi.spyOn(schedulingLinksApi, "updateLink").mockResolvedValue(
      saved(makeLink([]), changes({ removed: [{ user_id: "u_b", email: "b@co.com", status: "pending" }], removed_count: 1 })),
    );
    const { onOpenChange } = renderDrawer(makeLink([host("b@co.com", "pending")]));
    await waitFor(() => expect(chipEmails()).toEqual(["b@co.com"]));
    removeChip("b@co.com");
    save();
    await waitFor(() => expect(update).toHaveBeenCalledTimes(1));
    expect(update.mock.calls[0][1].co_host_emails).toEqual([]);
    // PAC-119 AC-18: an edit carries no attempt key.
    expect(update.mock.calls[0]).toHaveLength(2);
    expect(success).toHaveBeenCalledWith("Link updated. 0 co-hosts invited. Removed 1 co-host.");
    // PAC-119 AC-27: the close guard only refuses while pending; a settled save closes as before.
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("a new link with no chips sends no list", async () => {
    const create = vi.spyOn(schedulingLinksApi, "createLink").mockResolvedValue(saved(makeLink([], "new")));
    const getLink = vi.spyOn(schedulingLinksApi, "getLink");
    const { onOpenChange } = renderDrawer(null);
    expect(screen.queryByText(PENDING)).toBeNull();
    expect(getLink).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "New" } });
    save(/create link/i);
    await waitFor(() => expect(create).toHaveBeenCalledTimes(1));
    expect(create.mock.calls[0][0]).not.toHaveProperty("co_host_emails");
    // PAC-119 (contract §7.1): the create carries the editor's attempt key as a separate argument.
    expect(create.mock.calls[0][1]).toMatch(/^[A-Za-z0-9_-]{16,255}$/);
    expect(success).toHaveBeenCalledWith("Link created.");
    // PAC-119 AC-27: the close guard only refuses while pending; a settled save closes as before.
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});

describe("chips (contract §5.2)", () => {
  it("AC-17: an address already a chip is refused ignoring case", async () => {
    vi.spyOn(schedulingLinksApi, "getLink").mockResolvedValue(makeLink([host("Pat@Acme.com")]));
    renderDrawer(makeLink([host("Pat@Acme.com")]));
    await waitFor(() => expect(chipEmails()).toEqual(["Pat@Acme.com"]));
    addCoHost("pat@acme.com");
    expect(screen.getByRole("alert")).toHaveTextContent("This co-host is already added.");
    expect(chipEmails()).toEqual(["Pat@Acme.com"]);
  });

  it("AC-14: the owner's own address is refused in any case, on a new link and on an existing one, and no save carries it", async () => {
    const create = vi.spyOn(schedulingLinksApi, "createLink").mockResolvedValue(saved(makeLink([], "new")));
    const first = renderDrawer(null, { signedIn: "owner@co.com" });
    addCoHost("OWNER@Co.com");
    expect(screen.getByRole("alert")).toHaveTextContent("That's your own address — you're the link's owner.");
    expect(chipEmails()).toEqual([]);
    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "New" } });
    save(/create link/i);
    await waitFor(() => expect(create).toHaveBeenCalledTimes(1));
    expect(create.mock.calls[0][0]).not.toHaveProperty("co_host_emails");
    first.view.unmount();

    // Without the auth provider's user, the strict read's owner row still names the owner.
    vi.spyOn(schedulingLinksApi, "getLink").mockResolvedValue(makeLink([]));
    renderDrawer(makeLink([]));
    await waitFor(() => expect(emailInput()).not.toBeDisabled());
    addCoHost("Owner@CO.com");
    expect(screen.getByRole("alert")).toHaveTextContent("That's your own address — you're the link's owner.");
    expect(chipEmails()).toEqual([]);
  });

  it("AC-33: on a link with 7 co-hosts, the hydrated chips are shown and adding G is refused at the cap", async () => {
    const seven = ["a", "b", "c", "d", "e", "f", "h"].map((x) => host(`${x}@co.com`));
    vi.spyOn(schedulingLinksApi, "getLink").mockResolvedValue(makeLink(seven));
    renderDrawer(makeLink(seven));
    await waitFor(() => expect(chipEmails()).toHaveLength(7));
    addCoHost("g@co.com");
    expect(screen.getByRole("alert")).toHaveTextContent("You can invite up to 5 co-hosts.");
    expect(chipEmails()).not.toContain("g@co.com");
  });
});

describe("messages (contract §5.3)", () => {
  it("AC-12: the message states exactly the answer's counts", async () => {
    vi.spyOn(schedulingLinksApi, "getLink").mockResolvedValue(makeLink([host("e@co.com")]));
    vi.spyOn(schedulingLinksApi, "updateLink").mockResolvedValue(saved(makeLink([]), changes({
      addresses: [
        { email: "g@co.com", outcome: "invited" },
        { email: "h@co.com", outcome: "invited" },
        { email: "c@nowhere.io", outcome: "not_added" },
      ],
      removed: [{ user_id: "u_e", email: "e@co.com", status: "accepted" }],
      invited_count: 2, removed_count: 1, not_added_count: 1,
    })));
    renderDrawer(makeLink([host("e@co.com")]));
    await waitFor(() => expect(chipEmails()).toEqual(["e@co.com"]));
    removeChip("e@co.com");
    addCoHost("g@co.com");
    addCoHost("h@co.com");
    addCoHost("c@nowhere.io");
    save();
    // The editor stays open (one address not added): the summary is in the
    // "Save results" region, and no toast repeats it (M6).
    await waitFor(() =>
      expect(results()).toEqual([
        "Link updated.",
        "2 co-hosts invited — they can accept from Paceday.",
        "Removed 1 co-host.",
        "1 address couldn't be added as a co-host.",
        "c@nowhere.io couldn't be added as a co-host.",
      ]),
    );
    expect(success).not.toHaveBeenCalled();
    for (const line of results()) expect(line.replace(/\S+@\S+/g, "ADDR")).not.toMatch(/sent|email|no paceday account/i);
  });

  it("AC-12: an answer of zero invited says zero, though the editor's own diff would say one", async () => {
    vi.spyOn(schedulingLinksApi, "getLink").mockResolvedValue(makeLink([]));
    vi.spyOn(schedulingLinksApi, "updateLink").mockResolvedValue(
      saved(makeLink([host("g@co.com")]), changes({ addresses: [{ email: "g@co.com", outcome: "already_host" }] })),
    );
    renderDrawer(makeLink([]));
    await waitFor(() => expect(emailInput()).not.toBeDisabled());
    addCoHost("g@co.com");
    save();
    await waitFor(() => expect(success).toHaveBeenCalledWith("Link updated. 0 co-hosts invited."));
  });

  it("§5.3 fallback: a list sent and no report keeps the editor open, says so, and re-reads the baseline", async () => {
    const getLink = vi.spyOn(schedulingLinksApi, "getLink").mockResolvedValue(makeLink([]));
    vi.spyOn(schedulingLinksApi, "updateLink").mockResolvedValue(saved(makeLink([]), undefined, true));
    const { onOpenChange } = renderDrawer(makeLink([]));
    await waitFor(() => expect(emailInput()).not.toBeDisabled());
    addCoHost("g@co.com");
    save();
    await waitFor(() =>
      expect(results()).toEqual([
        "Link updated.",
        "Paceday couldn't confirm which co-hosts were added — check the co-host list.",
      ]),
    );
    expect(success).not.toHaveBeenCalled();
    await waitFor(() => expect(getLink).toHaveBeenCalledTimes(2));
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });

  it("a failed save shows the error, no success message, and keeps the input", async () => {
    vi.spyOn(schedulingLinksApi, "getLink").mockResolvedValue(makeLink([]));
    vi.spyOn(schedulingLinksApi, "updateLink").mockRejectedValue(new Error("boom"));
    const { onOpenChange } = renderDrawer(makeLink([]));
    await waitFor(() => expect(emailInput()).not.toBeDisabled());
    addCoHost("g@co.com");
    save();
    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
    expect(success).not.toHaveBeenCalled();
    expect(chipEmails()).toEqual(["g@co.com"]);
    expect(onOpenChange).not.toHaveBeenCalled();
  });
});

describe("after a save that keeps the editor open (contract §5.4)", () => {
  it("AC-11/AC-13: names the address, re-reads, and neither the chips nor the seeded cache hold C or the removed E", async () => {
    const getLink = vi.spyOn(schedulingLinksApi, "getLink")
      .mockResolvedValueOnce(makeLink([host("e@co.com")]))
      .mockResolvedValueOnce(makeLink([host("b@co.com", "pending")]));
    vi.spyOn(schedulingLinksApi, "updateLink").mockResolvedValue(saved(makeLink([host("b@co.com", "pending")]), changes({
      addresses: [{ email: "b@co.com", outcome: "invited" }, { email: "c@nowhere.io", outcome: "not_added" }],
      removed: [{ user_id: "u_e", email: "e@co.com", status: "accepted" }],
      invited_count: 1, removed_count: 1, not_added_count: 1,
    })));
    const { client, onOpenChange } = renderDrawer(makeLink([host("e@co.com")]));
    await waitFor(() => expect(chipEmails()).toEqual(["e@co.com"]));
    removeChip("e@co.com");
    addCoHost("b@co.com");
    addCoHost("c@nowhere.io");
    save();

    await waitFor(() => expect(results()).toContain("c@nowhere.io couldn't be added as a co-host."));
    expect(results()).toContain("1 co-host invited — they can accept from Paceday.");
    await waitFor(() => expect(getLink).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(chipEmails()).toEqual(["b@co.com"]));
    const cached = client.getQueryData<{ owned: SchedulingLink[] }>(schedulingLinkKeys.links);
    const cachedEmails = cached?.owned[0].hosts.map((h) => h.email) ?? [];
    expect(cachedEmails).not.toContain("c@nowhere.io");
    expect(cachedEmails).not.toContain("e@co.com");
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });

  it("AC-31: the next baseline is the re-read, not the save's degraded roster: the second save carries {E, G}", async () => {
    vi.spyOn(schedulingLinksApi, "getLink").mockResolvedValue(makeLink([host("e@co.com")]));
    const update = vi.spyOn(schedulingLinksApi, "updateLink")
      // The answer's roster is degraded to empty (the owner only).
      .mockResolvedValueOnce(saved(makeLink([]), changes({
        addresses: [{ email: "e@co.com", outcome: "already_host" }, { email: "c@nowhere.io", outcome: "not_added" }], not_added_count: 1,
      })))
      .mockResolvedValueOnce(saved(makeLink([host("e@co.com"), host("g@co.com", "pending")]), changes({
        addresses: [{ email: "e@co.com", outcome: "already_host" }, { email: "g@co.com", outcome: "invited" }], invited_count: 1,
      })));
    renderDrawer(makeLink([host("e@co.com")]));
    await waitFor(() => expect(chipEmails()).toEqual(["e@co.com"]));
    addCoHost("c@nowhere.io");
    save();
    await waitFor(() => expect(results()).not.toEqual([]));
    await waitFor(() => expect(chipEmails()).toEqual(["e@co.com"]));

    addCoHost("g@co.com");
    save();
    await waitFor(() => expect(update).toHaveBeenCalledTimes(2));
    expect(update.mock.calls[1][1].co_host_emails).toEqual(["e@co.com", "g@co.com"]);
  });

  it("AC-25: with the re-read holding B, a title-only save carries no list and adding G sends {B, G}", async () => {
    vi.spyOn(schedulingLinksApi, "getLink")
      .mockResolvedValueOnce(makeLink([]))
      .mockResolvedValue(makeLink([host("b@co.com", "pending")]));
    const update = vi.spyOn(schedulingLinksApi, "updateLink")
      .mockResolvedValueOnce(saved(makeLink([]), changes({
        addresses: [{ email: "b@co.com", outcome: "invited" }, { email: "c@nowhere.io", outcome: "not_added" }], invited_count: 1, not_added_count: 1,
      })))
      .mockResolvedValueOnce(saved(makeLink([host("b@co.com", "pending")])))
      .mockResolvedValueOnce(saved(makeLink([host("b@co.com", "pending"), host("g@co.com", "pending")]), changes({
        addresses: [{ email: "b@co.com", outcome: "already_host" }, { email: "g@co.com", outcome: "not_added" }], not_added_count: 1,
      })));
    renderDrawer(makeLink([]));
    await waitFor(() => expect(emailInput()).not.toBeDisabled());
    addCoHost("b@co.com");
    addCoHost("c@nowhere.io");
    save();
    await waitFor(() => expect(results()).not.toEqual([]));
    await waitFor(() => expect(chipEmails()).toEqual(["b@co.com"]));

    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "Renamed" } });
    save();
    await waitFor(() => expect(update).toHaveBeenCalledTimes(2));
    expect(update.mock.calls[1][1]).not.toHaveProperty("co_host_emails");
  });

  it("AC-25 (second half): with the strict read holding B, adding G sends the complete list {B, G}", async () => {
    vi.spyOn(schedulingLinksApi, "getLink").mockResolvedValue(makeLink([host("b@co.com", "pending")]));
    const update = vi.spyOn(schedulingLinksApi, "updateLink").mockResolvedValue(saved(makeLink([host("b@co.com", "pending")])));
    renderDrawer(makeLink([]));
    await waitFor(() => expect(chipEmails()).toEqual(["b@co.com"]));
    addCoHost("g@co.com");
    save();
    await waitFor(() => expect(update).toHaveBeenCalledTimes(1));
    expect(update.mock.calls[0][1].co_host_emails).toEqual(["b@co.com", "g@co.com"]);
  });

  it("AC-30: when the re-read after a stay-open save fails, co-host editing is disabled and the next title-only save carries no list", async () => {
    vi.spyOn(schedulingLinksApi, "getLink")
      .mockResolvedValueOnce(makeLink([]))
      .mockRejectedValue(new Error("500"));
    const update = vi.spyOn(schedulingLinksApi, "updateLink")
      .mockResolvedValueOnce(saved(makeLink([]), changes({ addresses: [{ email: "c@nowhere.io", outcome: "not_added" }], not_added_count: 1 })))
      .mockResolvedValue(saved(makeLink([])));
    renderDrawer(makeLink([]));
    await waitFor(() => expect(emailInput()).not.toBeDisabled());
    addCoHost("c@nowhere.io");
    save();
    expect(await screen.findByText(FAILED)).toBeInTheDocument();
    expect(emailInput()).toBeDisabled();

    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "Renamed" } });
    save();
    await waitFor(() => expect(update).toHaveBeenCalledTimes(2));
    expect(update.mock.calls[1][1]).not.toHaveProperty("co_host_emails");
  });

  it("AC-24: after a create that stays open, the next save edits the created link and never creates another", async () => {
    const create = vi.spyOn(schedulingLinksApi, "createLink").mockResolvedValue(saved(makeLink([], "new"), changes({
      addresses: [{ email: "c@nowhere.io", outcome: "not_added" }], not_added_count: 1,
    })));
    const getLink = vi.spyOn(schedulingLinksApi, "getLink").mockResolvedValue(makeLink([], "new"));
    const update = vi.spyOn(schedulingLinksApi, "updateLink").mockResolvedValue(saved(makeLink([], "new")));
    const { onOpenChange } = renderDrawer(null);
    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "New" } });
    addCoHost("c@nowhere.io");
    save(/create link/i);
    await waitFor(() => expect(create).toHaveBeenCalledTimes(1));
    expect(create.mock.calls[0][0].co_host_emails).toEqual(["c@nowhere.io"]);
    await waitFor(() =>
      expect(results()).toEqual([
        "Link created.",
        "0 co-hosts invited.",
        "1 address couldn't be added as a co-host.",
        "c@nowhere.io couldn't be added as a co-host.",
      ]),
    );
    expect(success).not.toHaveBeenCalled();
    await waitFor(() => expect(getLink).toHaveBeenCalledWith("new"));

    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "New title" } });
    save();
    await waitFor(() => expect(update).toHaveBeenCalledTimes(1));
    expect(update.mock.calls[0][0]).toBe("new");
    expect(update.mock.calls[0][1]).toMatchObject({ title: "New title" });
    expect(create).toHaveBeenCalledTimes(1);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("an own_address outcome keeps the editor open and names the address", async () => {
    vi.spyOn(schedulingLinksApi, "getLink").mockResolvedValue(makeLink([]));
    vi.spyOn(schedulingLinksApi, "updateLink").mockResolvedValue(
      saved(makeLink([]), changes({ addresses: [{ email: "alias@co.com", outcome: "own_address" }] })),
    );
    renderDrawer(makeLink([]));
    await waitFor(() => expect(emailInput()).not.toBeDisabled());
    addCoHost("alias@co.com");
    save();
    expect(await screen.findByText("alias@co.com is your own address — you're the link's owner.")).toBeInTheDocument();
  });
});

describe("review minors (M5, M6)", () => {
  it("M5: a failed save after a stay-open create removes the previous Save results", async () => {
    vi.spyOn(schedulingLinksApi, "createLink").mockResolvedValue(saved(makeLink([], "new"), changes({
      addresses: [{ email: "c@nowhere.io", outcome: "not_added" }], not_added_count: 1,
    })));
    vi.spyOn(schedulingLinksApi, "getLink").mockResolvedValue(makeLink([], "new"));
    const update = vi.spyOn(schedulingLinksApi, "updateLink").mockRejectedValue(new Error("boom"));
    renderDrawer(null);
    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "New" } });
    addCoHost("c@nowhere.io");
    save(/create link/i);
    await waitFor(() => expect(results()).toContain("c@nowhere.io couldn't be added as a co-host."));

    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "New title" } });
    save();
    await waitFor(() => expect(update).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
    // The panel stays mounted (the e2e suite finds it by role and name), now empty.
    expect(screen.getByRole("status", { name: "Save results" })).toBeEmptyDOMElement();
  });

  it("M6: both live regions are mounted before their text is set, and the panel keeps its role and name", async () => {
    const read = deferred<SchedulingLink>();
    vi.spyOn(schedulingLinksApi, "getLink").mockReturnValue(read.promise);
    renderDrawer(makeLink([]));
    const reason = document.getElementById("co-hosts-blocked") as HTMLElement;
    expect(reason).toHaveAttribute("role", "status");
    expect(reason).toHaveTextContent(PENDING);
    expect(screen.getByRole("status", { name: "Save results" })).toBeEmptyDOMElement();

    read.resolve(makeLink([]));
    await waitFor(() => expect(emailInput()).not.toBeDisabled());
    // The same node, still mounted and now empty, ready to announce a later reason.
    expect(document.getElementById("co-hosts-blocked")).toBe(reason);
    expect(reason).toBeEmptyDOMElement();
  });
});
