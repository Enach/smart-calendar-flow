import { createContext } from "react";

import type { AuthUser } from "./AuthContext";

export interface AuthContextValue {
  user: AuthUser | null;
  isDemo: boolean;
  loading: boolean;
  /** True when /api/auth/me could not be refreshed (network/5xx) and the user shown is the last known one. */
  sessionStale: boolean;
  /**
   * SF-004: set when the server did not confirm the last sign-out (network
   * failure, timeout, 5xx). The user is still signed in; null otherwise.
   */
  signOutFailure: { error: unknown } | null;
  /** Resolves to the user, null when there is no session, or undefined when the server could not tell. */
  refresh: () => Promise<AuthUser | null | undefined | void>;
  /** Only the demo entry control calls this, after starting the demo session (PAC-83). */
  enterDemo: (user: AuthUser) => void;
  exitDemo: () => void;
  /** Resolves to true once signed out, false when the server did not confirm it (SF-004). */
  logout: () => Promise<boolean>;
  dismissSignOutFailure: () => void;
}

export const AuthContext = createContext<AuthContextValue | null>(null);
