/**
 * Attachment records and the pure list operations over them.
 *
 * A record is what the plugin knows about one uploaded file; a chip in the
 * draft refers to it by `ref`. Nothing here touches the DOM, storage or DSH.
 */
/** The trigger-source name this plugin registers. Only chips it owns are serialized by it. */
export declare const VISION_SOURCE = "vision";
/** One uploaded attachment a session can reference from the composer. */
export interface AttachmentRecord {
    /** Human-readable, session-unique name; also the chip label. */
    token: string;
    /** Globally unique reference id — the codec resolves it with no session context. */
    ref: string;
    /** Workspace-relative path, e.g. `uploads/<session>/photo.png`. */
    relativePath: string;
    isPhoto: boolean;
    size: number;
    uploadedAt: number;
}
/** Structural view of one draft chip occurrence (avoids a runtime import of the slot package). */
export interface ChipOccurrence {
    source: string;
    ref: string;
    invalid?: boolean;
}
/**
 * Mint a session-unique token from an uploaded file name.
 * Keeps the extension so the model can see what it is being asked to read, and
 * suffixes `_2`, `_3`, … before the extension on collision.
 */
export declare function makeToken(fileName: string, taken: readonly string[]): string;
/**
 * Mint the globally unique reference id for a token.
 * The session tag is what makes it resolvable from `codec.serialize(ref)`, which
 * receives no session context.
 */
export declare function makeRef(sessionTag: string, token: string): string;
/** Append a record, replacing any earlier record with the same token. */
export declare function addRecord(records: readonly AttachmentRecord[], record: AttachmentRecord): AttachmentRecord[];
/** Drop one record by token. */
export declare function removeRecord(records: readonly AttachmentRecord[], token: string): AttachmentRecord[];
/** Find one record by token. */
export declare function findRecord(records: readonly AttachmentRecord[], token: string): AttachmentRecord | undefined;
/**
 * The refs whose chip is in the draft right now — the only attachments that get
 * serialized on send.
 *
 * This is the whole one-shot guarantee: DSH clears the draft when a send
 * settles, so the next message has no chips and therefore no injection. There is
 * deliberately no pending queue anywhere in the plugin.
 */
export declare function activeTokens(occurrences: readonly ChipOccurrence[], records: readonly AttachmentRecord[]): string[];
