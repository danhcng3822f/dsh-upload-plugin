import { type AttachmentRecord } from './attachments.js';
/** The slice of `localStorage` this store needs (injected so tests stay in node). */
export interface KeyValueStorage {
    getItem(key: string): string | null;
    setItem(key: string, value: string): void;
    removeItem(key: string): void;
    /**
     * Enumeration surface. `localStorage` provides it and `byRef` depends on it: a
     * chip restored together with a persisted draft after a reload must resolve
     * against a session this store has not cached yet. A storage without it still
     * serves everything except cross-session `byRef`.
     */
    readonly length?: number;
    key?(index: number): string | null;
}
/**
 * Per-session attachment records, persisted to injected storage.
 *
 * Records are history: they survive a send so `/uploads` can list them. What
 * gets injected is decided by `activeTokens` over the live draft, never by this
 * store — that is what keeps attachment one-shot per send.
 */
export declare class AttachmentStore {
    private readonly storage;
    private readonly cache;
    constructor(storage: KeyValueStorage);
    /** Records for one session, newest last. */
    list(sessionId: string): readonly AttachmentRecord[];
    /** Token list for one session, used for collision-free minting and the lexicon. */
    tokens(sessionId: string): readonly string[];
    /** Mint a token that does not collide within the session. */
    nextToken(sessionId: string, fileName: string): string;
    /** The ref for a token in this session — the id the chip carries. */
    refFor(sessionId: string, token: string): string;
    /** Add or replace a record. */
    add(sessionId: string, record: AttachmentRecord): void;
    /** Drop one record by token. */
    remove(sessionId: string, token: string): void;
    /** Find a record by token within one session. */
    find(sessionId: string, token: string): AttachmentRecord | undefined;
    /**
     * Resolve a record from its ref alone.
     * `codec.serialize(ref)` receives no session, so this is the lookup the codec uses.
     */
    byRef(ref: string): AttachmentRecord | undefined;
    private allSessions;
    private load;
    private write;
    /** Number of persisted keys, when the storage exposes enumeration. */
    private storageLength;
    /** Nth persisted key, when the storage exposes enumeration. */
    private storageKeyAt;
}
