import { TelegramClient } from "teleproto";
// Node's ESM loader doesn't do directory-index resolution for subpath
// imports (teleproto has no package.json "exports" map) — the explicit
// /index.js is required, not optional.
import { StringSession } from "teleproto/sessions/index.js";

// Lazy singleton MTProto client, authenticated as a real Telegram user
// account (not a bot — see telegramLogin.ts for why: bots can't read a
// channel's existing message history, only messages posted after they
// join). TELEGRAM_SESSION is captured once via that script and reused by
// the running server forever after, exactly like YTDLP_COOKIES_B64 is for
// yt-dlp — no interactive login happens inside the Express process itself.
let clientPromise: Promise<TelegramClient> | undefined;
// Guards reconnect attempts the same way clientPromise guards the initial
// connect — see the .connected check below for why this needs its own lock.
let reconnectPromise: Promise<boolean> | undefined;

export class TelegramNotConfiguredError extends Error {
  constructor() {
    super(
      "Telegram import isn't configured on this server (TELEGRAM_API_ID / TELEGRAM_API_HASH / TELEGRAM_SESSION are unset). Run server/scripts/telegramLogin.ts once to set them up."
    );
    this.name = "TelegramNotConfiguredError";
  }
}

export async function getTelegramClient(): Promise<TelegramClient> {
  const apiId = Number(process.env.TELEGRAM_API_ID);
  const apiHash = process.env.TELEGRAM_API_HASH?.trim();
  const session = process.env.TELEGRAM_SESSION?.trim();
  if (!apiId || !apiHash || !session) {
    throw new TelegramNotConfiguredError();
  }

  if (!clientPromise) {
    clientPromise = (async () => {
      const client = new TelegramClient(new StringSession(session), apiId, apiHash, {
        connectionRetries: 5,
      });
      await client.connect();
      return client;
    })().catch((err) => {
      // A failed connect attempt shouldn't wedge every future call behind a
      // permanently-rejected promise — clear the cache so the next request
      // gets a fresh attempt instead of the same stale failure forever.
      clientPromise = undefined;
      throw err;
    });
  }

  const client = await clientPromise;
  // The MTProto connection can drop mid-session (network blip, idle
  // timeout, a Telegram-side disconnect) without the cached promise itself
  // ever rejecting — a promise that already resolved once stays resolved
  // forever, so every subsequent call kept returning the same now-
  // disconnected client, failing every request with "Cannot send requests
  // while disconnected. Please reconnect." until the whole server was
  // restarted. Checking .connected on every call (not just at first
  // connect) means a dropped connection self-heals on the very next import
  // attempt instead of silently failing until someone notices and restarts.
  if (!client.connected) {
    // MUST be serialized: with CONCURRENCY items processing in parallel
    // (see telegram/worker.ts), several of them can all notice the same
    // dropped connection within the same tick and each independently call
    // client.connect() on this one client object at once. That opened
    // multiple overlapping sockets under a single session — from a single
    // process, no second server involved — which is exactly what Telegram's
    // own "concurrent usage from multiple connections" security check
    // detects, and it responds by permanently invalidating the session
    // (confirmed: this happened twice, requiring a full fresh login each
    // time). Only the first caller to notice actually reconnects; every
    // other concurrent caller awaits that same in-flight attempt instead of
    // starting its own.
    if (!reconnectPromise) {
      reconnectPromise = client.connect().finally(() => {
        reconnectPromise = undefined;
      });
    }
    await reconnectPromise;
  }
  return client;
}
