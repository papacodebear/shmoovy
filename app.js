import 'dotenv/config';
import dns from 'node:dns';
import express from 'express';
import {
    InteractionType,
    InteractionResponseType,
    InteractionResponseFlags,
    MessageComponentTypes,
    ButtonStyleTypes,
    verifyKeyMiddleware,
} from 'discord-interactions';
import { Client, GatewayIntentBits } from 'discord.js';
import { DiscordRequest } from './utils.js';
import { resolveTrackFromQuery } from './providers/input.js';
import { createPending, takePending } from './pendingConfirmations.js';
import { getOrCreateQueue, getQueue } from './queue/guildQueue.js';

// Discord's voice UDP handshake can fail inside a Docker bridge network if
// Node resolves an IPv6 address the container can't actually route, leaving
// the voice connection bouncing between "connecting" and "signalling"
// instead of reaching "ready". Force IPv4 resolution to avoid that.
dns.setDefaultResultOrder('ipv4first');

const CONFIRM_TIMEOUT_MS = 60 * 1000;
const QUEUED_CONFIRMATION_TIMEOUT_MS = 5 * 1000;

let botReady = false;

const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates],
});
client.once('clientReady', () => {
    console.log(`Logged in as ${client.user.tag} (version ${process.env.GIT_SHA || 'unknown'})`);
    botReady = true;
});
client.login(process.env.DISCORD_TOKEN);

async function editOriginalResponse(token, body) {
    return DiscordRequest(`webhooks/${process.env.APP_ID}/${token}/messages/@original`, {
        method: 'PATCH',
        body,
    });
}

async function deleteOriginalResponse(token) {
    return DiscordRequest(`webhooks/${process.env.APP_ID}/${token}/messages/@original`, {
        method: 'DELETE',
    });
}

async function announceNowPlaying(channelId, track) {
    await DiscordRequest(`channels/${channelId}/messages`, {
        method: 'POST',
        body: { content: `🎵 Now playing: **${track.title}** — ${track.artist}` },
    });
}

// takePending is a one-shot read, so this is a no-op if the user already
// confirmed/cancelled - no need to track/cancel this timeout separately.
async function expirePendingConfirmation(pendingId) {
    const pending = takePending(pendingId);
    if (!pending) return;
    await editOriginalResponse(pending.token, {
        content: `**${pending.track.title}** — ${pending.track.artist} (search expired, run /play again)`,
        components: [],
    }).catch((err) => console.error('[play] failed to expire confirmation:', err));
}

async function addTrackToQueue({ track, guildId, channelId, userId }) {
    const guild = client.guilds.cache.get(guildId);
    if (!guild) throw new Error('GUILD_NOT_CACHED');

    const voiceState = guild.voiceStates.cache.get(userId);
    if (!voiceState?.channelId) throw new Error('NOT_IN_VOICE_CHANNEL');

    const queue = getOrCreateQueue(guildId, channelId);
    queue.onTrackChange = (nowPlaying) => announceNowPlaying(queue.textChannelId, nowPlaying);
    await queue.ensureConnected(voiceState.channelId, guild.voiceAdapterCreator);
    queue.enqueue(track);
}

// ---- slash command handlers ----

async function handlePlayCommand({ data, member, guild_id, channel_id, token, res }) {
    const query = data.options?.find((opt) => opt.name === 'song')?.value;
    res.send({
        type: InteractionResponseType.DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE,
        data: { flags: InteractionResponseFlags.EPHEMERAL },
    });

    if (!query) {
        await editOriginalResponse(token, { content: 'Give me a song name, artist, or a Spotify/YouTube link to search for.' });
        return;
    }

    try {
        const track = await resolveTrackFromQuery(query);
        if (!track) {
            await editOriginalResponse(token, { content: `Couldn't find a match for "${query}".` });
            return;
        }
        track.requestedBy = member.user.id;

        const pendingId = createPending({
            track,
            guildId: guild_id,
            channelId: channel_id,
            userId: member.user.id,
            token,
        });
        setTimeout(() => expirePendingConfirmation(pendingId), CONFIRM_TIMEOUT_MS);

        await editOriginalResponse(token, {
            content: `**${track.title}** — ${track.artist} (only visible to you)`,
            components: [
                {
                    type: MessageComponentTypes.ACTION_ROW,
                    components: [
                        {
                            type: MessageComponentTypes.BUTTON,
                            style: ButtonStyleTypes.SUCCESS,
                            label: '➕',
                            custom_id: `play_confirm:${pendingId}`,
                        },
                        {
                            type: MessageComponentTypes.BUTTON,
                            style: ButtonStyleTypes.DANGER,
                            label: '❌',
                            custom_id: `play_cancel:${pendingId}`,
                        },
                    ],
                },
            ],
        });
    } catch (err) {
        console.error('[play] error:', err);
        await editOriginalResponse(token, { content: 'Something went wrong searching for that song.' });
    }
}

function requireActiveQueue(guild_id, res) {
    const queue = getQueue(guild_id);
    if (!queue || !queue.current) {
        res.send({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: { content: 'Nothing is playing.', flags: InteractionResponseFlags.EPHEMERAL },
        });
        return null;
    }
    return queue;
}

function handlePauseCommand({ guild_id, res }) {
    const queue = requireActiveQueue(guild_id, res);
    if (!queue) return;
    queue.pause();
    res.send({ type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE, data: { content: '⏸️ Paused.' } });
}

