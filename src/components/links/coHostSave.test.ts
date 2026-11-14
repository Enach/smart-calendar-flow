import { describe, expect, it } from "vitest";

import type { SchedulingLinkCoHostChanges, SchedulingLinkSaveResult } from "@/api/schedulingLinks";
import type { SchedulingLink } from "@/api/types";
import { CO_HOST_TEXT, coHostsChanged, outcomeLines, saveSummary, staysOpenAfter } from "./coHostSave";

// PAC-112 contract §5.1, §5.3, §5.4: the editor's pure co-host rules.

const LINK = { id: "l1" } as SchedulingLink;

function changes(partial: Partial<SchedulingLinkCoHostChanges>): SchedulingLinkCoHostChanges {
  return { addresses: [], removed: [], invited_count: 0, removed_count: 0, not_added_count: 0, ...partial };
}
function result(c: SchedulingLinkCoHostChanges | undefined, sent = true): SchedulingLinkSaveResult {
  return { link: LINK, co_host_changes: c, co_host_list_sent: sent };
}

const FORBIDDEN = /sent|email|no paceday account/i;

describe("coHostsChanged (contract §5.1)", () => {
  it("compares sets of addresses ignoring case and order", () => {
    expect(coHostsChanged(["E@co.com"], ["e@co.com"])).toBe(false);
    expect(coHostsChanged(["b@co.com", "a@co.com"], ["A@co.com", "B@co.com"])).toBe(false);
    expect(coHostsChanged([], [])).toBe(false);
  });

  it("is a change when an address is added, removed or replaced, the last one included", () => {
    expect(coHostsChanged(["g@co.com"], ["e@co.com"])).toBe(true);
    expect(coHostsChanged([], ["e@co.com"])).toBe(true);
    expect(coHostsChanged(["e@co.com", "g@co.com"], ["e@co.com"])).toBe(true);
  });
});

describe("saveSummary (contract §5.3, AC-12)", () => {
  it("states exactly the answer's counts", () => {
    const lines = saveSummary(result(changes({ invited_count: 2, removed_count: 1, not_added_count: 1 })), false);
    expect(lines).toEqual([
      "Link updated.",
      "2 co-hosts invited — they can accept from Paceday.",
      "Removed 1 co-host.",
      "1 address couldn't be added as a co-host.",
    ]);
  });

  it("singular and plural forms", () => {
    expect(saveSummary(result(changes({ invited_count: 1, removed_count: 2, not_added_count: 2 })), true)).toEqual([
      "Link created.",
      "1 co-host invited — they can accept from Paceday.",
      "Removed 2 co-hosts.",
      "2 addresses couldn't be added as a co-host.",
    ]);
  });

  it("says zero when the answer says zero, whatever the client added", () => {
    expect(saveSummary(result(changes({ addresses: [{ email: "g@co.com", outcome: "already_host" }] })), false)).toEqual([
      "Link updated.",
      "0 co-hosts invited.",
    ]);
  });

  it("only the base text when no list was sent", () => {
    expect(saveSummary(result(undefined, false), true)).toEqual(["Link created."]);
    expect(saveSummary(result(undefined, false), false)).toEqual(["Link updated."]);
  });

  it("the fallback when a list was sent and the answer has no report (spec §7)", () => {
    expect(saveSummary(result(undefined), false)).toEqual(["Link updated.", CO_HOST_TEXT.fallback]);
    expect(CO_HOST_TEXT.fallback).toBe("Paceday couldn't confirm which co-hosts were added — check the co-host list.");
  });

  it("never says sent, email or no Paceday account", () => {
    const all = [
      ...saveSummary(result(changes({ invited_count: 3, removed_count: 3, not_added_count: 3 })), true),
      ...saveSummary(result(undefined), true),
      ...outcomeLines(changes({ addresses: [{ email: "x@y.io", outcome: "not_added" }, { email: "me@y.io", outcome: "own_address" }] })),
    ];
    // The address itself is not wording; check the text around it.
    for (const line of all) expect(line.replace(/\S+@\S+/g, "ADDR")).not.toMatch(FORBIDDEN);
  });
});

describe("outcomeLines (contract §5.3, AC-11)", () => {
  it("names each address that was not added and the owner's own, in order, once each", () => {
    const lines = outcomeLines(
      changes({
        addresses: [
          { email: "E@acme.com", outcome: "already_host" },
          { email: "g@acme.com", outcome: "invited" },
          { email: "c@nowhere.io", outcome: "not_added" },
          { email: "a@acme.com", outcome: "own_address" },
          { email: "C@nowhere.io", outcome: "not_added" },
        ],
      }),
    );
    expect(lines).toEqual([
      "c@nowhere.io couldn't be added as a co-host.",
      "a@acme.com is your own address — you're the link's owner.",
    ]);
    expect(outcomeLines(undefined)).toEqual([]);
  });
});

describe("staysOpenAfter (contract §5.4)", () => {
  it("stays open for not_added or own_address, and in the fallback", () => {
    expect(staysOpenAfter(result(changes({ addresses: [{ email: "c@x.io", outcome: "not_added" }] })))).toBe(true);
    expect(staysOpenAfter(result(changes({ addresses: [{ email: "a@x.io", outcome: "own_address" }] })))).toBe(true);
    expect(staysOpenAfter(result(undefined))).toBe(true);
  });

  it("closes otherwise", () => {
    expect(staysOpenAfter(result(changes({ addresses: [{ email: "g@x.io", outcome: "invited" }] })))).toBe(false);
    expect(staysOpenAfter(result(changes({})))).toBe(false);
    expect(staysOpenAfter(result(undefined, false))).toBe(false);
  });
});
