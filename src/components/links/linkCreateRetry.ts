/**
 * PAC-119 (contract §7.4): what the link editor does with the answer to a
 * keyed create that failed, and the exact texts it shows. Pure: no React, no
 * request. The editor (LinkEditDrawer) owns the key and acts on the result.
 */
import { isAnswerLost, isApiHttpError, isBudgetExpired } from "@/api/client";
import { linkCreateConflict } from "@/api/schedulingLinks";

export const LINK_CREATE_TEXT = {
  /** A lost answer, the budget 503 or any other 5xx on a create. Never "refresh to check" (AC-19). */
  outcomeUnknown:
    "Paceday didn't confirm that this link was created. Press Create link again — it won't create a second link.",
  keyReused:
    "Your earlier save already created this link. What you changed since, co-hosts included, is not saved yet — press Save changes to apply it to this link.",
  keyReusedBaselineFailed:
    "Your earlier save already created this link. Its co-hosts couldn't be loaded, so your co-host changes can't be applied yet. Press Save changes to apply your other changes to this link, then open it from the Links page to change its co-hosts.",
  /** Claims no change (spec §3.8 item 3): the owner may have changed nothing. */
  keyExpired:
    "Your earlier save, more than a day ago, already created this link. This form now edits it — press Save changes to save the form to this link.",
  keyExpiredBaselineFailed:
    "Your earlier save, more than a day ago, already created this link. This form now edits it, but its co-hosts couldn't be loaded, so co-host changes can't be applied yet. Press Save changes to save the other fields to this link, then open it from the Links page to change its co-hosts.",
  keyDeleted: "The link your earlier save created has since been deleted. Press Create link to create a new link.",
  /**
   * The co-host section's reason after a link refusal whose baseline read
   * failed: PAC-112's text without "Reopen the editor", since closing would
   * discard the unsaved edits the refusal text asks the owner to save (spec
   * §3.8 item 5, contract challenge M-1). The alert above points to the Links page.
   */
  coHostsBlockedAfterRefusal: "Co-hosts can't be edited right now because the current list couldn't be loaded.",
} as const;

/** Which of the two refusals that name a live link (`link_id`). */
export type LinkRefusal = "used" | "expired";

export type CreateFailure =
  /** Nobody knows whether the link was created: keep the key, set "outcome unknown". */
  | { kind: "outcome-unknown" }
  /** The key already created live link `linkId`: become its editor. */
  | { kind: "link-refusal"; refusal: LinkRefusal; linkId: string }
  /** The key's link was deleted: stay a create editor, drop the key. */
  | { kind: "deleted" }
  /** Anything else (slug 409, 400, 422, 401, other 4xx): today's handling, key kept. */
  | { kind: "other" };

/** Contract §7.4: the editor's branch for a failed create, decided on the status and the 409's `error`. */
export function classifyCreateFailure(e: unknown): CreateFailure {
  if (isAnswerLost(e) || isBudgetExpired(e) || (isApiHttpError(e) && e.status >= 500)) {
    return { kind: "outcome-unknown" };
  }
  const conflict = linkCreateConflict(e);
  if (conflict) {
    switch (conflict.error) {
      case "idempotency key already used":
        return { kind: "link-refusal", refusal: "used", linkId: conflict.link_id };
      case "idempotency key expired":
        return { kind: "link-refusal", refusal: "expired", linkId: conflict.link_id };
      case "idempotency key already used by a deleted link":
        return { kind: "deleted" };
      case "slug already exists":
        return { kind: "other" };
    }
  }
  return { kind: "other" };
}

/** The editor's message after a link refusal, once its baseline read has answered or failed. */
export function linkRefusalText(refusal: LinkRefusal, baselineFailed: boolean): string {
  if (refusal === "expired") return baselineFailed ? LINK_CREATE_TEXT.keyExpiredBaselineFailed : LINK_CREATE_TEXT.keyExpired;
  return baselineFailed ? LINK_CREATE_TEXT.keyReusedBaselineFailed : LINK_CREATE_TEXT.keyReused;
}
