/**
 * PAC-97 D-10: the last email typed in the sign-in dialog, kept for this tab
 * only, so that after a failed or refused provider sign-in the landing notice
 * can offer the other provider with the same login hint.
 *
 * PAC-98 D-7: the kind of that address (what sign-in detection said about it)
 * is kept next to it, under the same rules, so the failure return can offer
 * the step that fits the address without asking the server again. The web
 * holds no copy of the consumer list: the kind comes from detection only.
 *
 * - `sessionStorage` only: tab-scoped, gone when the tab closes. Never
 *   localStorage, IndexedDB, a cookie or a URL (the provider start's
 *   `login_hint` is the only place the address travels, and that is the
 *   dialog's doing, not this module's).
 * - This module never sends the address anywhere.
 * - Every storage access is guarded: blocked storage (private mode, a sandbox,
 *   a quota error) degrades to "nothing remembered", never to an error.
 * - Cleared on a completed sign-in and on sign-out (AuthContext).
 */
const KEY = "paceday:signin-email";
const KIND_KEY = "paceday:signin-email-kind";

/**
 * - `personal`: detection answered `generic` (a personal address: the
 *   personal-address step, Google only until PAC-77).
 * - `company`: any other answer (the PAC-97 provider choice).
 */
export type SignInEmailKind = "personal" | "company";

/**
 * Remembers the typed email. A new email has no known kind yet, so any kind
 * remembered for an earlier one is dropped.
 */
export function rememberSignInEmail(email: string): void {
  try {
    window.sessionStorage.setItem(KEY, email);
    window.sessionStorage.removeItem(KIND_KEY);
  } catch {
    /* blocked storage: nothing is remembered */
  }
}

/** Records the kind of the remembered email, once detection has answered. */
export function rememberSignInEmailKind(kind: SignInEmailKind): void {
  try {
    window.sessionStorage.setItem(KIND_KEY, kind);
  } catch {
    /* blocked storage: the kind is found again by one detection request */
  }
}

export function readRememberedSignInEmail(): string | null {
  try {
    const value = window.sessionStorage.getItem(KEY);
    return value && value.trim() !== "" ? value : null;
  } catch {
    return null;
  }
}

/** The kind of the remembered email, or null when it is not known. */
export function readRememberedSignInEmailKind(): SignInEmailKind | null {
  try {
    const value = window.sessionStorage.getItem(KIND_KEY);
    return value === "personal" || value === "company" ? value : null;
  } catch {
    return null;
  }
}

export function forgetSignInEmail(): void {
  try {
    window.sessionStorage.removeItem(KEY);
    window.sessionStorage.removeItem(KIND_KEY);
  } catch {
    /* blocked storage: there is nothing to forget */
  }
}
