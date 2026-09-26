import { VISION_SOURCE } from './attachments.js';
import { instructionFor } from './instruction.js';
/**
 * The plugin's reference source.
 *
 * The draft holds one U+FFFC chip per inserted reference; the chip carries this
 * source's name and the record's ref. At submit the facade calls `codec.serialize`
 * once per chip and splices the result into the prompt — that is the only place
 * the instruction text ever exists.
 */
export function createVisionSource(store) {
    return {
        trigger: '@',
        name: VISION_SOURCE,
        candidates: async (session) => store.list(session.sessionId).map(record => ({
            name: record.token,
            description: record.relativePath,
        })),
        onPick: (pick) => {
            const record = store.find(pick.session.sessionId, pick.candidate.name);
            const ref = record?.ref ?? store.refFor(pick.session.sessionId, pick.candidate.name);
            return {
                kind: 'insert',
                insert: {
                    source: VISION_SOURCE,
                    ref,
                    label: pick.candidate.name,
                    clipboardText: `@${pick.candidate.name}`,
                },
            };
        },
        // Lets the render side decorate a typed `@token` and lets paste matching see
        // this session's names. Synchronous by contract — no fetching here.
        lexicon: (session) => store.tokens(session.sessionId),
        codec: {
            // Reverse-resolve through the store: the session tag is not parseable out
            // of the ref reliably, and the record already holds the readable token.
            clipboardText: (ref) => `@${store.byRef(ref)?.token ?? ref}`,
            // `ref` is globally unique (session tag + token), which is what makes this
            // resolvable without a session parameter.
            serialize: async (ref, signal) => {
                if (signal.aborted)
                    throw new Error('aborted');
                const record = store.byRef(ref);
                if (record === undefined) {
                    // Blocking the send is the documented contract: never downgrade to the
                    // clipboard form behind the user's back.
                    throw new Error(`vision: unknown attachment reference "${ref}"`);
                }
                return instructionFor(record);
            },
        },
    };
}
/**
 * Mint one chip into the session's draft.
 *
 * `InputState.draftRev` is a CAS token: a stale value makes the whole scoped
 * event a no-op, so the caller must pass the live value from `InputZone.input`.
 * @returns true when the scoped consumer applied the insert.
 */
export function mintChip(sessions, sessionId, input, record) {
    const actx = sessions?.scope(sessionId);
    if (actx === undefined)
        return false;
    const payload = {
        reference: {
            source: VISION_SOURCE,
            ref: record.ref,
            label: record.token,
            clipboardText: `@${record.token}`,
        },
        span: { start: input.draft.length, end: input.draft.length, draftRev: input.draftRev },
    };
    return actx.bail(actx, 'slash/input-insert-reference', payload) === true;
}
