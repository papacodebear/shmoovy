import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const YTDLP_PATH = process.env.YTDLP_PATH || 'yt-dlp';
const YTDLP_TIMEOUT_MS = 20 * 1000;

// Resolves a Spotify track (no youtubeVideoId yet) to a playable YouTube
// video via yt-dlp's own search, reusing yt-dlp rather than adding a
// separate YouTube Data API key just for this lookup.
export async function resolveToYoutube(track) {
    if (track.youtubeVideoId) return track;

    const query = `ytsearch1:${track.title} ${track.artist} audio`;
    const { stdout } = await execFileAsync(
        YTDLP_PATH,
        ['-J', '--no-warnings', '--skip-download', query],
        { maxBuffer: 10 * 1024 * 1024, timeout: YTDLP_TIMEOUT_MS }
    );
    const data = JSON.parse(stdout);
    const entry = data.entries?.[0] ?? data;
    if (!entry?.id) {
        throw new Error(`Could not resolve "${track.title}" to a playable video`);
    }

    return {
        ...track,
        youtubeVideoId: entry.id,
        durationMs: track.durationMs ?? (entry.duration ? Math.round(entry.duration * 1000) : null),
    };
}
