import { useCallback, useEffect, useState, type ReactNode } from "react";
import { authApi, type ApiUser, type UpdateProfileInput } from "../lib/api";
import { supabase } from "../lib/supabase";
import { AuthContext } from "./auth-context-value";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<ApiUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isPasswordRecovery, setIsPasswordRecovery] = useState(false);

  const loadProfile = useCallback(async (stampLogin: boolean) => {
    try {
      if (stampLogin) {
        const { user: profile } = await authApi.touchLogin();
        setUser(profile);
      } else {
        const { user: profile } = await authApi.me();
        setUser(profile);
      }
    } catch {
      // Profile row not created yet (trigger racing the client) or token
      // invalid — sign out rather than leave a half-authenticated state.
      await supabase.auth.signOut();
      setUser(null);
    }
  }, []);

  useEffect(() => {
    // Supabase persists its own session (localStorage) and handles token
    // refresh automatically; on mount we just check whether a session is
    // already there and, if so, hydrate the profile from our backend. This
    // also transparently covers the PKCE `?code=` redirect landing from a
    // clicked email verification/password-reset link — supabase-js
    // exchanges it before getSession() resolves.
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) {
        setLoading(false);
        return;
      }
      loadProfile(false).finally(() => setLoading(false));
    });

    const { data: subscription } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") {
        setUser(null);
      } else if (event === "PASSWORD_RECOVERY") {
        // Landed here from a clicked "reset your password" email link.
        // Don't stamp a login or treat this as a normal session yet — the
        // Auth screen watches this flag and forces a "set new password"
        // step first.
        setIsPasswordRecovery(true);
      } else if (event === "SIGNED_IN") {
        // Fires once per real sign-in (password login, or the moment an
        // email link / SMS code finishes verifying a fresh signup) — never
        // on a silent background token refresh — so this is exactly the
        // "post authentication" hook: stamp lastLoginAt and load the
        // profile the DB trigger already created.
        loadProfile(true);
      }
    });
    return () => subscription.subscription.unsubscribe();
  }, [loadProfile]);

  const updateProfile = useCallback(async (input: UpdateProfileInput) => {
    setError(null);
    try {
      const { user: profile } = await authApi.updateMe(input);
      setUser(profile);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update profile");
      throw err;
    }
  }, []);

  const updateName = useCallback((name: string) => updateProfile({ name }), [updateProfile]);

  const refreshUser = useCallback(async () => {
    try {
      const { user: profile } = await authApi.me();
      setUser(profile);
    } catch {
      // Leave existing state as-is — this is a best-effort refresh, not a
      // session check (loadProfile/getSession already own that).
    }
  }, []);

  const logout = useCallback(async () => {
    await supabase.auth.signOut();
    setUser(null);
  }, []);

  const clearError = useCallback(() => setError(null), []);
  const clearPasswordRecovery = useCallback(() => setIsPasswordRecovery(false), []);

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        error,
        isPasswordRecovery,
        clearPasswordRecovery,
        updateProfile,
        updateName,
        refreshUser,
        logout,
        clearError,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
