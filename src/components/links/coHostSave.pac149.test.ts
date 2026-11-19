/**
 * PAC-149 AC-11 (spec §3.7, contract §5): a co-host invitation is to an
 * address. The save summary promises nothing about the invitee having an
 * account, and `not_added` now means only "not a well-formed address".
 */
import { describe, expect, it } from "vitest";

import type { SchedulingLinkCoHostChanges, SchedulingLinkSaveResult } from "@/api/schedulingLinks";
import type { SchedulingLink } from "@/api/types";
import { CO_HOST_TEXT, outcomeLines, saveSummary, staysOpenAfter } from "./coHostSave";

const LINK = { id: "l1" } as SchedulingLink;
const NEW_SENTENCE = "Paceday doesn't email invitations, so let them know.";

function changes(partial: Partial<SchedulingLinkCoHostChanges>): SchedulingLinkCoHostChanges {
  return { addresses: [], removed: [], invited_count: 0, removed_count: 0, not_added_count: 0, ...partial };
}
const result = (c: SchedulingLinkCoHostChanges): SchedulingLinkSaveResult => ({ link: LINK, co_host_changes: c, co_host_list_sent: true });

describe("PAC-149 AC-11: the save summary", () => {
  it("for invited_count 2 says the new sentence and not 'they can accept from Paceday'", () => {
    const lines = saveSummary(result(changes({ invited_count: 2 })), true);
    expect(lines).toEqual(["Link created.", `2 co-hosts invited. ${NEW_SENTENCE}`]);
    expect(lines.join(" ")).not.toContain("they can accept from Paceday");
    expect(CO_HOST_TEXT.noEmail).toBe(NEW_SENTENCE);
  });

  it("for one invitation, singular, with the same sentence", () => {
    expect(saveSummary(result(changes({ invited_count: 1 })), false)).toEqual(["Link updated.", `1 co-host invited. ${NEW_SENTENCE}`]);
  });

  it("names the not-added count as addresses that weren't valid email addresses", () => {
    expect(saveSummary(result(changes({ not_added_count: 1 })), false)).toContain("1 address wasn't a valid email address.");
    expect(saveSummary(result(changes({ not_added_count: 3 })), false)).toContain("3 addresses weren't valid email addresses.");
    for (const line of saveSummary(result(changes({ invited_count: 1, not_added_count: 2 })), false)) {
      expect(line).not.toMatch(/couldn't be added/);
    }
  });
});

describe("PAC-149 AC-11: a not_added entry is named as not a valid email address", () => {
  it("one line per malformed address; the own-address line is unchanged", () => {
    const c = changes({
      addresses: [
        { email: "not-an-address", outcome: "not_added" },
        { email: "someone@unknown.example", outcome: "invited" },
        { email: "Me@co.com", outcome: "own_address" },
      ],
      invited_count: 1,
      not_added_count: 1,
    });
    expect(outcomeLines(c)).toEqual([
      "not-an-address isn't a valid email address.",
      "Me@co.com is your own address — you're the link's owner.",
    ]);
    // The editor still stays open on any not_added or own_address (today's rule).
    expect(staysOpenAfter(result(c))).toBe(true);
  });

  it("an invited address produces no line and does not keep the editor open", () => {
    const c = changes({ addresses: [{ email: "someone@unknown.example", outcome: "invited" }], invited_count: 1 });
    expect(outcomeLines(c)).toEqual([]);
    expect(staysOpenAfter(result(c))).toBe(false);
  });
});