function handleResumeCommand({ guild_id, res }) {
    const queue = requireActiveQueue(guild_id, res);
    if (!queue) return;
    queue.resume();
    res.send({ type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE, data: { content: '▶️ Resumed.' } });
}

function handleNextCommand({ guild_id, res }) {
    const queue = requireActiveQueue(guild_id, res);
    if (!queue) return;
    queue.skip();
    res.send({ type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE, data: { content: '⏭️ Skipped.' } });
}

function handleQueueCommand({ guild_id, res }) {
    const queue = getQueue(guild_id);
    if (!queue || (!queue.current && queue.tracks.length === 0)) {
        res.send({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: { content: 'The queue is empty.', flags: InteractionResponseFlags.EPHEMERAL },
        });
        return;
    }

    const lines = [];
    if (queue.current) {
        lines.push(`▶️ **${queue.current.title}** — ${queue.current.artist}`);
    }
    const upcoming = queue.tracks.slice(0, 15);
    upcoming.forEach((track, i) => {
        lines.push(`(${i + 1}) ${track.title} - ${track.artist}`);
    });
    if (queue.tracks.length > upcoming.length) {
        lines.push(`+${queue.tracks.length - upcoming.length} more`);
    }

    res.send({ type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE, data: { content: lines.join('\n') } });
}

function handleRemoveCommand({ data, guild_id, res }) {
    const position = data.options?.find((opt) => opt.name === 'position')?.value;
    const queue = getQueue(guild_id);
    const removed = queue?.remove(position) ?? null;
    if (!removed) {
        res.send({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: { content: `No track at position ${position}.`, flags: InteractionResponseFlags.EPHEMERAL },
        });
        return;
    }
    res.send({
        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: { content: `Removed **${removed.title}** — ${removed.artist} from the queue.` },
    });
}

function handleClearCommand({ guild_id, res }) {
    getQueue(guild_id)?.clear();
    res.send({ type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE, data: { content: 'Queue cleared.' } });
}

function handleShuffleCommand({ guild_id, res }) {
    getQueue(guild_id)?.shuffle();
    res.send({ type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE, data: { content: '🔀 Queue shuffled.' } });
}

function handleStopCommand({ guild_id, res }) {
    getQueue(guild_id)?.stop();
    res.send({
        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: { content: '⏹️ Stopped and left the voice channel.' },
    });
}

const commandHandlers = {
    play: handlePlayCommand,
    pause: handlePauseCommand,
    resume: handleResumeCommand,
    next: handleNextCommand,
    queue: handleQueueCommand,
    remove: handleRemoveCommand,
    clear: handleClearCommand,
    shuffle: handleShuffleCommand,
    stop: handleStopCommand,
};

// ---- message component (button) handlers ----

async function handleComponent({ data, token, res }) {
    const [action, pendingId] = data.custom_id.split(':');

    if (action === 'play_cancel') {
        takePending(pendingId);
        res.send({
            type: InteractionResponseType.UPDATE_MESSAGE,
            data: { content: 'Cancelled.', components: [] },
        });
        return;
    }

    if (action === 'play_confirm') {
        const pending = takePending(pendingId);
        if (!pending) {
            res.send({
                type: InteractionResponseType.UPDATE_MESSAGE,
                data: { content: 'This search has expired — try /play again.', components: [] },
            });
            return;
        }

        res.send({
            type: InteractionResponseType.UPDATE_MESSAGE,
            data: {
                content: `Added **${pending.track.title}** — ${pending.track.artist} to the queue.`,
                components: [],
            },
        });

        try {
            await addTrackToQueue(pending);
            // Just an acknowledgment once queued - dismiss it quickly rather
            // than leaving it sitting there until the user closes it.
            setTimeout(() => {
                deleteOriginalResponse(token).catch((err) =>
                    console.error('[play_confirm] failed to dismiss confirmation:', err)
                );
            }, QUEUED_CONFIRMATION_TIMEOUT_MS);
        } catch (err) {
            console.error('[play_confirm] error:', err);
            const message =
                err.message === 'NOT_IN_VOICE_CHANNEL'
                    ? 'You need to be in a voice channel to add a song.'
                    : `Failed to queue "${pending.track.title}".`;
            await editOriginalResponse(token, { content: message, components: [] });
        }
        return;
    }

    res.status(400).send('Unknown component action');
}

// ---- express app ----

const app = express();
const PORT = process.env.PORT || 3000;

app.post('/interactions', verifyKeyMiddleware(process.env.PUBLIC_KEY), async (req, res) => {
    const { type, data, member, guild_id, channel_id, token } = req.body;

    if (type === InteractionType.PING) {
        res.send({ type: InteractionResponseType.PONG });
        return;
    }

    if (type === InteractionType.APPLICATION_COMMAND) {
        const handler = commandHandlers[data.name];
        if (!handler) {
            res.status(400).send('Unknown command');
            return;
        }
        await handler({ data, member, guild_id, channel_id, token, res });
        return;
    }

    if (type === InteractionType.MESSAGE_COMPONENT) {
        await handleComponent({ data, member, guild_id, channel_id, token, res });
        return;
    }

    res.status(400).send('Unknown interaction type');
});

app.get('/health', (req, res) => {
    if (botReady) {
        res.status(200).send('OK');
    } else {
        res.status(500).send('Bot not ready');
    }
});

app.listen(PORT, () => {
    console.log('Listening on port', PORT);
});
