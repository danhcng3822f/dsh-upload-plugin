import type { AttachmentStore } from './attachment-store.js';
import { type ChipOccurrence } from './attachments.js';
/**
 * One live-draft snapshot: the session on screen and the chips its draft holds
 * right now. This is the rail's only data source — a record list of its own
 * would keep showing attachments the sent message already consumed.
 */
export interface RailSnapshot {
    sessionId: string;
    occurrences: readonly ChipOccurrence[];
}
/** Bind the record index (the plugin entry owns it; every other reader asks here). */
export declare function bindAttachmentStore(next: AttachmentStore): void;
/** The bound record index, or undefined before the plugin entry binds it. */
export declare function attachmentStore(): AttachmentStore | undefined;
/** Bind the draft write the rail's remove button uses. */
export declare function bindChipRemover(remove: (sessionId: string, ref: string) => void): void;
/**
 * The draft with one chip's placeholder deleted and every other character left
 * exactly as the user typed it.
 * @param draft - the live draft.
 * @param offset - the occurrence's placeholder offset.
 * @returns the next draft, or undefined when no placeholder sits at that offset —
 * a stale offset must never eat a character the user typed.
 */
export declare function draftWithoutChip(draft: string, offset: number): string | undefined;
/** Host-served URL for one uploaded file (the endpoint `/uploads` previews through too). */
export declare function attachmentViewUrl(sessionId: string, relativePath: string): string;
export declare function detectActiveSessionId(): string | null;
/**
 * Remove one attachment from the draft.
 *
 * The chip IS the attachment: the record only resolves a chip that is already in
 * the draft, so dropping the record alone would leave a chip whose serialization
 * fails and block the send. This deletes just that placeholder — typed text is
 * untouched — and the machine drops the occurrence with it, which is what takes
 * the card off the rail.
 * @param sessionId - the session whose draft holds the chip.
 * @param ref - the chip's reference id.
 */
export declare function removeDraftAttachment(sessionId: string, ref: string): void;
/**
 * One chip occurrence as the composer share reports it: the plugin's structural
 * `ChipOccurrence` plus the placeholder offset the remove button needs. `offset`
 * stays optional because it belongs to an external contract — the guard for a
 * missing one is a real branch, not dead code.
 */
interface RailOccurrence extends ChipOccurrence {
    readonly offset?: number;
}
/** The live `InputZone` share slice the rail entry reads. */
export interface RailEntryProps {
    sessionId: string;
    input?: {
        draft: string;
        occurrences: readonly RailOccurrence[];
    };
    inputActions?: {
        setDraft(text: string): void;
    };
}
/**
 * The composer entry that drives the rail.
 *
 * The rail is plain DOM injected into the composer card, so something that React
 * re-renders has to push the live draft into it. This entry is that something: it
 * sits in the composer tool row, receives the session's `InputZone` share and the
 * public `inputActions`, and re-renders the rail whenever either changes — which
 * is why a sent message empties the rail with no bookkeeping of its own. It
 * renders nothing.
 *
 * The rail's remove button is armed here too: it needs the draft write, which only
 * a session-scope slot component is handed.
 */
export declare function AttachmentRailEntry({ sessionId, input, inputActions }: RailEntryProps): null;
/**
 * DeepSeek Harness native-styled Image Lightbox
 */
export declare function openImageLightbox(imageUrl: string, title: string): void;
/**
 * Render the attachment rail for one live-draft snapshot, directly inside
 * `[data-composer-card="true"]`.
 *
 * The rail shows only what the draft currently references, so a sent message
 * empties it and a chip removed from the draft takes its card with it — no
 * plugin-side list, and therefore nothing to go stale between sends.
 * @param snapshot - the session on screen and its draft's chip occurrences.
 */
export declare function renderAttachmentBar(snapshot: RailSnapshot): void;
export {};
