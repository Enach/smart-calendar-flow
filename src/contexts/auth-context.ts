import { createContext } from "react";

import type { AuthUser } from "./AuthContext";

export interface AuthContextValue {
  user: AuthUser | null;
  isDemo: boolean;
  loading: boolean;
  refresh: () => Promise<void>;
  loginDemo: () => void;
  exitDemo: () => void;
  logout: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextValue | null>(null);
