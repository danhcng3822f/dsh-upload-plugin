/**
 * The refs the client has told the host are live in each session's draft.
 *
 * The client is the only side that knows which attachments are live: the chips
 * live in the composer's draft, and the rail derives the live set as
 * `activeTokens(input.occurrences, store.list(sessionId))`
 * (`src/client/attachment-bar.ts`). The host owns the turn, so the set has to
 * cross the process boundary — the client pushes it over the plugin's own
 * endpoint (`src/host/endpoints.ts`, `handleSyncRefs`) and this store holds it
 * until the next turn claims it.
 *
 * A pure in-memory map on purpose: nothing here needs to survive a host restart,
 * because a draft that survived a restart is re-pushed by the client on its next
 * render, and an injection that never happened is better than one replayed into
 * an unrelated turn.
 *
 * @module dsh-upload-plugin/host/refs-store
 */
import type { PendingAttachment } from '../types.js';
/**
 * Replace one session's live set with what the client just reported.
 *
 * A push that differs from the held set replaces it AND re-arms it, spent or not:
 * the client only ever reports refs that are in the draft now, so a different set
 * is a fresh attachment the user just made, and it may legitimately inject in the
 * same turn — attach, send, attach again is two sends in one turn only when the
 * second is steering, which is exactly the case this allows.
 * @param sessionId - the session whose draft changed.
 * @param refs - the live set, oldest first; an empty array clears the session.
 */
export declare function syncRefs(sessionId: string, refs: readonly PendingAttachment[]): void;
/**
 * Claim one session's refs for the turn about to run, or undefined when there is
 * nothing to inject.
 *
 * Claiming and spending are one step by design: the caller receives the records
 * AND the set is marked spent, so no path reads the refs without also committing
 * to inject them.
 *
 * The guard covers a turn's later steps as well as later turns, because a spent
 * set is spent for good. That matters here specifically: `agent/pre-step` runs
 * once per STEP, not once per turn (`core/agent-loop/src/agent.ts:266` calls it
 * inside the `while (true)` step loop), so a turn that calls tools asks several
 * times, and "inject once per turn that has refs" has to hold across all of them.
 * The caller is what keeps a step of an UNRELATED turn from asking at all — see
 * the claim rule in `src/host/context-injection.ts`, which only lets a step that
 * carries the user's own input reach this function.
 * @param sessionId - the session whose turn is starting.
 * @returns the refs to inject, or undefined when the set is empty or already spent.
 */
export declare function claimRefs(sessionId: string): PendingAttachment[] | undefined;
/**
 * What the host holds for one session right now — the read half of the sync.
 *
 * This exists to make a failed attachment decidable in one request. After
 * attaching a file and sending, an empty `refs` says the CLIENT never got the set
 * to the host; a non-empty unspent set says the host holds it and no step has
 * claimed it; a spent set says a step claimed it and the injection is in the
 * log. Without it, all three look identical from the chat window.
 *
 * It reads the in-memory map and nothing else: no paths beyond what a push
 * already recorded, no mutation, and no effect on the one-shot guarantee — a
 * read neither spends a set nor re-arms one. An absent session is an empty,
 * unspent set rather than an error, because "the host holds nothing" is exactly
 * the answer a caller is usually asking for.
 * @param sessionId - the session to describe.
 * @returns the held set, oldest first, and whether it has been injected.
 */
export declare function readRefs(sessionId: string): {
    refs: PendingAttachment[];
    spent: boolean;
};
/**
 * Drop one session's set, spent or not.
 *
 * The session-disposal path: a session that is gone must not leave an
 * injection waiting for a turn that will never come.
 * @param sessionId - the session to forget.
 */
export declare function clearRefs(sessionId: string): void;
/**
 * Validate one ref row off the wire.
 *
 * The endpoint is same-origin and the payload is the plugin's own client, but a
 * malformed row would otherwise reach `instructionFor` and render `undefined`
 * into the model's context, so the shape is checked where it enters.
 * @param value - one element of the request's `refs` array.
 * @returns the row, or undefined when it is not a usable record.
 */
export declare function parsePendingAttachment(value: unknown): PendingAttachment | undefined;
