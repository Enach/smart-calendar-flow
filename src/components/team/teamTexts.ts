/**
 * PAC-129 (contract §9): the exact web texts of the team add, invite, removal,
 * Find a time and analytics surfaces. `{x}` in the contract is a parameter
 * here; nothing else varies. Kept in one place so the tests and the e2e suite
 * read the same spelling the components render.
 */
import type { TeamInviteOutcome } from "@/api/teams";
import { UI_LOCALE } from "@/lib/locale";

export { ADDED_PERSON_LABEL } from "@/api/teams";

/** §9.2 */
export const ADD_TO_TEAM_BUTTON = "Add to team";
export const ADD_TO_TEAM_TITLE = "Add to team without Paceday access";
export const ADD_TO_TEAM_NOTICE =
  "You are responsible for having a reason to add this person. Paceday sends them no email. " +
  "Every member of this team will see their name and email. Whenever any member uses Find a time, " +
  "their free/busy is read through your calendar connection.";

export function addedText(nameOrEmail: string): string {
  return `${nameOrEmail} added.`;
}

/** §9.1: a pending invitation on an added person, shown to owners only. */
export function invitedUntilText(expiresAt: string): string {
  const date = new Date(expiresAt).toLocaleDateString(UI_LOCALE, { month: "short", day: "numeric", year: "numeric" });
  return `Invited · expires ${date}`;
}

/** §9.3 */
export const INVITE_TO_PACEDAY = "Invite to Paceday";

export function inviteOutcomeText(outcome: TeamInviteOutcome["outcome"], email: string): string {
  switch (outcome) {
    case "added_and_invited":
      return `${email} added to the team and invited to Paceday.`;
    case "invited":
      return `${email} invited to Paceday. They were already on the team.`;
    case "already_pending":
      return `${email} already has a pending invitation.`;
    case "already_member":
      return `${email} is already a Paceday member of this team.`;
  }
}

/** §9.4 */
export function removedText(nameOrEmail: string): string {
  return `${nameOrEmail} removed.`;
}

export function notOnTeamText(email: string): string {
  return `${email} is not on this team.`;
}

/** §9.6 */
export function slotCountsText(slot: { free_count: number; unknown_count: number; total_count: number }): string {
  const base = `${slot.free_count} of ${slot.total_count} free`;
  return slot.unknown_count > 0 ? `${base} · ${slot.unknown_count} unknown` : base;
}

/** §9.7 */
export const ANALYTICS_NO_DATA = "No data";
export const ANALYTICS_WITHHELD = "Visible to team owners only";
export const ANALYTICS_AVAILABILITY_ONLY = "Availability only";

/** §9.8 */
export const MANAGER_ADDED_HINT = "Added to the team without Paceday access. Add them with Add person to track 1:1s.";
export const MANAGER_ANALYTICS_ADDED_HINT =
  "Added to the team without Paceday access. Team owners see their availability in the team's Analytics tab.";
