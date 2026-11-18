import { apiErrorMessage, classifyApiFailure } from "@/api/client";
import { effectOf } from "@/api/effects";

/** PAC-122 SF-090: the dialog's text when the confirmation was recorded and the choice write failed. */
export function choiceProblemText(choiceError: unknown): string {
  switch (classifyApiFailure(choiceError)) {
    case "lost":
    case "budget":
    case "cancelled":
      return "Your confirmation was recorded. Paceday could not confirm whether \"Use my organisation's AI\" was saved; check Settings before trying again.";
    default:
      return (
        "Your confirmation was recorded, but \"Use my organisation's AI\" was not saved (" +
        apiErrorMessage(choiceError, effectOf("standalone.chooseOrganizationAIChoice")).replace(/\.$/, "") +
        "). Try again, or choose it in Settings."
      );
  }
}
