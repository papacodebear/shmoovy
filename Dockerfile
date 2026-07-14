FROM node:24-alpine

ARG GIT_SHA=unknown
ENV GIT_SHA=$GIT_SHA

WORKDIR /app

# python3/make/g++ are needed to build the @discordjs/opus native addon;
# ffmpeg transcodes audio; yt-dlp is fetched as a standalone binary so no
# separate Python runtime is required for it.
RUN apk add --no-cache python3 make g++ ffmpeg curl \
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
