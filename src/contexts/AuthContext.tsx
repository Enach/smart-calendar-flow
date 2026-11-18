import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { apiFetch, type ApiError } from "@/lib/api";
import { isApiHttpError } from "@/api/client";
import { clearDemoSession, isDemoSession, restoreStoresAfterDemo } from "@/api/demoGate";
import { forgetSignInEmail } from "@/components/auth/rememberedEmail";
import { AuthContext } from "./auth-context";
import type { components } from "@/api/generated/types";
import type { AuthContextValue } from "./auth-context";

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  /** The picture, under the contract's one name for it (CurrentUserResponse.avatarUrl, PAC-35). May be "". */
  avatarUrl?: string;
  /**
   * PAC-71: whether the account's address is domain-confirmed
   * (CurrentUserResponse.addressStanding). Absent only for the demo user.
   */
  addressStanding?: CurrentUserResponse["addressStanding"];
}

type CurrentUserResponse = components["schemas"]["CurrentUserResponse"];

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  // PAC-83: only a demo session of a non-production build (false otherwise).
  const [isDemo, setIsDemo] = useState<boolean>(() => isDemoSession());
  const [loading, setLoading] = useState(true);
  const [sessionStale, setSessionStale] = useState(false);
  // SF-004: the last sign-out the server did not confirm, or null.
  const [signOutFailure, setSignOutFailure] = useState<{ error: unknown } | null>(null);
  const mounted = useRef(true);

  useEffect(() => () => {
    mounted.current = false;
  }, []);

  /**
   * Re-reads /api/auth/me. Resolves to the user, to null when the server says
   * there is no session (401/403), or to undefined when it could not tell
   * (network failure, 5xx). The sign-in completion page needs that difference
   * (PAC-35 AC-6).
   */
  const refresh = useCallback(async (): Promise<AuthUser | null | undefined> => {
    try {
      const me = (await apiFetch<AuthUser>("/api/auth/me", { method: "GET" })) ?? null;
      // PAC-97 AC-26: a completed sign-in no longer needs the email the
      // sign-in dialog remembered for a provider switch.
      if (me) forgetSignInEmail();
      if (mounted.current) {
        setUser(me);
        setSessionStale(false);
      }
      return me;
    } catch (e) {
      const status = (e as ApiError)?.status;
      if (status === 401 || status === 403) {
        // Explicit authentication failure → the session is really gone.
        if (mounted.current) {
          setUser(null);
          setSessionStale(false);
          // The server has no session: an unconfirmed sign-out is now moot.
          setSignOutFailure(null);
        }
        return null;
      }
      // Network failure / 5xx / unreachable backend: keep the last known user
      // and mark the session as temporarily unavailable so the UI can retry.
      if (mounted.current) setSessionStale(true);
      return undefined;
    }
  }, []);

  // Initial /me probe.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (isDemo) {
        if (!cancelled) setLoading(false);
        return;
      }
      await refresh();
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [refresh, isDemo]);

  /**
   * Called by the demo entry control after it has started the demo session
   * (src/demo/DemoEntry.tsx, the only code that sets it). Does nothing when
   * no demo session exists, so no other caller can start one (PAC-83 AC-15b).
   */
  const enterDemo = useCallback((demoUser: AuthUser) => {
    if (!isDemoSession()) return;
    setIsDemo(true);
    setUser(demoUser);
  }, []);

  const exitDemo = useCallback(() => {
    clearDemoSession();
    restoreStoresAfterDemo();
    if (__PACEDAY_DEMO_BUILD__) {
      void import("@/demo/session").then((m) => m.endDemoSession());
    }
    setIsDemo(false);
    setUser(null);
    setSessionStale(false);
  }, []);

  /**
   * SF-004: resolves to true once the user is signed out, false when the
   * server did not confirm it. A failed POST /api/auth/logout leaves the
   * HttpOnly session cookie live (the contract's 500 says the cookie is NOT
   * expired; a lost answer says nothing), so the user is kept signed in here
   * and `signOutFailure` is set for the "not confirmed" alert. A 401 means the
   * server has no session for this browser, which is what sign-out wanted.
   */
  const logout = useCallback(async (): Promise<boolean> => {
    // PAC-97 AC-26: signing out forgets the email remembered for a switch.
    forgetSignInEmail();
    if (isDemo) {
      exitDemo();
      setSignOutFailure(null);
      return true;
    }
    try {
      await apiFetch("/api/auth/logout", { method: "POST" });
    } catch (e) {
      // A 401 (no session, or a superseded one) is "already signed out".
      if (!(isApiHttpError(e) && e.status === 401)) {
        if (mounted.current) setSignOutFailure({ error: e });
        return false;
      }
    }
    if (mounted.current) {
      setUser(null);
      setSessionStale(false);
      setSignOutFailure(null);
    }
    return true;
  }, [isDemo, exitDemo]);

  const dismissSignOutFailure = useCallback(() => setSignOutFailure(null), []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      isDemo,
      loading,
      sessionStale,
      signOutFailure,
      refresh,
      enterDemo,
      exitDemo,
      logout,
      dismissSignOutFailure,
    }),
    [user, isDemo, loading, sessionStale, signOutFailure, refresh, enterDemo, exitDemo, logout, dismissSignOutFailure],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
