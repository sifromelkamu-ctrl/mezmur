# Render (or any Docker host) image for the Mezmur API. A plain Node
# buildpack can't run this service: the YouTube import pipeline shells out
# to `yt-dlp` and `ffmpeg` as real binaries, so this image installs them
# alongside Node rather than relying on whatever the host happens to have.
FROM node:22-bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
      ffmpeg ca-certificates curl \
    && rm -rf /var/lib/apt/lists/* \
    && curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp \
    && chmod a+rx /usr/local/bin/yt-dlp

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
CMD ["sh", "-c", "npx prisma migrate deploy && npm run start"]
