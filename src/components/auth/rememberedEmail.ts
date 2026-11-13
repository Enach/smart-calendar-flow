/**
 * PAC-97 D-10: the last email typed in the sign-in dialog, kept for this tab
 * only, so that after a failed or refused provider sign-in the landing notice
 * can offer the other provider with the same login hint.
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

export function rememberSignInEmail(email: string): void {
  try {
    window.sessionStorage.setItem(KEY, email);
  } catch {
    /* blocked storage: nothing is remembered */
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

export function forgetSignInEmail(): void {
  try {
    window.sessionStorage.removeItem(KEY);
  } catch {
    /* blocked storage: there is nothing to forget */
  }
}
