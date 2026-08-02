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

export class TelegramNotConfiguredError extends Error {
  constructor() {
    super(
      "Telegram import isn't configured on this server (TELEGRAM_API_ID / TELEGRAM_API_HASH / TELEGRAM_SESSION are unset). Run server/scripts/telegramLogin.ts once to set them up."
    );
    this.name = "TelegramNotConfiguredError";
  }
}

export function getTelegramClient(): Promise<TelegramClient> {
  if (clientPromise) return clientPromise;

  const apiId = Number(process.env.TELEGRAM_API_ID);
  const apiHash = process.env.TELEGRAM_API_HASH?.trim();
  const session = process.env.TELEGRAM_SESSION?.trim();
  if (!apiId || !apiHash || !session) {
    throw new TelegramNotConfiguredError();
  }

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

  return clientPromise;
}
