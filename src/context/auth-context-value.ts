import { createContext } from "react";
import type { ApiUser, UpdateProfileInput } from "../lib/api";

export interface AuthContextValue {
  user: ApiUser | null;
  loading: boolean;
  error: string | null;
  // True after landing back from a clicked "reset your password" email
  // link (a fresh page load, so there's no in-page state to rely on) —
  // the app should show the "set a new password" screen instead of
  // treating this as a normal logged-in session. Cleared once a new
  // password is actually set.
  isPasswordRecovery: boolean;
  clearPasswordRecovery: () => void;
  updateProfile: (input: UpdateProfileInput) => Promise<void>;
  updateName: (name: string) => Promise<void>;
  refreshUser: () => Promise<void>;
  logout: () => Promise<void>;
  clearError: () => void;
}

export const AuthContext = createContext<AuthContextValue | null>(null);
