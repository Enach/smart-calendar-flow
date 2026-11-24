/** SF-004: the wording of a sign-out the server did not confirm. */
import { API_MESSAGES, apiFailureMessage, classifyApiFailure, isApiHttpError } from "@/api/client";

export const SIGN_OUT_NOT_CONFIRMED_TITLE = "Sign-out not confirmed";
export const SIGN_OUT_NOT_CONFIRMED_TEXT =
  "Paceday didn't confirm that you're signed out, so you are still signed in on this device. If this is a shared computer, don't leave it until sign-out is confirmed.";
/**
 * PAC-69 gave the same sentence one home in API_MESSAGES; SF-004 now reads it
 * from there rather than keeping its own copy of the wording.
 */
const SERVER_PROBLEM = API_MESSAGES.serverProblem;

/**
 * Why the sign-out was not confirmed, in the PAC-83 wording. Retrying a
 * sign-out is safe (it only expires this browser's cookie), so a lost answer
 * gets the read wording, which offers a retry, not the write one. An HTTP
 * error answer is worded from its status alone: a body's `error`, `message`
 * or `detail` is server or proxy text and is never shown word for word.
 */
export function signOutFailureReason(error: unknown): string {
  if (classifyApiFailure(error) !== "http") return apiFailureMessage(error, "read").message;
  if (!isApiHttpError(error)) return "";
  if (error.status >= 500) return SERVER_PROBLEM;
  return `Paceday answered with an error (HTTP ${error.status}). Try again shortly.`;
}
