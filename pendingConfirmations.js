const PENDING_TTL_MS = 5 * 60 * 1000;
const SWEEP_INTERVAL_MS = 60 * 1000;

const pending = new Map();

function makeId() {
    return Math.random().toString(36).slice(2, 10);
}

export function createPending(entry) {
    const id = makeId();
    pending.set(id, { ...entry, createdAt: Date.now() });
    return id;
}

// One-shot read: a confirm/cancel button click consumes the entry.
export function takePending(id) {
    const entry = pending.get(id);
    if (!entry) return null;
    pending.delete(id);
    return entry;
}

setInterval(() => {
    const cutoff = Date.now() - PENDING_TTL_MS;
    for (const [id, entry] of pending) {
        if (entry.createdAt < cutoff) pending.delete(id);
    }
}, SWEEP_INTERVAL_MS).unref();
