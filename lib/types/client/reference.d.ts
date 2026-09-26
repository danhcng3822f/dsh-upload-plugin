import type { AttachmentStore } from './attachment-store.js';
import type { AttachmentRecord } from './attachments.js';
import { VISION_SOURCE } from './attachments.js';
/** Structural shapes for the trigger-source contract (type-only elsewhere; no runtime import). */
export interface SourceSession {
    sessionId: string;
}
export interface SourceCandidate {
    name: string;
    description?: string;
}
export interface ReferenceInsertPayload {
    source: string;
    ref: string;
    label: string;
    clipboardText: string;
}
export interface TokenSpanPayload {
    start: number;
    end: number;
    draftRev: number;
}
export interface VisionSource {
    trigger: '@';
    name: typeof VISION_SOURCE;
    candidates(session: SourceSession, req: unknown): Promise<readonly SourceCandidate[]>;
    onPick(pick: {
        candidate: SourceCandidate;
        session: SourceSession;
    }): unknown;
    lexicon(session: SourceSession): readonly string[];
    codec: {
        clipboardText(ref: string): string;
        serialize(ref: string, signal: AbortSignal): Promise<string>;
    };
}
/**
 * The plugin's reference source.
 *
 * The draft holds one U+FFFC chip per inserted reference; the chip carries this
 * source's name and the record's ref. At submit the facade calls `codec.serialize`
 * once per chip and splices the result into the prompt — that is the only place
 * the instruction text ever exists.
 */
export declare function createVisionSource(store: AttachmentStore): VisionSource;
/**
 * Mint one chip into the session's draft.
 *
 * `InputState.draftRev` is a CAS token: a stale value makes the whole scoped
 * event a no-op, so the caller must pass the live value from `InputZone.input`.
 * @returns true when the scoped consumer applied the insert.
 */
export declare function mintChip(sessions: {
    scope(id: string): {
        bail(ctx: unknown, event: string, payload: unknown): unknown;
    } | undefined;
} | undefined, sessionId: string, input: {
    draft: string;
    draftRev: number;
}, record: AttachmentRecord): boolean;
