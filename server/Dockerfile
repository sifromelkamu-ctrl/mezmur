# Render (or any Docker host) image for the Mezmur API. A plain Node
# buildpack can't run this service: the YouTube import pipeline shells out
# to `yt-dlp` and `ffmpeg` as real binaries, so this image installs them
# alongside Node rather than relying on whatever the host happens to have.
FROM node:22-bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
      ffmpeg ca-certificates curl git \
    && rm -rf /var/lib/apt/lists/* \
    # yt-dlp's plain "yt-dlp" release asset is a Python zipapp (its shebang
    # execs python3 at runtime) — this image never installed python3, so
    # every invocation failed with "/usr/bin/env: 'python3': No such file or
    # directory". "yt-dlp_linux" is yt-dlp's own PyInstaller-frozen
    # standalone build: it bundles its own interpreter, needs nothing else
    # on the image, and is a drop-in replacement (still just `yt-dlp <args>`
    # on PATH) for every existing spawn("yt-dlp", ...) call in this app.
    && curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_linux -o /usr/local/bin/yt-dlp \
    && chmod a+rx /usr/local/bin/yt-dlp

# YouTube's bot-check increasingly requires a proof-of-origin token for the
# default "web" player client — cookies alone don't satisfy it (confirmed
# in production). bgutil-ytdlp-pot-provider is yt-dlp's own community-
# maintained, self-hosted way to generate real tokens instead of working
# around the check with cookies/alternate clients: a small Node server
# (this image builds it from source, no published npm package exists) that
# yt-dlp's plugin queries over localhost. Pinned to a release tag so a
# build doesn't silently change behavior. The plugin/ folder is placed
# where ytdlp.ts's --plugin-dirs points — no pip/system Python involved,
# it's just yt-dlp (already bundling its own interpreter) reading Python
# source files directly off disk.
RUN git clone --single-branch --branch 1.3.1 --depth 1 \
      https://github.com/Brainicism/bgutil-ytdlp-pot-provider.git /opt/bgutil-provider \
    && cd /opt/bgutil-provider/server && npm ci && npx tsc

WORKDIR /app

# Install deps before copying the rest of the source so this layer only
# re-runs when package.json/prisma schema actually change.
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci

COPY . .

RUN npx prisma generate
RUN npm run build

ENV NODE_ENV=production
EXPOSE 3001

# `prisma migrate deploy` only applies migrations that haven't run yet, so
# it's safe to run on every boot — this is what makes a plain `git push`
# actually update the production schema with zero manual steps.
# The bgutil token server is started first, backgrounded (&) — it's a
# best-effort sidecar on localhost:4416: if it fails to start or crashes,
# yt-dlp's plugin just can't reach it and falls back to running without a
# token (today's behavior), it never takes the main API process down with it.
CMD ["sh", "-c", "node /opt/bgutil-provider/server/build/main.js & npx prisma migrate deploy && npm run start"]
