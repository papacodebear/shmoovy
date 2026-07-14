# shmoovy

Definitely not groovy

A Discord music bot: search Spotify's catalog (or paste a Spotify/YouTube
link) with `/play`, confirm the match, and it joins your voice channel and
plays the audio (extracted from YouTube via `yt-dlp`).

## How it works

- Slash commands are handled at `POST /interactions` ([app.js](app.js)),
  verified with Discord's Ed25519 request signing (`verifyKeyMiddleware`),
  same pattern as `makearoll_discord`. A `discord.js` gateway `Client` runs
  alongside it for anything that needs a persistent connection - here,
  joining and streaming to voice channels.
- `/play <song>` classifies its input by shape
  ([providers/input.js](providers/input.js)): a pasted Spotify link, a
  pasted YouTube/YouTube Music link, or plain text. Plain text is searched
  against Spotify's catalog ([providers/spotify.js](providers/spotify.js));
  links are resolved directly. Either way it resolves to a single track and
  shows an ephemeral "only visible to you" confirmation with ➕ (add) / ❌
  (cancel) buttons, backed by a short-lived in-memory map
  ([pendingConfirmations.js](pendingConfirmations.js)).
- Spotify's API can't stream track audio to a third-party bot (DRM), so
  confirmed tracks are always resolved to a playable YouTube video
  ([providers/resolve.js](providers/resolve.js)) and extracted with `yt-dlp`,
  piped through `ffmpeg` into an `@discordjs/voice` audio resource
  ([audio/extract.js](audio/extract.js)).
- Each guild gets one in-memory queue + voice connection
  ([queue/guildQueue.js](queue/guildQueue.js)). When a track starts (first
  play, natural advance, or `/next`), a "🎵 Now playing" message posts to the
  channel `/play` was used in. The bot disconnects automatically after 5
  idle minutes with an empty queue.
- `GET /health` reports whether the Discord client has finished logging in,
  used by Docker's healthcheck.

## Commands

| Command | Effect |
|---|---|
| `/play <song>` | Search/resolve a song and show a confirm prompt; adds to the queue on confirm |
| `/pause` | Pause the current track |
| `/resume` | Resume the paused track |
| `/next` | Skip to the next track in the queue |
| `/queue` | List the current + upcoming tracks |
| `/remove <position>` | Remove a track from the queue by its `/queue` position |
| `/clear` | Empty the upcoming queue |
| `/shuffle` | Shuffle the upcoming queue |
| `/stop` | Stop playback, clear the queue, and leave the voice channel |

## Local development

Requires `ffmpeg` and `yt-dlp` on your `PATH` (or set `FFMPEG_PATH`/
`YTDLP_PATH` in `.env`).

```bash
npm install
cp .env.example .env   # fill in the values below
npm run register       # (re)registers the slash commands with Discord
npm run dev            # nodemon, restarts on file changes
```

### Required environment variables (see `.env.example`)

| Variable | Purpose |
|---|---|
| `DISCORD_TOKEN` | Bot token, used to call the Discord API and log in to the gateway |
| `PUBLIC_KEY` | Discord app's public key, used to verify interaction requests |
| `APP_ID` | Discord application ID, used when registering slash commands |
| `SPOTIFY_CLIENT_ID` / `SPOTIFY_CLIENT_SECRET` | Spotify app credentials (Client Credentials flow - catalog search/link resolution only, no user auth) |
| `PORT` | Express port (defaults to 3000) |
| `YTDLP_PATH` / `FFMPEG_PATH` | Optional overrides if those binaries aren't on `PATH` |

Discord's Interactions Endpoint URL (in the Discord Developer Portal) needs
to point at this app's public `/interactions` route. The bot also needs the
`GUILD_VOICE_STATES` gateway intent enabled and `Connect`/`Speak`
permissions in whatever voice channels it'll join.

## Deployment

Runs as a single Docker container (`docker-compose.yml`), built with a
`GIT_SHA` build arg baked in at build time and logged on startup. The
Dockerfile installs `ffmpeg` and a standalone `yt-dlp` binary alongside Node
- `yt-dlp` will occasionally need bumping as YouTube changes its internals.
