import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { apiFetch, type ApiError } from "@/lib/api";
import { setMockMode } from "@/api/client";
import { seedDemoEvents, clearDemoEvents } from "@/lib/demoData";

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  avatar?: string;
}

interface AuthContextValue {
  user: AuthUser | null;
  isDemo: boolean;
  loading: boolean;
  /** Re-fetch /api/auth/me — used after OAuth callbacks and email login. */
  refresh: () => Promise<void>;
  /** Drop into demo mode without touching the backend. */
  loginDemo: () => void;
  /** Exit demo (clears local mock state) and returns to anonymous. */
  exitDemo: () => void;
  /** Signs the user out — POST /auth/logout, then clear state. */
  logout: () => Promise<void>;
}

const DEMO_USER: AuthUser = {
  id: "demo",
  name: "Alex Demo",
  email: "alex@demo.paceday.com",
};

const DEMO_FLAG = "paceday:demo";

const AuthContext = createContext<AuthContextValue | null>(null);

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

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
