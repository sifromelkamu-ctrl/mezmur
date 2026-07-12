import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const SUPABASE_PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;

// The publishable key is safe to expose client-side (it's the public-safe
// equivalent of Supabase's old "anon" key) — it only grants what Row Level
// Security policies allow, unlike the backend's secret key.
export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    persistSession: true,
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
