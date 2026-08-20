#!/usr/bin/env node
// One-command recovery for the recurring "YouTube cookies expired" failure.
// The prod/local yt-dlp cookie auth (see ../src/youtube/ytdlp.ts) runs off a
// static export of this machine's logged-in Chrome YouTube session, base64'd
// into YTDLP_COOKIES_B64. That export doesn't rotate the way a live browser
// session does, and Google's abuse detection eventually invalidates it under
// repeated scripted traffic — not a fix, just a fact of how yt-dlp + a real
// account's cookies behave. This script re-runs the same export step that
// originally produced YTDLP_COOKIES_B64 and rewrites it into server/.env, so
// recovering from that is one command instead of a manual multi-step chore.
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.join(__dirname, "..", ".env");
const tmpCookiesPath = path.join(os.tmpdir(), `yt-dlp-cookies-refresh-${Date.now()}.txt`);
const browser = process.argv[2] ?? "chrome";

console.log(`[refresh-cookies] exporting fresh cookies from your local ${browser} profile...`);
try {
  execFileSync(
    "yt-dlp",
    ["--cookies-from-browser", browser, "--cookies", tmpCookiesPath, "--skip-download", "https://www.youtube.com/watch?v=dQw4w9WgXcQ"],
    { stdio: "inherit" }
  );
} catch (err) {
  console.error("[refresh-cookies] yt-dlp export failed — is the browser installed and are you logged into YouTube in it?");
  process.exit(1);
}

if (!existsSync(tmpCookiesPath)) {
  console.error("[refresh-cookies] yt-dlp reported success but no cookies file was written — aborting, .env left untouched.");
  process.exit(1);
}

// yt-dlp's --cookies-from-browser dumps the WHOLE browser cookie jar, not
// just youtube.com's — on a real daily-driver browser profile that's every
// site ever visited (banking, government, unrelated logins...), which is
// both a needless secret to be holding in an env var and, at real-world
// size, big enough to blow past Render's build-time argument-length limit
// ("argument list too long") once it lands in YTDLP_COOKIES_B64. yt-dlp
// itself only ever reads youtube.com/google.com auth cookies from this
// file, so keep exactly those and drop everything else.
const RELEVANT_DOMAIN = /(youtube\.com|google\.com|googlevideo\.com|ytimg\.com)$/;
const rawCookies = readFileSync(tmpCookiesPath, "utf8");
unlinkSync(tmpCookiesPath);
const trimmedCookies = rawCookies
  .split("\n")
  .filter((line) => {
    if (line.startsWith("#") || !line.trim()) return true;
    const domain = line.split("\t")[0]?.replace(/^\./, "");
    return domain ? RELEVANT_DOMAIN.test(domain) : false;
  })
  .join("\n");

const b64 = Buffer.from(trimmedCookies, "utf8").toString("base64");

if (!existsSync(envPath)) {
  console.error(`[refresh-cookies] ${envPath} not found — aborting.`);
  process.exit(1);
}

const envLines = readFileSync(envPath, "utf8").split("\n");
const targetLine = `YTDLP_COOKIES_B64=${b64}`;
const idx = envLines.findIndex((line) => line.startsWith("YTDLP_COOKIES_B64="));
if (idx !== -1) {
  envLines[idx] = targetLine;
} else {
  envLines.push(targetLine);
}
writeFileSync(envPath, envLines.join("\n"));

console.log(`[refresh-cookies] done — wrote ${b64.length} chars to YTDLP_COOKIES_B64 in ${envPath}`);
console.log("[refresh-cookies] restart the dev server (npm run dev) for it to pick up the new cookies.");
