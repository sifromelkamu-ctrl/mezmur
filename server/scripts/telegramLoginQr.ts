// QR-code alternative to telegramLoginStep.ts — for when phone-number login
// codes aren't arriving (Telegram's SMS/app-push delivery can be flaky or
// rate-limited for a given number). Scanning a QR code with an
// already-logged-in Telegram app doesn't depend on any code delivery at
// all, so it sidesteps that failure mode entirely.
//
// Usage:
//   npx tsx scripts/telegramLoginQr.ts --apiId <id> --apiHash <hash> [--password <2fa password>]
//
// Prints a QR code (regenerated automatically every ~30s until scanned or
// the process is stopped) — open Telegram on your phone, go to
// Settings -> Devices -> Link Desktop Device, and scan it. Omit --password
// on the first run; if the account turns out to have 2FA enabled, this
// exits with a clear "enter your password and re-run with --password"
// message instead of hanging.
import "dotenv/config";
import qrcode from "qrcode-terminal";
import { TelegramClient } from "teleproto";
import { StringSession } from "teleproto/sessions/index.js";

const [, , ...rest] = process.argv;

function arg(name: string): string | undefined {
  const idx = rest.indexOf(`--${name}`);
  return idx !== -1 ? rest[idx + 1] : undefined;
}

async function main() {
  const apiId = Number(arg("apiId") ?? process.env.TELEGRAM_API_ID);
  const apiHash = arg("apiHash") ?? process.env.TELEGRAM_API_HASH;
  const password = arg("password");
  if (!apiId || !apiHash) {
    console.error("Usage: telegramLoginQr.ts --apiId <id> --apiHash <hash> [--password <2fa password>]");
    process.exit(1);
  }

  const client = new TelegramClient(new StringSession(""), apiId, apiHash, { connectionRetries: 5 });
  await client.connect();

  let shown = false;
  let passwordEnabledError = false;

  const user = await client.signInUserWithQrCode(
    { apiId, apiHash },
    {
      qrCode: async ({ token }) => {
        const url = `tg://login?token=${token.toString("base64url")}`;
        console.log(
          shown
            ? "\nQR code expired — here's a fresh one, scan within ~30s:\n"
            : "\nOn your phone: Telegram -> Settings -> Devices -> Link Desktop Device, then scan this (or open the URL directly on the same phone that has Telegram installed):\n"
        );
        console.log(url);
        console.log();
        qrcode.generate(url, { small: true });
        shown = true;
      },
      password: password
        ? async () => password
        : undefined,
      onError: async (err) => {
        if (!password && err.message?.includes("2FA")) {
          passwordEnabledError = true;
          return true; // stop — caller needs to re-run with --password
        }
        console.error(err.message ?? err);
        return true;
      },
    }
  );

  if (passwordEnabledError || !user) {
    console.error("This account has a 2FA password — re-run with --password <your2FApassword>.");
    await client.disconnect();
    process.exit(1);
  }

  console.log(`\nLogged in as ${"firstName" in user ? user.firstName : "unknown"}${"username" in user && user.username ? ` (@${user.username})` : ""}.\n`);
  console.log("TELEGRAM_SESSION:\n");
  console.log(client.session.save());
  await client.disconnect();
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
