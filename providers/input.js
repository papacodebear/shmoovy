import { searchTopTrack, getTrackById } from './spotify.js';
import { getVideoMetadata } from './youtube.js';

const SPOTIFY_TRACK_RE = /open\.spotify\.com\/(?:intl-[a-z-]+\/)?track\/([a-zA-Z0-9]+)|spotify:track:([a-zA-Z0-9]+)/;
const YOUTUBE_RE = /(?:youtube\.com\/watch\?v=|youtu\.be\/|music\.youtube\.com\/watch\?v=)([a-zA-Z0-9_-]{11})/;

// Classifies a raw /play input by shape: a pasted Spotify link, a pasted
// YouTube/YouTube Music link, or plain text to search for.
export function classifyInput(query) {
    const spotifyMatch = query.match(SPOTIFY_TRACK_RE);
    if (spotifyMatch) {
        return { type: 'spotify', trackId: spotifyMatch[1] || spotifyMatch[2] };
    }

    if (YOUTUBE_RE.test(query)) {
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
