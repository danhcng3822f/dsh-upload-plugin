/**
 * The client half of the ref sync: telling the host which attachments are live.
 *
 * The host owns the turn and therefore the context injection, but it cannot see
 * the composer's draft — the chips live in the browser. So the client pushes the
 * live set over the plugin's own endpoint (`/api/vision-plugin/refs`) and the
 * host holds it until the next turn claims it
 * (`src/host/context-injection.ts`).
 *
 * ## Where the set comes from
 *
 * `activeTokens(input.occurrences, store.list(sessionId))`
 * (`src/client/attachments.ts`), the same derivation the rail already renders
 * from — this module's `liveRecords` is that derivation, and the rail now calls
 * it too. One source of truth: what the rail shows is exactly what is pushed, so
 * a card the user can see and a ref the model is told about cannot disagree.
 *
 * ## When it is pushed
 *
 * `syncActiveRefs` is called from the rail entry's effect
 * (`src/client/attachment-bar.ts`), which runs on every composer render. That one
 * call site covers all three changes the brief names, without the plugin having to
 * observe anything itself:
 *
 * - a chip minted — `mintChip` bumps `draftRev` and adds an occurrence, so the
 *   share changes and the effect re-runs;
 * - a chip removed by the rail's ✕ — the remover writes the draft through
 *   `inputActions.setDraft`, the same re-render;
 * - a send that empties the draft — the machine clears `occurrences` and adopts
 *   the empty draft (`ui-conversation/src/client/input/machine.ts:516,546`), so
 *   the next render pushes the empty set.
 *
 * The push is de-duplicated against the last set sent for that session, because
 * "on every render" means once per keystroke: without the guard this would be a
 * POST per character typed.
 *
 * ## What it is NOT relied on for
 *
 * The one-shot guarantee is the HOST's, not this module's. The host marks a set
 * spent when it injects it (`src/host/refs-store.ts`), so the message after a send
 * carries no instruction even if this push never lands, or lands late. The two
 * mechanisms agree — the client also goes empty after a committed send — and the
 * host's is the one that still holds if they ever disagree.
 *
 * @module dsh-upload-plugin/client/ref-sync
 */
import { type AttachmentRecord, type ChipOccurrence } from './attachments.js';
/** The endpoint the client pushes to (registered by `src/index.ts`). */
export declare const REFS_ENDPOINT = "/api/vision-plugin/refs";
/**
 * The records whose chip is in this draft right now.
 *
 * `activeTokens` answers WHICH refs are live — it is the function that drops chips
 * whose record this store never had — and `byRef` then resolves each one, so a
 * chip whose record is gone yields nothing rather than a half-record. The rail
 * renders this list and the sync pushes it, which is what keeps the two aligned.
 * @param occurrences - the draft's chip occurrences.
 * @param records - this session's records, for `activeTokens`' known-ref check.
 * @param byRef - resolver from ref to record.
 * @returns the live records, in draft order.
 */
export declare function liveRecords(occurrences: readonly ChipOccurrence[], records: readonly AttachmentRecord[], byRef: (ref: string) => AttachmentRecord | undefined): AttachmentRecord[];
/**
 * Push one session's live set to the host, when it differs from the last push.
 *
 * Never throws and never rejects: this runs inside a React effect on the composer's
 * render path, and a failed sync must not break the composer. A lost push costs one
 * turn's injection — the user can re-attach — while an exception here would cost
 * the rail and the draft.
 * @param sessionId - the session whose draft changed.
 * @param refs - the live set, in draft order.
 * @param fetchImpl - the request implementation. Defaults to the global `fetch`;
 * pass `null` to assert that nothing is issued at all (a default parameter cannot
 * express "explicitly none", since `undefined` selects the default).
 * @returns whether a request was actually issued.
 */
export declare function syncActiveRefs(sessionId: string, refs: readonly AttachmentRecord[], fetchImpl?: typeof fetch | null): boolean;
/**
 * Forget what was last pushed for a session.
 *
 * For tests, and for a session switch: clearing means the set is re-pushed rather
 * than assumed delivered.
 * @param sessionId - the session to forget, or undefined for every session.
 */
export declare function resetRefSync(sessionId?: string): void;
