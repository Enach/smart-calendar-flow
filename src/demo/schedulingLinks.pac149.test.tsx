/**
 * PAC-149 AC-11 (spec §3.7, contract §5): the demo stops treating its
 * directory as the account check. It invites every well-formed address, never
 * shows a directory name on a pending entry, answers `not_added` only for a
 * malformed entry, and reports removed pending entries by address and status.
 */
import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";

import { HostAvatars } from "@/components/links/HostAvatars";
import { demoSchedulingLinksOps } from "./schedulingLinks";

const BASE = {
  title: "PAC-149 demo", slug: "pac-149-demo", durations: [30], days: ["mon" as const], window_start: "09:00",
  window_end: "17:00", buffer_before: 0, buffer_after: 0, min_notice_minutes: 0, usage_type: "reusable" as const,
};

describe("PAC-149 AC-11: the demo co-host list", () => {
  it("invites someone@unknown.example (not in its directory) as invited, with no name on the chip", () => {
    const out = demoSchedulingLinksOps.createLink({ ...BASE, co_host_emails: ["someone@unknown.example"] });
    expect(out.co_host_changes).toEqual({
      addresses: [{ email: "someone@unknown.example", outcome: "invited" }],
      removed: [],
      invited_count: 1,
      removed_count: 0,
      not_added_count: 0,
    });
    const pending = out.link.hosts.filter((h) => !h.is_owner);
    expect(pending).toEqual([{ email: "someone@unknown.example", is_owner: false, status: "pending" }]);
    const { container } = render(<HostAvatars hosts={out.link.hosts} />);
    expect(container.querySelector('[title="someone@unknown.example — awaiting acceptance"]')).not.toBeNull();
  });

  it("a directory address is invited exactly like an unknown one: no name, picture or account id on the pending entry", () => {
    const known = demoSchedulingLinksOps.createLink({ ...BASE, co_host_emails: ["alice@co.com"] });
    const unknown = demoSchedulingLinksOps.createLink({ ...BASE, co_host_emails: ["someone@unknown.example"] });
    const coHost = (hosts: typeof known.link.hosts) => hosts.filter((h) => !h.is_owner);
    expect(coHost(known.link.hosts)).toEqual([{ email: "alice@co.com", is_owner: false, status: "pending" }]);
    const mod = (v: unknown, addr: string) => JSON.stringify(v).split(addr).join("ADDR");
    expect(mod(known.co_host_changes, "alice@co.com")).toBe(mod(unknown.co_host_changes, "someone@unknown.example"));
    expect(mod(coHost(known.link.hosts), "alice@co.com")).toBe(mod(coHost(unknown.link.hosts), "someone@unknown.example"));
    // The chip never shows the directory's name.
    const { container } = render(<HostAvatars hosts={known.link.hosts} />);
    expect(container.innerHTML).not.toContain("Alice Martin");
  });

  it("answers not_added only for a malformed entry", () => {
    const out = demoSchedulingLinksOps.createLink({
      ...BASE, co_host_emails: ["not-an-address", "zz@nowhere.io", "bob@co.com"],
    });
    expect(out.co_host_changes?.addresses).toEqual([
      { email: "not-an-address", outcome: "not_added" },
      { email: "zz@nowhere.io", outcome: "invited" },
      { email: "bob@co.com", outcome: "invited" },
    ]);
    expect(out.co_host_changes).toMatchObject({ invited_count: 2, not_added_count: 1 });
  });

  it("a removed pending entry is reported by address and status, with no account id", () => {
    const { link } = demoSchedulingLinksOps.createLink({ ...BASE, co_host_emails: ["alice@co.com", "someone@unknown.example"] });
    const out = demoSchedulingLinksOps.updateLink(link.id, { co_host_emails: [] });
    expect(out.co_host_changes?.removed).toStrictEqual([
      { email: "alice@co.com", status: "pending" },
      { email: "someone@unknown.example", status: "pending" },
    ]);
  });
});
