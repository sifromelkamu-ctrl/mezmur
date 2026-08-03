// One-time interactive login for Telegram channel import. Not part of the
// Express app — run it once locally to mint a reusable session string, then
// paste that into TELEGRAM_SESSION (in your .env, and in Render's env vars
// for production) and never run this again unless the session gets revoked.
//
// Usage:
//   1. Get api_id/api_hash (free) from https://my.telegram.org/apps
//   2. cd server && npx tsx scripts/telegramLogin.ts
//   3. Enter your API id/hash (or set TELEGRAM_API_ID/TELEGRAM_API_HASH in
//      server/.env first and this will pick them up automatically), then
//      your phone number, the login code Telegram sends you, and your 2FA
//      password if you have one set.
//   4. Copy the printed session string into TELEGRAM_SESSION.
//
// This authenticates as your own Telegram account (a "userbot"), not a bot
// account — see server/src/telegram/client.ts for why: bots can't read a
// channel's existing message history, only messages posted after they join,
// which doesn't work for importing a channel's back catalog.
import "dotenv/config";
import { createInterface } from "node:readline/promises";
import { TelegramClient } from "teleproto";
// Node's ESM loader doesn't do directory-index resolution for subpath
// imports (teleproto has no package.json "exports" map) — the explicit
// /index.js is required, not optional. See telegram/client.ts.
import { StringSession } from "teleproto/sessions/index.js";

const rl = createInterface({ input: process.stdin, output: process.stdout });

async function promptForApiId(): Promise<number> {
  const fromEnv = Number(process.env.TELEGRAM_API_ID);
  if (fromEnv) return fromEnv;
  const answer = await rl.question("api_id (from https://my.telegram.org/apps): ");
  return Number(answer.trim());
}

async function promptForApiHash(): Promise<string> {
  const fromEnv = process.env.TELEGRAM_API_HASH?.trim();
  if (fromEnv) return fromEnv;
  return (await rl.question("api_hash: ")).trim();
}

async function main() {
  const apiId = await promptForApiId();
  const apiHash = await promptForApiHash();
  if (!apiId || !apiHash) {
    console.error("api_id and api_hash are required.");
    process.exit(1);
  }

  const client = new TelegramClient(new StringSession(""), apiId, apiHash, {
    connectionRetries: 5,
  });

  await client.start({
    phoneNumber: () => rl.question("Phone number (with country code, e.g. +15551234567): "),
    password: () => rl.question("2FA password (leave blank if you don't have one set): "),
    phoneCode: () => rl.question("Login code (sent to your Telegram app): "),
    onError: (err) => console.error(err),
  });

  const me = await client.getMe();
  console.log(`\nLogged in as ${"firstName" in me ? me.firstName : "unknown"} ${"username" in me && me.username ? `(@${me.username})` : ""}.\n`);
  console.log("Session string — paste this into TELEGRAM_SESSION:\n");
  console.log(client.session.save());
  console.log("\nAlso set TELEGRAM_API_ID and TELEGRAM_API_HASH to the values you used above.");

  await client.disconnect();
  rl.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
