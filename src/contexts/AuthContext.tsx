import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { apiFetch, type ApiError } from "@/lib/api";
import { DEMO_SESSION_KEY, setMockMode } from "@/api/client";
import { seedDemoEvents, clearDemoEvents } from "@/lib/demoData";
import { AuthContext } from "./auth-context";
import type { AuthContextValue } from "./auth-context";

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  /** The picture, under the contract's one name for it (CurrentUserResponse.avatarUrl, PAC-35). May be "". */
  avatarUrl?: string;
}

const DEMO_USER: AuthUser = {
  id: "demo",
  name: "Alex Demo",
  email: "alex@demo.paceday.com",
};

const DEMO_FLAG = DEMO_SESSION_KEY;

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isDemo, setIsDemo] = useState<boolean>(() => {
    try {
      return sessionStorage.getItem(DEMO_FLAG) === "1";
    } catch {
      return false;
    }
  });
  const [loading, setLoading] = useState(true);
  const [sessionStale, setSessionStale] = useState(false);
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
        }
        return null;
      }
      // Network failure / 5xx / unreachable backend: keep the last known user
      // and mark the session as temporarily unavailable so the UI can retry.
      if (mounted.current) setSessionStale(true);
      return undefined;
    }
  }, []);


  // Restore demo mock state if the flag is set on mount.
  useEffect(() => {
    if (isDemo) {
      seedDemoEvents();
      setMockMode(true);
    }
    // intentionally only on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  const loginDemo = useCallback(() => {
    seedDemoEvents();
    setMockMode(true);
    try {
      sessionStorage.setItem(DEMO_FLAG, "1");
    } catch {
      /* ignore */
    }
    setIsDemo(true);
    setUser(DEMO_USER);
  }, []);

  const exitDemo = useCallback(() => {
    clearDemoEvents();
    setMockMode(false);
    try {
      sessionStorage.removeItem(DEMO_FLAG);
    } catch {
      /* ignore */
    }
    setIsDemo(false);
    setUser(null);
    setSessionStale(false);
  }, []);

  const logout = useCallback(async () => {
    if (isDemo) {
      exitDemo();
      return;
    }
    try {
      await apiFetch("/api/auth/logout", { method: "POST" });
    } catch {
      /* even if it fails, clear local state */
    }
    setUser(null);
    setSessionStale(false);
  }, [isDemo, exitDemo]);

  const value = useMemo<AuthContextValue>(
    () => ({ user, isDemo, loading, sessionStale, refresh, loginDemo, exitDemo, logout }),
    [user, isDemo, loading, sessionStale, refresh, loginDemo, exitDemo, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
