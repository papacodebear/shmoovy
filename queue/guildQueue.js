import {
    AudioPlayerStatus,
    NoSubscriberBehavior,
    VoiceConnectionStatus,
    createAudioPlayer,
    joinVoiceChannel,
    entersState,
} from '@discordjs/voice';
import { createTrackResource } from '../audio/extract.js';
import { resolveToYoutube } from '../providers/resolve.js';

const IDLE_DISCONNECT_MS = 5 * 60 * 1000;

const guildQueues = new Map();

export class GuildQueue {
    constructor(guildId, textChannelId) {
        this.guildId = guildId;
        this.textChannelId = textChannelId;
        this.voiceChannelId = null;
        this.connection = null;
        this.player = createAudioPlayer({
            behaviors: { noSubscriber: NoSubscriberBehavior.Pause },
        });
        this.tracks = [];
        this.current = null;
        this.currentCleanup = null;
        this.idleTimer = null;
        this.onTrackChange = null; // set by app.js to announce "now playing"

        this.player.on(AudioPlayerStatus.Idle, () => this._playNext());
        this.player.on('error', (error) => {
            console.error(`[player error] guild ${this.guildId}:`, error);
            this._playNext();
        });
        this.player.on('stateChange', (oldState, newState) => {
            console.log(`[player] guild ${this.guildId}: ${oldState.status} -> ${newState.status}`);
        });
    }

    async ensureConnected(voiceChannelId, adapterCreator) {
        this.voiceChannelId = voiceChannelId;
        if (!this.connection || this.connection.state.status === VoiceConnectionStatus.Destroyed) {
            this.connection = joinVoiceChannel({
                channelId: voiceChannelId,
                guildId: this.guildId,
                adapterCreator,
                debug: true,
            });
            this.connection.on('stateChange', (oldState, newState) => {
                console.log(`[connection] guild ${this.guildId}: ${oldState.status} -> ${newState.status}`);
            });
            this.connection.on('debug', (message) => {
                console.log(`[connection debug] guild ${this.guildId}: ${message}`);
            });
            const subscription = this.connection.subscribe(this.player);
            if (!subscription) {
                console.error(`[queue] guild ${this.guildId}: failed to subscribe audio player to voice connection`);
            }
            await entersState(this.connection, VoiceConnectionStatus.Ready, 10_000);
        }
        this._clearIdleTimer();
    }

    enqueue(track) {
        this.tracks.push(track);
        if (!this.current) {
            this._playNext();
        }
    }

    async _playNext() {
        this._stopCurrentProcess();
        const next = this.tracks.shift() ?? null;
        if (!next) {
            this.current = null;
            this._startIdleTimer();
            return;
        }

        try {
            const resolved = await resolveToYoutube(next);
            this.current = resolved;
            const { resource, cleanup } = createTrackResource(
                `https://www.youtube.com/watch?v=${resolved.youtubeVideoId}`
            );
            this.currentCleanup = cleanup;
            this.player.play(resource);
            if (this.onTrackChange) this.onTrackChange(resolved);
        } catch (err) {
            console.error(`[queue] failed to play "${next.title}":`, err);
            this.current = null;
            this._playNext();
        }
    }

    skip() {
        this.player.stop(); // AudioPlayerStatus.Idle fires -> _playNext()
    }

    pause() {
        this.player.pause();
    }

    resume() {
        this.player.unpause();
    }

    remove(position) {
        const index = position - 1;
        if (index < 0 || index >= this.tracks.length) return null;
        return this.tracks.splice(index, 1)[0];
    }

    clear() {
        this.tracks = [];
    }

    shuffle() {
        for (let i = this.tracks.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [this.tracks[i], this.tracks[j]] = [this.tracks[j], this.tracks[i]];
        }
    }

    stop() {
        this.tracks = [];
        this.current = null;
        this._stopCurrentProcess();
        this.player.stop(true);
        if (this.connection && this.connection.state.status !== VoiceConnectionStatus.Destroyed) {
            this.connection.destroy();
        }
        this.connection = null;
        this._clearIdleTimer();
        guildQueues.delete(this.guildId);
    }

    _stopCurrentProcess() {
        if (this.currentCleanup) {
            this.currentCleanup();
            this.currentCleanup = null;
        }
    }

    _startIdleTimer() {
        this._clearIdleTimer();
        this.idleTimer = setTimeout(() => this.stop(), IDLE_DISCONNECT_MS);
    }

    _clearIdleTimer() {
        if (this.idleTimer) {
            clearTimeout(this.idleTimer);
            this.idleTimer = null;
        }
    }
}

export function getOrCreateQueue(guildId, textChannelId) {
    let queue = guildQueues.get(guildId);
    if (!queue) {
        queue = new GuildQueue(guildId, textChannelId);
        guildQueues.set(guildId, queue);
    }
    return queue;
}

export function getQueue(guildId) {
    return guildQueues.get(guildId) ?? null;
}
