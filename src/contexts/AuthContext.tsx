import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { apiFetch, type ApiError } from "@/lib/api";
import { setMockMode } from "@/api/client";
import { seedDemoEvents, clearDemoEvents } from "@/lib/demoData";
import { AuthContext } from "./auth-context";
import type { AuthContextValue } from "./auth-context";

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  avatar?: string;
}

const DEMO_USER: AuthUser = {
  id: "demo",
  name: "Alex Demo",
  email: "alex@demo.paceday.com",
};

const DEMO_FLAG = "paceday:demo";

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
  const mounted = useRef(true);

  useEffect(() => () => {
    mounted.current = false;
  }, []);

  const refresh = useCallback(async () => {
    try {
      const me = await apiFetch<AuthUser>("/api/auth/me", { method: "GET" });
      if (mounted.current) setUser(me ?? null);
    } catch (e) {
      const err = e as ApiError;
      // 401 → not logged in. Network/other errors → also leave unauthenticated.
      // We do NOT auto-enter demo here: that's a user-initiated action.
      if (mounted.current && err?.status !== 200) setUser(null);
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
  }, [isDemo, exitDemo]);

  const value = useMemo<AuthContextValue>(
    () => ({ user, isDemo, loading, refresh, loginDemo, exitDemo, logout }),
    [user, isDemo, loading, refresh, loginDemo, exitDemo, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
