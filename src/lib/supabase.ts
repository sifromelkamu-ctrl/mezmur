import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const SUPABASE_PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;

// The publishable key is safe to expose client-side (it's the public-safe
// equivalent of Supabase's old "anon" key) — it only grants what Row Level
// Security policies allow, unlike the backend's secret key.
export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
