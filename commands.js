import 'dotenv/config';
import { InstallGlobalCommands } from './utils.js';

const PLAY_COMMAND = {
    name: 'play',
    description: 'Search for a song (or paste a Spotify/YouTube link) and add it to the queue',
    options: [
        {
            type: 3, // STRING
            name: 'song',
            description: 'Song name, artist, or a Spotify/YouTube link',
            required: true,
        },
    ],
    type: 1,
};

const PAUSE_COMMAND = { name: 'pause', description: 'Pause the current track', type: 1 };
const RESUME_COMMAND = { name: 'resume', description: 'Resume the paused track', type: 1 };
const NEXT_COMMAND = { name: 'next', description: 'Skip to the next track in the queue', type: 1 };
const QUEUE_COMMAND = { name: 'queue', description: 'Show the current queue', type: 1 };

const REMOVE_COMMAND = {
    name: 'remove',
    description: 'Remove a track from the queue',
    options: [
        {
            type: 4, // INTEGER
            name: 'position',
            description: 'Position of the track in /queue to remove',
            required: true,
            min_value: 1,
        },
    ],
    type: 1,
};

const CLEAR_COMMAND = { name: 'clear', description: 'Clear the upcoming queue', type: 1 };
const SHUFFLE_COMMAND = { name: 'shuffle', description: 'Shuffle the upcoming queue', type: 1 };
const STOP_COMMAND = {
    name: 'stop',
    description: 'Stop playback, clear the queue, and leave the voice channel',
    type: 1,
};

const ALL_COMMANDS = [
    PLAY_COMMAND,
    PAUSE_COMMAND,
    RESUME_COMMAND,
    NEXT_COMMAND,
    QUEUE_COMMAND,
    REMOVE_COMMAND,
    CLEAR_COMMAND,
    SHUFFLE_COMMAND,
    STOP_COMMAND,
];

InstallGlobalCommands(process.env.APP_ID, ALL_COMMANDS);
