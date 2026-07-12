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
3. Render: **New → Blueprint** → point at this repo → it reads `render.yaml` at the repo root and provisions the `mezmur-api` Docker web service → fill in the flagged secret env vars (`DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`, optionally `SPOTIFY_CLIENT_ID`/`SPOTIFY_CLIENT_SECRET`) when prompted.
4. Set the client's `VITE_API_URL` in Vercel to the Render service's public URL + `/api` once it's live.

**Gotcha:** for `DATABASE_URL`, use Supabase's **Session pooler** connection string (Project Settings → Database → Connection String → "Session pooler" tab — host looks like `aws-...pooler.supabase.com`, username `postgres.<project-ref>`), not the direct `db.<project-ref>.supabase.co` connection. The direct host is IPv6-only and Render (like most PaaS compute) has no IPv6 egress, so it fails with `P1001: Can't reach database server`.
