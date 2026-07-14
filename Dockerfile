FROM node:24-bookworm-slim

ARG GIT_SHA=unknown
ENV GIT_SHA=$GIT_SHA

WORKDIR /app

# Debian (glibc), not Alpine: @discordjs/opus only publishes prebuilt native
# binaries for glibc/musl on a handful of libc versions, and on arm64 (e.g.
# a Raspberry Pi) there's no matching musl build - node-pre-gyp falls back to
# compiling libopus from source, which fails on a NEON intrinsics bug in that
# codepath. glibc arm64 prebuilts exist, so this avoids the compile entirely.
# python3/make/g++ remain as a fallback in case a future @discordjs/opus
# version drops a matching prebuild; ffmpeg transcodes audio; yt-dlp is
# fetched as a standalone binary so no separate Python runtime is required
# for it.
RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 make g++ ffmpeg curl ca-certificates \
    && rm -rf /var/lib/apt/lists/* \
    && curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp \
    && chmod +x /usr/local/bin/yt-dlp

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY . .

ENV NODE_ENV=production
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://localhost:'+(process.env.PORT||3000)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "app.js"]
