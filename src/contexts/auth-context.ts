import { createContext } from "react";

import type { AuthUser } from "./AuthContext";

export interface AuthContextValue {
  user: AuthUser | null;
  isDemo: boolean;
  loading: boolean;
  /** True when /api/auth/me could not be refreshed (network/5xx) and the user shown is the last known one. */
  sessionStale: boolean;
  refresh: () => Promise<void>;
  loginDemo: () => void;
  exitDemo: () => void;
  logout: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextValue | null>(null);
