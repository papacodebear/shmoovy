import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const YTDLP_PATH = process.env.YTDLP_PATH || 'yt-dlp';

// Metadata for a pasted YouTube/YouTube Music link - no search involved,
// the user gave an exact video.
export async function getVideoMetadata(url) {
    const { stdout } = await execFileAsync(
        YTDLP_PATH,
        ['-J', '--no-warnings', '--skip-download', url],
        { maxBuffer: 10 * 1024 * 1024 }
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
