# Mezmur

Ethiopian gospel music app. Vite + React + TypeScript client, Express + Prisma + PostgreSQL (Supabase) API server.

- `src/` — client (deployed to Vercel)
- `server/` — API (deployed to Render; shells out to `yt-dlp`/`ffmpeg` for YouTube import, which is why it needs a Docker host rather than Vercel's serverless functions)

## Deployment

**Production URLs**
- Client: https://mezmur-nu.vercel.app (stable across deploys — see "Rolling back" below)
- API: https://mezmur-api-yt3l.onrender.com/api

### 1. Run locally

```bash
# Client
npm install
cp .env.example .env.local   # fill in VITE_API_URL, VITE_SUPABASE_URL, VITE_SUPABASE_PUBLISHABLE_KEY
npm run dev                  # http://localhost:5173

# API (separate terminal)
cd server
npm install
cp .env.example .env         # fill in DATABASE_URL, SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, SUPABASE_SECRET_KEY
npm run dev                  # http://localhost:3001
```

### 2. Push changes to GitHub

```bash
git add -A
git commit -m "describe your change"
git push origin main            # or push a feature branch and open a PR
```

### 3. Automatic deploys

Both the client and the API are connected directly to this GitHub repo — no manual deploy step, ever:

- **Push/merge to `main`** → Vercel builds and promotes a new **Production** deployment of the client, and Render builds and rolls out a new revision of the API (running `prisma migrate deploy` on boot, so schema changes ship automatically too).
- **Open a pull request** → Vercel builds a **Preview** deployment for that PR (its own throwaway URL, posted as a PR comment/check) so changes can be reviewed live before merging. Render only auto-deploys `main` by default.
- **Build fails** → Vercel and Render both mark the deployment failed and keep serving the last good one; nothing goes live broken. Check logs in the Vercel dashboard (Deployments → the failed one → Build/Function logs) or Render dashboard (service → Logs) for the exact error.

### 4. Rolling back

**Vercel (client):** Dashboard → project → **Deployments** → find the last known-good deployment → **⋯ → Promote to Production**. This re-points the stable production domain (e.g. `mezmur.vercel.app`) at that build instantly — the URL itself never changes, only which build answers it. (Or: `vercel rollback [deployment-url]` from the CLI.)

**Render (API):** Dashboard → service → **Events**/**Deploys** tab → pick a previous successful deploy → **Rollback to this deploy**.

### One-time setup (already done for this repo, kept here for reference)

1. `gh repo create` (or created on github.com) and this repo pushed to it.
2. Vercel: **Add New Project** → import this repo → Root Directory left at repo root → Framework auto-detected as Vite → Environment Variables: `VITE_API_URL`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` → Deploy. Preview Deployments for PRs and Production Deployments for `main` are on by default per-project.
3. Render: **New → Blueprint** → point at this repo → it reads `render.yaml` at the repo root and provisions the `mezmur-api` Docker web service → fill in the flagged secret env vars (`DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`, optionally `SPOTIFY_CLIENT_ID`/`SPOTIFY_CLIENT_SECRET`, optionally `TELEGRAM_API_ID`/`TELEGRAM_API_HASH`/`TELEGRAM_SESSION` — see the Telegram import gotcha below) when prompted.
4. Set the client's `VITE_API_URL` in Vercel to the Render service's public URL + `/api` once it's live.

**Gotcha:** for `DATABASE_URL`, use Supabase's **Session pooler** connection string (Project Settings → Database → Connection String → "Session pooler" tab — host looks like `aws-...pooler.supabase.com`, username `postgres.<project-ref>`), not the direct `db.<project-ref>.supabase.co` connection. The direct host is IPv6-only and Render (like most PaaS compute) has no IPv6 egress, so it fails with `P1001: Can't reach database server`.

**Gotcha:** YouTube import (single or catalog) fails on every download with `Sign in to confirm you're not a bot` unless `YTDLP_COOKIES_B64` is set — YouTube's bot-check blocks anonymous requests from virtually all datacenter/cloud IP ranges, Render's included; this isn't a Render-specific or architecture problem, so switching hosts doesn't fix it on its own. Export cookies from a real, logged-in YouTube account (browser extension: "Get cookies.txt LOCALLY"), then `base64 -i cookies.txt | tr -d '\n'` and set the result as `YTDLP_COOKIES_B64` in the Render dashboard. See the comment above that env var in `render.yaml`.

**Gotcha:** cookies alone can still be inconsistent — confirmed in production that YouTube's bot-check can block lower-traffic channel content from Render's IP even with valid cookies. The current mitigation stack is cookies + forced player-client + the bgutil PO-token plugin (`server/Dockerfile`). If imports are still failing, re-check that `YTDLP_COOKIES_B64` holds a *fresh* cookies export — YouTube session cookies do expire.

**Gotcha:** the Telegram import screen (Settings → admin → "Import from Telegram") shows *"Telegram import isn't configured on this server"* whenever `TELEGRAM_API_ID`/`TELEGRAM_API_HASH`/`TELEGRAM_SESSION` are unset on the API instance actually serving that request — this is deliberate (see `server/src/telegram/client.ts`'s `getTelegramClient`), not a bug, and it's a **Render** env var, not a Vercel one: the client (Vercel) never runs this code or touches these secrets, only the Express API (Render) does. Setting them in Vercel does nothing.
1. Get a free `api_id`/`api_hash` from https://my.telegram.org/apps.
2. Run one of the login scripts locally (never on Render — this is a one-time interactive step) to produce a `TELEGRAM_SESSION` string, authenticated as a real Telegram user account rather than a bot (a bot can't read a channel's existing message history — see `server/scripts/telegramLogin.ts`'s header comment for why):
   - `cd server && npx tsx scripts/telegramLogin.ts` — the normal interactive flow (prompts for phone/code/2FA in your terminal).
   - `npx tsx scripts/telegramLoginStep.ts send-code --apiId <id> --apiHash <hash> --phone <+15551234567>`, then `submit-code --code <12345>` (and `submit-password --password <...>` if 2FA is on) — same flow split into separate commands, for driving it from somewhere that isn't one continuous interactive terminal session.
   - `npx tsx scripts/telegramLoginQr.ts --apiId <id> --apiHash <hash>` — scan a QR code with an already-logged-in Telegram app instead, for when phone-code delivery is unreliable.
3. Set `TELEGRAM_API_ID`, `TELEGRAM_API_HASH`, and the printed `TELEGRAM_SESSION` in **Render's** dashboard (service → Environment) for production, and/or in `server/.env` for local dev. Render restarts the service automatically on save.
4. The session string is a durable login credential for that Telegram account — treat it like a password (never commit it, never log it outside the login scripts' own printed output) and re-run a login script to mint a new one if it's ever revoked.
