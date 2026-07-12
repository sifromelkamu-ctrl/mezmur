import { useCallback, useEffect, useState, type ReactNode } from "react";
import { authApi, type ApiUser } from "../lib/api";
import { supabase } from "../lib/supabase";
import { AuthContext } from "./auth-context-value";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<ApiUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Supabase persists its own session in localStorage and handles token
    // refresh automatically; on mount we just check whether a session is
    // already there and, if so, hydrate the profile from our backend.
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) {
        setLoading(false);
        return;
      }
      authApi
        .me()
        .then(({ user }) => setUser(user))
        .catch(() => supabase.auth.signOut())
        .finally(() => setLoading(false));
    });

    const { data: subscription } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") setUser(null);
    });
    return () => subscription.subscription.unsubscribe();
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    setError(null);
    try {
      const { token, refreshToken, user } = await authApi.login(email, password);
      await supabase.auth.setSession({ access_token: token, refresh_token: refreshToken });
      setUser(user);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
      throw err;
    }
  }, []);

  const register = useCallback(async (email: string, password: string, name?: string) => {
    setError(null);
    try {
      const { token, refreshToken, user } = await authApi.register(email, password, name);
      await supabase.auth.setSession({ access_token: token, refresh_token: refreshToken });
      setUser(user);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Registration failed");
      throw err;
    }
  }, []);

  const updateName = useCallback(async (name: string) => {
    setError(null);
    try {
      const { user } = await authApi.updateMe(name);
      setUser(user);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update name");
      throw err;
    }
  }, []);

  const logout = useCallback(() => {
    supabase.auth.signOut();
    setUser(null);
  }, []);

  const clearError = useCallback(() => setError(null), []);

  return (
    <AuthContext.Provider value={{ user, loading, error, login, register, updateName, logout, clearError }}>
      {children}
    </AuthContext.Provider>
  );
}
