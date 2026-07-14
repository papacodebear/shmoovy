import { spawn } from 'node:child_process';
import { createAudioResource, StreamType } from '@discordjs/voice';

const YTDLP_PATH = process.env.YTDLP_PATH || 'yt-dlp';
const FFMPEG_PATH = process.env.FFMPEG_PATH || 'ffmpeg';

// Pipes yt-dlp's extracted audio into ffmpeg (transcoding to raw PCM), and
// wraps the result in an @discordjs/voice AudioResource. Returns a cleanup()
// to kill both subprocesses when the track ends or is skipped.
export function createTrackResource(videoUrl) {
    const ytdlp = spawn(
        YTDLP_PATH,
        ['-f', 'bestaudio', '-o', '-', '--quiet', '--no-warnings', videoUrl],
        { stdio: ['ignore', 'pipe', 'pipe'] }
    );

    const ffmpeg = spawn(
        FFMPEG_PATH,
        ['-i', 'pipe:0', '-analyzeduration', '0', '-loglevel', 'error', '-f', 's16le', '-ar', '48000', '-ac', '2', 'pipe:1'],
        { stdio: ['pipe', 'pipe', 'pipe'] }
    );

    ytdlp.stdout.pipe(ffmpeg.stdin);
    ytdlp.stderr.on('data', (chunk) => console.error(`[yt-dlp] ${chunk}`));
    ffmpeg.stderr.on('data', (chunk) => console.error(`[ffmpeg] ${chunk}`));
    ytdlp.on('error', (err) => console.error('[yt-dlp] failed to start:', err));
    ffmpeg.on('error', (err) => console.error('[ffmpeg] failed to start:', err));

    const resource = createAudioResource(ffmpeg.stdout, { inputType: StreamType.Raw });

    const cleanup = () => {
        ytdlp.kill('SIGKILL');
        ffmpeg.kill('SIGKILL');
    };

    return { resource, cleanup };
}
