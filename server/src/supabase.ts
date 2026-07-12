import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SECRET_KEY = process.env.SUPABASE_SECRET_KEY!;

// Server-only admin client. Uses the secret key, which bypasses Row Level
// Security and can perform Admin API actions (create/ban/delete users). Must
// never be imported by frontend code or have its key exposed to the client.
//
// `keepalive: false` on every request: under sustained load (this process
// spawns many yt-dlp/ffmpeg child processes for the YouTube import feature)
// requests through the default keep-alive connection pool started failing
// with a spurious "row-level security policy" error that a fresh process
// never reproduces — forcing a new connection per request avoids whatever
// pool/socket state was going bad.
export const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SECRET_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
  global: {
    fetch: (input, init) => fetch(input, { ...init, keepalive: false }),
  },
});
