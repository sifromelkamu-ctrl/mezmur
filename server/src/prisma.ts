import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "./generated/prisma/client.js";

// pg's defaults are both "wait forever": connectionTimeoutMillis is 0 (no
// timeout acquiring a new connection) and there's no query_timeout at all.
// Against this project's flaky direct/IPv6 Supabase host, that turns any
// connectivity hiccup into an indefinite hang instead of a fast, catchable
// error — e.g. the YouTube catalog worker going completely silent mid-batch
// with no error and no crash, just stuck. Explicit timeouts here mean a bad
// connection fails fast and surfaces as a normal error instead.
const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL,
  connectionTimeoutMillis: 10_000,
  query_timeout: 20_000,
});

export const prisma = new PrismaClient({ adapter });
