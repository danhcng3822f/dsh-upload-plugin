/**
 * Attachment records and the pure list operations over them.
 *
 * A record is what the plugin knows about one uploaded file; a chip in the
 * draft refers to it by `ref`. Nothing here touches the DOM, storage or DSH.
 */
/** The trigger-source name this plugin registers. Only chips it owns are serialized by it. */
export const VISION_SOURCE = 'vision';
/**
 * Mint a session-unique token from an uploaded file name.
 * Keeps the extension so the model can see what it is being asked to read, and
 * suffixes `_2`, `_3`, … before the extension on collision.
 */
export function makeToken(fileName, taken) {
    const base = fileName.replace(/^session_[a-zA-Z0-9_-]+__/, '');
    if (!taken.includes(base))
        return base;
    const dot = base.lastIndexOf('.');
    const stem = dot > 0 ? base.slice(0, dot) : base;
    const ext = dot > 0 ? base.slice(dot) : '';
    for (let n = 2;; n++) {
        const candidate = `${stem}_${n}${ext}`;
        if (!taken.includes(candidate))
            return candidate;
    }
}
/**
 * Mint the globally unique reference id for a token.
 * The session tag is what makes it resolvable from `codec.serialize(ref)`, which
 * receives no session context.
 */
export function makeRef(sessionTag, token) {
    return `${sessionTag}-${token}`;
}
/** Append a record, replacing any earlier record with the same token. */
export function addRecord(records, record) {
    return [...records.filter(r => r.token !== record.token), record];
}
/** Drop one record by token. */
export function removeRecord(records, token) {
    return records.filter(r => r.token !== token);
}
/** Find one record by token. */
export function findRecord(records, token) {
    return records.find(r => r.token === token);
}
/**
 * The refs whose chip is in the draft right now — the only attachments that get
 * serialized on send.
 *
 * This is the whole one-shot guarantee: DSH clears the draft when a send
 * settles, so the next message has no chips and therefore no injection. There is
 * deliberately no pending queue anywhere in the plugin.
 */
export function activeTokens(occurrences, records) {
    const known = new Set(records.map(r => r.ref));
    const out = [];
    for (const o of occurrences) {
        if (o.source !== VISION_SOURCE || o.invalid === true)
            continue;
        if (!known.has(o.ref) || out.includes(o.ref))
            continue;
        out.push(o.ref);
    }
    return out;
}
