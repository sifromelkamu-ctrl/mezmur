// Non-interactive, three-step variant of telegramLogin.ts — for driving the
// login flow from separate command invocations (e.g. an assistant relaying
// values one at a time) instead of one live interactive terminal session.
// The three steps have to be separate processes because Telegram's login
// code is sent asynchronously (you have to go check your Telegram app for
// it) — nothing can collapse that wait into a single non-interactive call.
//
// Usage:
//   npx tsx scripts/telegramLoginStep.ts send-code --apiId <id> --apiHash <hash> --phone <+15551234567>
//   npx tsx scripts/telegramLoginStep.ts submit-code --code <12345>
//   npx tsx scripts/telegramLoginStep.ts submit-password --password <your2FApassword>   (only if 2FA is enabled)
//
// State between steps is held in .telegram-login-state.json (gitignored,
// deleted automatically once login completes).
import "dotenv/config";
import { existsSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import { Api, TelegramClient } from "teleproto";
import { StringSession } from "teleproto/sessions/index.js";
import { SessionPasswordNeededError } from "teleproto/errors/index.js";

const STATE_PATH = path.join(process.cwd(), ".telegram-login-state.json");

interface LoginState {
  apiId: number;
  apiHash: string;
  phoneNumber: string;
  phoneCodeHash: string;
  session: string;
}

function loadState(): LoginState {
  if (!existsSync(STATE_PATH)) {
    console.error("No in-progress login found — run `send-code` first.");
    process.exit(1);
  }
  return JSON.parse(readFileSync(STATE_PATH, "utf8"));
}

function saveState(state: LoginState) {
  writeFileSync(STATE_PATH, JSON.stringify(state), { mode: 0o600 });
}

const [, , command, ...rest] = process.argv;

function arg(name: string): string | undefined {
  const idx = rest.indexOf(`--${name}`);
  return idx !== -1 ? rest[idx + 1] : undefined;
}

async function sendCodeStep() {
  const apiId = Number(arg("apiId") ?? process.env.TELEGRAM_API_ID);
  const apiHash = arg("apiHash") ?? process.env.TELEGRAM_API_HASH;
  const phoneNumber = arg("phone");
  const forceSms = rest.includes("--forceSms");
  if (!apiId || !apiHash || !phoneNumber) {
    console.error("Usage: send-code --apiId <id> --apiHash <hash> --phone <+15551234567> [--forceSms]");
    process.exit(1);
  }

  const client = new TelegramClient(new StringSession(""), apiId, apiHash, { connectionRetries: 5 });
  await client.connect();
  const result = await client.sendCode({ apiId, apiHash }, phoneNumber, forceSms);
  saveState({ apiId, apiHash, phoneNumber, phoneCodeHash: result.phoneCodeHash, session: client.session.save() });
  console.log(`Code sent to ${phoneNumber} (${result.isCodeViaApp ? "via the Telegram app" : "via SMS"}). Run submit-code next.`);
  await client.disconnect();
}

async function submitCodeStep() {
  const code = arg("code");
  if (!code) {
    console.error("Usage: submit-code --code <12345>");
    process.exit(1);
  }
  const state = loadState();
  const client = new TelegramClient(new StringSession(state.session), state.apiId, state.apiHash, { connectionRetries: 5 });
  await client.connect();
  try {
    await client.invoke(new Api.auth.SignIn({ phoneNumber: state.phoneNumber, phoneCodeHash: state.phoneCodeHash, phoneCode: code }));
  } catch (err) {
    if (err instanceof SessionPasswordNeededError) {
      saveState({ ...state, session: client.session.save() });
      console.log("This account has a 2FA password — run submit-password next.");
      await client.disconnect();
      return;
    }
    await client.disconnect();
    throw err;
  }
  const finalSession = client.session.save();
  unlinkSync(STATE_PATH);
  console.log("Login complete. TELEGRAM_SESSION:\n");
  console.log(finalSession);
  await client.disconnect();
}

async function submitPasswordStep() {
  const password = arg("password");
  if (!password) {
    console.error("Usage: submit-password --password <your2FApassword>");
    process.exit(1);
  }
  const state = loadState();
  const client = new TelegramClient(new StringSession(state.session), state.apiId, state.apiHash, { connectionRetries: 5 });
  await client.connect();
  let stepError: Error | undefined;
  await client.signInWithPassword(
    { apiId: state.apiId, apiHash: state.apiHash },
    {
      password: async () => password,
      onError: async (err) => {
        stepError = err;
        return true; // stop after one attempt — a wrong password needs a fresh prompt, not a retry loop here
      },
    }
  );
  if (stepError) {
    await client.disconnect();
    throw stepError;
  }
  const finalSession = client.session.save();
  unlinkSync(STATE_PATH);
  console.log("Login complete. TELEGRAM_SESSION:\n");
  console.log(finalSession);
  await client.disconnect();
}

async function main() {
  if (command === "send-code") return sendCodeStep();
  if (command === "submit-code") return submitCodeStep();
  if (command === "submit-password") return submitPasswordStep();
  console.error("Usage: telegramLoginStep.ts <send-code|submit-code|submit-password> [...args]");
  process.exit(1);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
