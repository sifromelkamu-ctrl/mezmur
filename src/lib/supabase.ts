import { Preferences } from "@capacitor/preferences";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const SUPABASE_PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;

// Session storage backed by Capacitor's Preferences plugin (native
// UserDefaults/SharedPreferences on iOS/Android, localStorage on web —
// Capacitor's own web fallback) instead of raw localStorage. Matters
// specifically for the native app build: a WKWebView's localStorage isn't
// guaranteed to survive every app update/reinstall the way a real native
// storage API is, which was silently logging users out on rebuilds. On
// web this behaves identically to Supabase's own localStorage default.
const capacitorAuthStorage = {
  getItem: async (key: string) => (await Preferences.get({ key })).value,
  setItem: async (key: string, value: string) => {
    await Preferences.set({ key, value });
  },
  removeItem: async (key: string) => {
    await Preferences.remove({ key });
  },
};

// The publishable key is safe to expose client-side (it's the public-safe
// equivalent of Supabase's old "anon" key) — it only grants what Row Level
// Security policies allow, unlike the backend's secret key.
export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    persistSession: true,
    storage: capacitorAuthStorage,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    // PKCE puts the verification payload in a `?code=` query param instead
    // of a `#access_token=...` URL fragment. That matters here specifically
    // because the app itself uses HashRouter (`#/route`) for navigation —
    // the implicit flow's fragment would collide with it, so a clicked
    // email-verification/password-reset link would never resolve correctly.
    flowType: "pkce",
  },
});
