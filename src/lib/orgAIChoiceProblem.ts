import { apiErrorMessage, isApiHttpError } from "@/api/client";
import { effectOf } from "@/api/effects";

/**
 * PAC-122 SF-090: the dialog's text when the confirmation was recorded and the
 * choice write (PATCH /api/settings) failed. Only a 4xx refusal is a definite
 * "not saved". Every other failure may follow a committed save: a lost answer,
 * the request budget's 503, a cancelled request, any 5xx (the server answers
 * 500 when the re-read after a committed save fails: "Load, save or re-read
 * failure"), or an answer that could not be read.
 */
export function choiceProblemText(choiceError: unknown): string {
  if (isApiHttpError(choiceError) && choiceError.status >= 400 && choiceError.status < 500) {
    return (
      "Your confirmation was recorded, but \"Use my organisation's AI\" was not saved (" +
      apiErrorMessage(choiceError, effectOf("standalone.chooseOrganizationAIChoice")).replace(/\.$/, "") +
      "). Try again, or choose it in Settings."
    );
  }
  return "Your confirmation was recorded. Paceday could not confirm whether \"Use my organisation's AI\" was saved; check Settings before trying again.";
}
