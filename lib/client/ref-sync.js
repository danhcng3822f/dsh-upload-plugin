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
 *   the empty draft (`ui-conversation/src/client/input/machine.ts:546`), so
 *   the next render pushes the empty set.
 *
 * The push is de-duplicated against the last set sent for that session, because
 * "on every render" means once per keystroke: without the guard this would be a
 * POST per character typed.
 *
 * ## Why a push carries a reason (R31)
 *
 * "Here is the live set" is enough for every non-empty push, and not enough for
 * an empty one: the draft empties because a send consumed it OR because the user
 * removed the attachment, and those need opposite treatment on the host.
 *
 * - After a send the refs belong to the turn that is about to run, and the host
 *   must still have them when its first step claims them. Clearing them there is
 *   the bug: the empty push lands before the claim can happen, and every message
 *   with an attachment injected nothing.
 * - After a removal the user took the attachment back, and injecting it is wrong.
 *
 * This is decided here because the client is the side that can tell the two
 * apart, and the send is observable on exactly the path that needs it:
 * `ReferenceCodec.serialize` (`src/client/reference.ts`) is called once per
 * occurrence DURING submit (`ui-conversation/src/client/input/facade.ts:427`,
 * reached from the `default-sink` effect at `:416`), and the draft is not cleared
 * until every serialization has resolved (`hub.ts:158` → `facade.ts:155` →
 * `machine.ts:544`). So the mark is set before the empty push, by the promise
 * chain rather than by any window of time. A removal never calls `serialize` at
 * all.
 *
 * The shape chosen is the reason the host honours, not the client swallowing the
 * push, and the difference matters: a client that simply did not issue the empty
 * push would leave its own de-duplication cache claiming the host holds a set the
 * host may not hold, and the next identical set — the user re-referencing the
 * same file through `/photos`, which reuses the record's ref — would then be
 * de-duplicated away and never re-armed. Saying why keeps the cache truthful and
 * puts the decision where both facts are known.
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
/**
 * How many serialized refs are remembered while waiting for the push that will
 * classify them. Bounded because `serialize` is called by the harness and a ref
 * that never reaches a push (a send blocked by a later chip) would otherwise sit
 * here for the life of the page. Beyond a handful of attachments in one draft the
 * oldest are dropped, which at worst classifies one empty push as a removal —
 * the pre-R31 behaviour.
 */
const SERIALIZED_LIMIT = 64;
/** The last set pushed per session, as a signature, so an unchanged render costs no request. */
const lastPushed = new Map();
/**
 * The refs a submit has serialized since the last push — the evidence that a
 * send, rather than a removal, is what emptied the draft.
 *
 * Keyed by ref rather than by session because `codec.serialize(ref)` receives no
 * session: the ref is the only thing it is given. It does not need one — refs are
 * session-tagged and globally unique (`makeRef`), so a ref can only ever match
 * the session that owns it, and the classification below only ever consults the
 * refs of ONE session's last push.
 */
const serialized = new Set();
/** Sessions whose rail ✕ has written a removal into the draft since the last push. */
const removed = new Set();
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
 * Note that one chip was serialized for a send.
 *
 * Called by the reference codec (`src/client/reference.ts`) once per occurrence on
 * the submit path, and by nothing else. This is the send's only observable trace
 * on the client, and it is set strictly before the draft is committed — the
 * harness awaits every serialization before it clears the draft — so the empty
 * push that follows a send can be recognized as one.
 *
 * A ref whose serialization FAILS is deliberately not marked: the send is blocked
 * in that case and the draft is retained, so no empty push follows it.
 * @param ref - the chip's reference id.
 */
export function noteSerializedRef(ref) {
    if (ref === '')
        return;
    // Re-insert at the end, so the cap below drops the refs that have waited longest.
    serialized.delete(ref);
    serialized.add(ref);
    if (serialized.size > SERIALIZED_LIMIT) {
        const oldest = serialized.values().next().value;
        if (oldest !== undefined)
            serialized.delete(oldest);
    }
}
/**
 * Note that the rail's ✕ took one attachment out of the draft.
 *
 * Called from the one place that knows the removal really happened — the remover
 * in `src/client/attachment-bar.ts`, immediately before the draft write — because
 * a removal must beat a send mark that an earlier, blocked submit left behind:
 * the user took the attachment back after trying to send it, and the host must
 * not inject it.
 *
 * A removal by EDITING the draft (backspacing over the placeholder) has no such
 * call, and does not need one: an empty push with no evidence at all is classified
 * as a removal, which is also why a removal mark that is never consumed is
 * harmless — `removed` is the default it would have been given anyway.
 * @param sessionId - the session whose draft the removal was written into.
 */
