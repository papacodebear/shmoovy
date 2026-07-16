import { searchTopTrack, getTrackById } from './spotify.js';
import { getVideoMetadata } from './youtube.js';

const SPOTIFY_TRACK_RE = /open\.spotify\.com\/(?:intl-[a-z-]+\/)?track\/([a-zA-Z0-9]+)|spotify:track:([a-zA-Z0-9]+)/;
// Deliberately just a domain check, not a specific path/query shape - yt-dlp
// itself already handles every real YouTube URL variant (watch, shorts,
// live, embed, youtu.be, any query param order), so there's no need to
// duplicate that parsing here. A narrower regex previously missed anything
// that wasn't exactly `watch?v=<id>` and fell through to a Spotify search.
const YOUTUBE_HOST_RE = /(?:youtube\.com|youtu\.be)/i;

// Classifies a raw /play input by shape: a pasted Spotify link, a pasted
// YouTube/YouTube Music link, or plain text to search for.
export function classifyInput(query) {
    const spotifyMatch = query.match(SPOTIFY_TRACK_RE);
    if (spotifyMatch) {
        return { type: 'spotify', trackId: spotifyMatch[1] || spotifyMatch[2] };
    }

    if (YOUTUBE_HOST_RE.test(query)) {
        return { type: 'youtube', url: query };
    }

    return { type: 'text', query };
}

// Resolves a /play input straight to a single Track - no multi-result picker.
export async function resolveTrackFromQuery(query) {
    const classification = classifyInput(query);

    if (classification.type === 'spotify') {
        return getTrackById(classification.trackId);
    }
    if (classification.type === 'youtube') {
        return getVideoMetadata(classification.url);
    }
    return searchTopTrack(classification.query);
}
