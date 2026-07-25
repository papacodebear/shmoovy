import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const YTDLP_PATH = process.env.YTDLP_PATH || 'yt-dlp';

const YTDLP_TIMEOUT_MS = 20 * 1000;

// Metadata for a pasted YouTube/YouTube Music link - no search involved,
// the user gave an exact video.
export async function getVideoMetadata(url) {
    const { stdout } = await execFileAsync(
        YTDLP_PATH,
        // --no-playlist: a watch URL can carry a `list=` param (e.g. queued
        // from an auto-generated "Radio" mix) - without this, yt-dlp treats
        // it as a playlist request and tries to enumerate the whole list,
        // which for a Radio mix is effectively endless and never finishes.
        ['-J', '--no-warnings', '--skip-download', '--no-playlist', url],
        { maxBuffer: 10 * 1024 * 1024, timeout: YTDLP_TIMEOUT_MS }
    );
    const info = JSON.parse(stdout);

    return {
        title: info.track || info.title,
        artist: info.artist || info.uploader || 'Unknown artist',
        durationMs: info.duration ? Math.round(info.duration * 1000) : null,
        thumbnailUrl: info.thumbnail ?? null,
        sourceProvider: 'youtube',
        sourceUrl: info.webpage_url || url,
        youtubeVideoId: info.id,
    };
}