export function noteDraftRemoval(sessionId) {
    if (sessionId === '')
        return;
    removed.add(sessionId);
}
/**
 * Why the set about to be pushed is being reported.
 *
 * Two of the four reasons need evidence, and each has a different kind:
 *
 * - a non-empty set is `retry` only when it is the very set whose push was not
 *   confirmed, and `live` otherwise — the client does not push an unchanged set,
 *   so a non-empty push it does issue is a change the user made;
 * - an empty set is `sent` when the refs this session last reported were
 *   serialized for a send since that push, `removed` when the rail took one out,
 *   and `removed` when there is no evidence either way — the default, because
 *   losing an injection costs the user a re-attach while injecting a removed file
 *   is wrong.
 *
 * An unconfirmed push whose set has not changed re-SAYS what it said rather than
 * being re-derived. That is not a shortcut: the evidence was spent by the first
 * attempt, so re-deriving an empty set would read a `sent` as a removal and erase
 * the refs — the exact failure this module exists to prevent, reached through the
 * retry path instead.
 * @param sessionId - the session being pushed.
 * @param refs - the live set about to be reported.
 * @param signature - the set's signature, already computed by the caller.
 * @param previous - what this session last pushed, if anything.
 * @returns the reason to carry.
 */
function reasonFor(sessionId, refs, signature, previous) {
    const sameSet = previous !== undefined && previous.signature === signature;
    if (refs.length > 0) {
        return previous !== undefined && !previous.delivered && sameSet ? 'retry' : 'live';
    }
    // The rail's own removal is the most recent thing the user did, so it wins over
    // a send mark that a blocked or failed submit left behind.
    if (removed.has(sessionId))
        return 'removed';
    if (previous !== undefined && !previous.delivered && sameSet)
        return previous.reason;
    if (previous !== undefined && previous.refs.some(ref => serialized.has(ref)))
        return 'sent';
    return 'removed';
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
    const previous = lastPushed.get(sessionId);
    // Only a push the host CONFIRMED is de-duplicated against. An unconfirmed one
    // is re-issued, as `retry`, because the host may never have received it.
    if (previous !== undefined && previous.delivered && previous.signature === signature)
        return false;
    const reason = reasonFor(sessionId, refs, signature, previous);
    // The evidence is spent by the push that reads it, whatever it turns out to be:
    // a mark left behind by a submit that never emptied the draft must not classify
    // a later, unrelated empty push as a send.
    removed.delete(sessionId);
    for (const ref of previous?.refs ?? [])
        serialized.delete(ref);
    const entry = { signature, refs: refs.map(record => record.ref), reason, delivered: true };
    lastPushed.set(sessionId, entry);
    const body = JSON.stringify({
        sessionId,
        reason,
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
        undelivered(sessionId, entry);
        return false;
    }
    void request.then((response) => {
        // A push the host refused must not be remembered as delivered, or the next
        // render would de-duplicate against a set the host never received and the
        // attachment would never be injected. Clearing the flag re-arms it.
        if (!response.ok)
            undelivered(sessionId, entry);
    }, () => { undelivered(sessionId, entry); });
    return true;
}
/**
 * Mark one push as not confirmed, unless a later push has replaced it.
 *
 * The identity check matters: a slow failure must not clear the flag on the push
 * that came after it, which is the set the next render will compare against.
 * @param sessionId - the session the push belonged to.
 * @param entry - the push whose response was not ok.
 */
function undelivered(sessionId, entry) {
    if (lastPushed.get(sessionId) === entry)
        entry.delivered = false;
}
/**
 * Forget what was last pushed for a session, and any evidence waiting to classify
 * the next push.
 *
 * For tests, and for a session switch: clearing means the set is re-pushed rather
 * than assumed delivered, and a stale send or removal mark cannot decide a push
 * that belongs to a different draft.
 * @param sessionId - the session to forget, or undefined for every session.
 */
export function resetRefSync(sessionId) {
    if (sessionId === undefined) {
        lastPushed.clear();
        serialized.clear();
        removed.clear();
        return;
    }
    const previous = lastPushed.get(sessionId);
    for (const ref of previous?.refs ?? [])
        serialized.delete(ref);
    lastPushed.delete(sessionId);
    removed.delete(sessionId);
}
