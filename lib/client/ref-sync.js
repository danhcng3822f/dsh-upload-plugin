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
import { activeTokens } from './attachments.js';
/** The endpoint the client pushes to (registered by `src/index.ts`). */
export const REFS_ENDPOINT = '/api/vision-plugin/refs';
/** The last set pushed per session, as a signature, so an unchanged render costs no request. */
const lastPushed = new Map();
/** Order-sensitive signature of a set: order is the attachment order. */
function signatureOf(refs) {
    return refs
        .map(record => `${record.ref}\u0000${record.relativePath}\u0000${record.isPhoto ? '1' : '0'}`)
        .join('\u0001');
}
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
export function liveRecords(occurrences, records, byRef) {
    const out = [];
    for (const ref of activeTokens(occurrences, records)) {
        const record = byRef(ref);
        if (record !== undefined)
            out.push(record);
    }
    return out;
}
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
export function syncActiveRefs(sessionId, refs, fetchImpl = typeof fetch === 'function' ? fetch : null) {
    if (sessionId === '')
        return false;
    // Nothing to issue with: record nothing, or a later push that DOES have a
    // transport would be de-duplicated against a set that never left the browser.
    if (fetchImpl === null)
        return false;
    const signature = signatureOf(refs);
    if (lastPushed.get(sessionId) === signature)
        return false;
    lastPushed.set(sessionId, signature);
    const body = JSON.stringify({
        sessionId,
        refs: refs.map(record => ({
            ref: record.ref,
            relativePath: record.relativePath,
            isPhoto: record.isPhoto,
        })),
    });
    let request;
    try {
        request = Promise.resolve(fetchImpl(REFS_ENDPOINT, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body,
        }));
    }
    catch {
        // A transport that throws synchronously must not escape either: this runs in
        // a React effect on the composer's render path.
        lastPushed.delete(sessionId);
        return false;
    }
    void request.then((response) => {
        // A push the host refused must not be remembered as delivered, or the next
        // render would de-duplicate against a set the host never received and the
        // attachment would never be injected. Clearing the signature re-arms it.
        if (!response.ok)
            lastPushed.delete(sessionId);
    }, () => { lastPushed.delete(sessionId); });
    return true;
}
/**
 * Forget what was last pushed for a session.
 *
 * For tests, and for a session switch: clearing means the set is re-pushed rather
 * than assumed delivered.
 * @param sessionId - the session to forget, or undefined for every session.
 */
export function resetRefSync(sessionId) {
    if (sessionId === undefined)
        lastPushed.clear();
    else
        lastPushed.delete(sessionId);
}
