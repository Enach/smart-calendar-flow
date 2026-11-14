/**
 * PAC-112 AC-26 / contract §5.5: the demo create and update answer the same
 * co_host_changes as the server, by the rules of contract §2 and §3.3, with
 * "domain-confirmed holder" meaning an address of the demo directory.
 */
import { describe, expect, it } from "vitest";

import { isApiHttpError } from "@/api/client";
import { demoSchedulingLinksOps } from "./schedulingLinks";

const OWNER = "alex@demo.paceday.com";
const BASE = {
  title: "PAC-112 demo", slug: "pac-112-demo", durations: [30], days: ["mon" as const], window_start: "09:00",
  window_end: "17:00", buffer_before: 0, buffer_after: 0, min_notice_minutes: 0, usage_type: "reusable" as const,
};
const coHosts = (id: string) =>
  demoSchedulingLinksOps.getLink(id).hosts.filter((h) => !h.is_owner).map((h) => `${h.email}:${h.status}`);

describe("demo co-host list (PAC-112)", () => {
  it("create: directory addresses are invited, unknown ones not added, the owner's own address reported and kept accepted (AC-11, AC-15)", () => {
    const out = demoSchedulingLinksOps.createLink({
      ...BASE, co_host_emails: ["bob@co.com", "c@nowhere.io", "Alex@Demo.Paceday.com", "BOB@co.com"],
    });
    expect(out.co_host_list_sent).toBe(true);
    expect(out.co_host_changes).toEqual({
      addresses: [
        { email: "bob@co.com", outcome: "invited" },
        { email: "c@nowhere.io", outcome: "not_added" },
        { email: "Alex@Demo.Paceday.com", outcome: "own_address" },
        { email: "BOB@co.com", outcome: "invited" },
      ],
      removed: [],
      invited_count: 1,
      removed_count: 0,
      not_added_count: 1,
    });
    // No pending host is invented for the unknown address; the owner stays accepted.
    expect(coHosts(out.link.id)).toEqual(["bob@co.com:pending"]);
    const owner = out.link.hosts.find((h) => h.is_owner);
    expect(owner).toMatchObject({ email: OWNER, status: "accepted" });
  });

  it("create without a list reports nothing and adds no co-host", () => {
    const out = demoSchedulingLinksOps.createLink(BASE);
    expect(out).toMatchObject({ co_host_list_sent: false, co_host_changes: undefined });
    expect(coHosts(out.link.id)).toEqual([]);
  });

  it("update: keeps listed hosts with their status, invites, removes the unlisted, and an emptied list removes the last one (AC-2, AC-4)", () => {
    const { link } = demoSchedulingLinksOps.createLink({ ...BASE, co_host_emails: ["sarah@co.com", "bob@co.com"] });
    demoSchedulingLinksOps.updateLink(link.id, { co_host_emails: ["Sarah@co.com", "emma@co.com", "zz@nowhere.io"] });
    expect(coHosts(link.id)).toEqual(["sarah@co.com:pending", "emma@co.com:pending"]);

    const emptied = demoSchedulingLinksOps.updateLink(link.id, { co_host_emails: [] });
    expect(emptied.co_host_changes).toMatchObject({
      addresses: [],
      removed: [
        { email: "sarah@co.com", status: "pending" },
        { email: "emma@co.com", status: "pending" },
      ],
      invited_count: 0,
      removed_count: 2,
      not_added_count: 0,
    });
    expect(coHosts(link.id)).toEqual([]);
  });

  it("update without a list leaves the co-hosts alone and reports nothing", () => {
    const { link } = demoSchedulingLinksOps.createLink({ ...BASE, co_host_emails: ["bob@co.com"] });
    const out = demoSchedulingLinksOps.updateLink(link.id, { title: "Renamed" });
    expect(out).toMatchObject({ co_host_list_sent: false, co_host_changes: undefined });
    expect(coHosts(link.id)).toEqual(["bob@co.com:pending"]);
  });

  it("refuses a blank entry and a list longer than 5 that adds someone, changing nothing (AC-19, AC-34)", () => {
    const { link } = demoSchedulingLinksOps.createLink({ ...BASE, co_host_emails: ["bob@co.com"] });
    const is422 = (fn: () => unknown, text: string) => {
      try {
        fn();
      } catch (e) {
        expect(isApiHttpError(e) && e.status === 422).toBe(true);
        expect(JSON.stringify((e as { data?: unknown }).data)).toContain(text);
        return;
      }
      throw new Error("expected a 422");
    };
    is422(() => demoSchedulingLinksOps.updateLink(link.id, { title: "x", co_host_emails: ["   "] }), "blank address");
    const six = ["a1@co.com", "a2@co.com", "a3@co.com", "a4@co.com", "a5@co.com", "a6@co.com"];
    is422(() => demoSchedulingLinksOps.updateLink(link.id, { title: "x", co_host_emails: six }), "longer than 5");
    const before = demoSchedulingLinksOps.listLinks().owned.length;
    is422(() => demoSchedulingLinksOps.createLink({ ...BASE, co_host_emails: six }), "longer than 5");
    expect(demoSchedulingLinksOps.listLinks().owned.length).toBe(before);
    expect(demoSchedulingLinksOps.getLink(link.id).title).toBe(BASE.title);
    expect(coHosts(link.id)).toEqual(["bob@co.com:pending"]);
  });
});
