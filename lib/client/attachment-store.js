import { addRecord, findRecord, makeRef, makeToken, removeRecord, } from './attachments.js';
const PREFIX = 'dsh_vision_attachments_';
/** The session's short tag, used in refs and file names. */
function sessionTag(sessionId) {
    return sessionId.replace(/^session-/, '').slice(0, 8) || 'common';
}
/**
 * Per-session attachment records, persisted to injected storage.
 *
 * Records are history: they survive a send so `/uploads` can list them. What
 * gets injected is decided by `activeTokens` over the live draft, never by this
 * store — that is what keeps attachment one-shot per send.
 */
export class AttachmentStore {
    storage;
    cache = new Map();
    constructor(storage) {
        this.storage = storage;
    }
    /** Records for one session, newest last. */
    list(sessionId) {
        const cached = this.cache.get(sessionId);
        if (cached !== undefined)
            return cached;
        const loaded = this.load(sessionId);
        this.cache.set(sessionId, loaded);
        return loaded;
    }
    /** Token list for one session, used for collision-free minting and the lexicon. */
    tokens(sessionId) {
        return this.list(sessionId).map(r => r.token);
    }
    /** Mint a token that does not collide within the session. */
    nextToken(sessionId, fileName) {
        return makeToken(fileName, this.tokens(sessionId));
    }
    /** The ref for a token in this session — the id the chip carries. */
    refFor(sessionId, token) {
        return makeRef(sessionTag(sessionId), token);
    }
    /** Add or replace a record. */
    add(sessionId, record) {
        this.write(sessionId, addRecord(this.list(sessionId), record));
    }
    /** Drop one record by token. */
    remove(sessionId, token) {
        this.write(sessionId, removeRecord(this.list(sessionId), token));
    }
    /** Find a record by token within one session. */
    find(sessionId, token) {
        return findRecord(this.list(sessionId), token);
    }
    /**
     * Resolve a record from its ref alone.
     * `codec.serialize(ref)` receives no session, so this is the lookup the codec uses.
     */
    byRef(ref) {
        for (const records of this.allSessions()) {
            const hit = records.find(r => r.ref === ref);
            if (hit !== undefined)
                return hit;
        }
        return undefined;
    }
    allSessions() {
        const out = [...this.cache.values()];
        for (let i = 0; i < this.storageLength(); i++) {
            const key = this.storageKeyAt(i);
            if (key === null || !key.startsWith(PREFIX))
                continue;
            const sessionId = key.slice(PREFIX.length);
            if (!this.cache.has(sessionId))
                out.push(this.load(sessionId));
        }
        return out;
    }
    load(sessionId) {
        const raw = this.storage.getItem(PREFIX + sessionId);
        if (raw === null)
            return [];
        try {
            const parsed = JSON.parse(raw);
            if (!Array.isArray(parsed))
                return [];
            return parsed.filter((r) => typeof r === 'object' && r !== null
                && typeof r.token === 'string'
                && typeof r.ref === 'string');
        }
        catch {
            return [];
        }
    }
    write(sessionId, records) {
        this.cache.set(sessionId, records);
        try {
            this.storage.setItem(PREFIX + sessionId, JSON.stringify(records));
        }
        catch {
            // Quota or privacy mode: the in-memory cache still serves this session.
        }
    }
    /** Number of persisted keys, when the storage exposes enumeration. */
    storageLength() {
        return typeof this.storage.length === 'number' ? this.storage.length : 0;
    }
    /** Nth persisted key, when the storage exposes enumeration. */
    storageKeyAt(index) {
        return typeof this.storage.key === 'function' ? this.storage.key(index) : null;
    }
}
