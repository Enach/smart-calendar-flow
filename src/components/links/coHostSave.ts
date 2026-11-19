/**
 * PAC-112 (contract §5): the link editor's co-host rules that do not need React
 * — when a save carries the list, what the editor says after it, and whether it
 * stays open. Every count comes from the server's `co_host_changes`, never from
 * a client diff (contract §5.3).
 */
import type { SchedulingLinkCoHostChanges, SchedulingLinkSaveResult } from "@/api/schedulingLinks";

/** The editor refuses a chip beyond this many when adding (contract §5.2; hydrated chips above it stay). */
export const CO_HOST_ADD_CAP = 5;

export const CO_HOST_TEXT = {
  ownAddressRefused: "That's your own address — you're the link's owner.",
  duplicate: "This co-host is already added.",
  cap: "You can invite up to 5 co-hosts.",
  baselinePending: "Loading co-hosts…",
  baselineFailed:
    "Co-hosts can't be edited right now because the current list couldn't be loaded. Reopen the editor to try again.",
  fallback: "Paceday couldn't confirm which co-hosts were added — check the co-host list.",
  /**
   * PAC-149 (spec §3.7, contract §5): an invitation is to an address, and
   * Paceday sends no email. The sentence promises nothing about when, or
   * whether, the invitee sees it.
   */
  noEmail: "Paceday doesn't email invitations, so let them know.",
} as const;

const lower = (email: string) => email.trim().toLowerCase();

/**
 * Contract §5.1 "Changed": the chips differ from the baseline as sets of
 * addresses compared ignoring case. Removing a chip and adding it back, in any
 * case, is no change.
 */
export function coHostsChanged(chips: readonly string[], baseline: readonly string[]): boolean {
  const a = new Set(chips.map(lower));
  const b = new Set(baseline.map(lower));
  if (a.size !== b.size) return true;
  for (const email of a) if (!b.has(email)) return true;
  return false;
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/**
 * The success message (contract §5.3), one sentence per line:
 * `Link created.` / `Link updated.`, then — when the save carried the list —
 * the invited count (always, zero included), the removed count when > 0 and
 * the not-added count when > 0; or the fallback sentence when the answer has
 * no report. PAC-149: `not_added` means only "not a well-formed address" — the
 * server no longer looks addresses up, so nothing here depends on accounts.
 */
export function saveSummary(result: SchedulingLinkSaveResult, created: boolean): string[] {
  const lines = [created ? "Link created." : "Link updated."];
  if (!result.co_host_list_sent) return lines;
  const changes = result.co_host_changes;
  if (!changes) return [...lines, CO_HOST_TEXT.fallback];
  lines.push(
    changes.invited_count === 0
      ? "0 co-hosts invited."
      : `${plural(changes.invited_count, "co-host", "co-hosts")} invited. ${CO_HOST_TEXT.noEmail}`,
  );
  if (changes.removed_count > 0) lines.push(`Removed ${plural(changes.removed_count, "co-host", "co-hosts")}.`);
  if (changes.not_added_count > 0) {
    lines.push(
      changes.not_added_count === 1
        ? "1 address wasn't a valid email address."
        : `${changes.not_added_count} addresses weren't valid email addresses.`,
    );
  }
  return lines;
}

/**
 * One line per address that was not added or is the owner's own (contract
 * §5.3), in the order the server reported them, each address once.
 */
export function outcomeLines(changes: SchedulingLinkCoHostChanges | undefined): string[] {
  if (!changes) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const { email, outcome } of changes.addresses) {
    if (outcome !== "not_added" && outcome !== "own_address") continue;
    const key = `${outcome}|${lower(email)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(
      outcome === "not_added"
        ? `${email} isn't a valid email address.`
        : `${email} is your own address — you're the link's owner.`,
    );
  }
  return out;
}

/**
 * Contract §5.4: the editor stays open when some address was not added or is
 * the owner's own, and in the §5.3 fallback (a list was sent, no report came
 * back). Otherwise it closes as before.
 */
export function staysOpenAfter(result: SchedulingLinkSaveResult): boolean {
  if (!result.co_host_list_sent) return false;
  if (!result.co_host_changes) return true;
  return result.co_host_changes.addresses.some((a) => a.outcome === "not_added" || a.outcome === "own_address");
}
