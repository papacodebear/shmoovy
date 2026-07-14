import 'dotenv/config';

let cachedToken = null;
let cachedTokenExpiry = 0;

async function getAppToken() {
    if (cachedToken && Date.now() < cachedTokenExpiry) return cachedToken;

    const res = await fetch('https://accounts.spotify.com/api/token', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            Authorization:
                'Basic ' +
                Buffer.from(`${process.env.SPOTIFY_CLIENT_ID}:${process.env.SPOTIFY_CLIENT_SECRET}`).toString(
                    'base64'
                ),
        },
        body: 'grant_type=client_credentials',
    });
    if (!res.ok) throw new Error(`Spotify auth failed: ${res.status}`);

    const data = await res.json();
    cachedToken = data.access_token;
    cachedTokenExpiry = Date.now() + (data.expires_in - 60) * 1000;
    return cachedToken;
}

function trackFromSpotifyItem(item) {
    return {
        title: item.name,
        artist: item.artists.map((a) => a.name).join(', '),
        durationMs: item.duration_ms,
        thumbnailUrl: item.album?.images?.[0]?.url ?? null,
        sourceProvider: 'spotify',
        sourceUrl: item.external_urls?.spotify ?? null,
        youtubeVideoId: null,
    };
}

// Plain-text search: Spotify's catalog search, top result only.
export async function searchTopTrack(query) {
    const token = await getAppToken();
    const res = await fetch(
        `https://api.spotify.com/v1/search?${new URLSearchParams({ q: query, type: 'track', limit: '1' })}`,
        { headers: { Authorization: `Bearer ${token}` } }
    );
    if (!res.ok) throw new Error(`Spotify search failed: ${res.status}`);

    const data = await res.json();
    const item = data.tracks?.items?.[0];
    return item ? trackFromSpotifyItem(item) : null;
}

// Direct link resolution: a pasted open.spotify.com/track/<id> or spotify:track:<id>.
export async function getTrackById(id) {
    const token = await getAppToken();
    const res = await fetch(`https://api.spotify.com/v1/tracks/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error(`Spotify track lookup failed: ${res.status}`);

    return trackFromSpotifyItem(await res.json());
}
