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
 * ## Why a push carries a reason (R31)
 *
 * A non-empty push is unambiguous: the client is the authority on its own draft.
 * An empty one is not, and the two causes need opposite treatment. A committed
 * send empties the draft, and the refs it consumed still belong to the turn
 * about to run — clearing them there is the bug this reason exists to fix, since
 * the client's own empty push landed BEFORE the turn's first step could claim
 * them. A removal empties the draft because the user took the attachment back,
 * and injecting it would be wrong.
 *
 * So `reason` decides, and the client is the side that knows
 * (`src/client/ref-sync.ts`): `sent` keeps the held set untouched, `removed`
 * clears it, `live` replaces and re-arms it, `retry` re-asserts it without
 * re-arming an identical held set.
 *
 * A pure in-memory map on purpose: nothing here needs to survive a host restart,
 * because a draft that survived a restart is re-pushed by the client on its next
 * render, and an injection that never happened is better than one replayed into
 * an unrelated turn. The push log below is in memory for the same reason — it
 * describes THIS process's view, which is exactly what a diagnosis is asking
 * about.
 *
 * @module dsh-upload-plugin/host/refs-store
 */

import type { PendingAttachment, RefPushReason, RefPushRecord } from '../types.js'

/**
 * How many pushes per session the diagnostic log keeps.
 *
 * Bounded because a composer re-render pushes on every change and a long session
 * would otherwise grow this map without limit. Twenty is several times the
 * attach/send/attach/remove cycle a diagnosis walks, and the oldest entry falling
 * off is harmless: the log answers "what did the last few pushes say", not "what
 * happened an hour ago".
 */
export const PUSH_LOG_LIMIT = 20

/** What the host holds for one session: the live refs, whether they are still owed, and how they got there. */
interface SessionRefs {
  /** The live set as the client last reported it, oldest first. */
  refs: PendingAttachment[]
  /**
   * Whether this set has already been injected.
   *
   * This is the one-shot guarantee the feature was built on: a set is injected
   * once and then never again, so the message AFTER a send carries no instruction
   * unless the user attaches something new. It is a plain boolean rather than a
   * "last injected turn" because a turn number cannot express "never again" —
   * every later turn is a different number, and a comparison against one would
   * happily re-inject the same set on the next message.
   */
  spent: boolean
  /** The last pushes for this session, oldest first, capped at `PUSH_LOG_LIMIT`. */
  log: RefPushRecord[]
}

const sessions = new Map<string, SessionRefs>()

/**
 * Apply one push to one session's live set, honouring the reason it carries.
 *
 * The four rules, and why each is what it is:
 *
 * - `live` REPLACES and re-arms, even when the set is identical to the held one.
 *   That is what makes a re-attach after a send inject again: the client only
 *   says `live` for a set that differs from the last one it reported, so an
 *   identical set arriving as `live` is the user referencing the same file again
 *   (the `/photos` path re-references an existing record, ref and all), not a
 *   redundant render. It may legitimately inject in the same turn — attach, send,
 *   attach again is two sends in one turn only when the second is steering, which
 *   is exactly the case this allows.
 * - `retry` is the client re-sending a set whose response was never confirmed.
 *   An identical set keeps its spent flag: the client re-pushes on every composer
 *   render, and a redundant push must not resurrect a spent set. A DIFFERENT set
 *   still replaces, because the held set is then simply stale.
 * - `sent` does NOT describe the set it carries; it says "my draft was committed,
 *   so what you hold is still owed to the turn about to run". The held refs and
 *   the spent flag are both left exactly as they were.
 * - `removed` replaces, which for the empty set the client sends is a clear.
 * @param sessionId - the session whose draft changed; an empty id is ignored before
 * anything is recorded, since there is no session to record against.
 * @param refs - the live set, oldest first; an empty array clears the session
 * unless the reason says the send that emptied it is still owed (`sent`).
 * @param reason - why the client is reporting it (see `RefPushReason`).
 */
export function syncRefs(
  sessionId: string,
  refs: readonly PendingAttachment[],
  reason: RefPushReason,
): void {
  if (sessionId === '') return
  const current = sessions.get(sessionId)
  const held = current?.refs ?? []
  const spent = current?.spent ?? false
  const log = appendedLog(current?.log, refs.length, reason)

  // The send: the client's draft was committed, so the set it reported before is
  // the one the turn about to run must still be able to claim. Nothing about the
  // held state changes — not the refs, not the spent flag — and the log records
  // that this is why the set is still there.
  if (reason === 'sent' && refs.length === 0) {
    sessions.set(sessionId, { refs: [...held], spent, log })
    return
  }

  if (reason === 'retry' && sameRefs(held, refs)) {
    sessions.set(sessionId, { refs: [...refs], spent, log })
    return
  }

  sessions.set(sessionId, { refs: [...refs], spent: false, log })
}

/** The log with one push appended, trimmed to the newest `PUSH_LOG_LIMIT`. */
function appendedLog(
  log: readonly RefPushRecord[] | undefined,
  count: number,
  reason: RefPushReason,
): RefPushRecord[] {
  const next = [...(log ?? []), { at: Date.now(), count, reason }]
  return next.length > PUSH_LOG_LIMIT ? next.slice(next.length - PUSH_LOG_LIMIT) : next
}

/**
 * Read one ref row's reason off the wire.
 *
 * An absent or unrecognized reason is an older client, and the default is
 * deliberately the behaviour this store had before reasons existed: a non-empty
 * set is re-asserted (an identical one keeps its spent flag, so a re-render
 * cannot resurrect a spent set), an empty one clears. An old client therefore
 * behaves exactly as it did, bug included, rather than acquiring a new one.
 * @param value - the request's `reason` field.
 * @param count - how many refs the push carried, which picks the default.
 * @returns the reason to apply.
 */
export function parsePushReason(value: unknown, count: number): RefPushReason {
  if (value === 'live' || value === 'retry' || value === 'sent' || value === 'removed') return value
  return count > 0 ? 'retry' : 'removed'
}

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
export function claimRefs(sessionId: string): PendingAttachment[] | undefined {
  const current = sessions.get(sessionId)
  if (current === undefined || current.refs.length === 0) return undefined
  if (current.spent) return undefined
  current.spent = true
  return [...current.refs]
}

/**
 * What the host holds for one session right now — the read half of the sync.
 *
 * This exists to make a failed attachment decidable in one request. After
 * attaching a file and sending, an empty `refs` says the CLIENT never got the set
 * to the host; a non-empty unspent set says the host holds it and no step has
 * claimed it; a spent set says a step claimed it and the injection is in the
 * log. Without it, all three look identical from the chat window.
 *
 * The `log` closes the last gap in that story (R31). `refs` alone cannot tell
 * "the client pushed nothing" from "the client pushed an empty set" — the two
 * look the same one request later, which is exactly how an afternoon went. The
 * recorded pushes say which, and with which reason.
 *
 * It reads the in-memory map and nothing else: no paths beyond what a push
 * already recorded, no mutation, and no effect on the one-shot guarantee — a
 * read neither spends a set nor re-arms one. An absent session is an empty,
 * unspent set with no pushes rather than an error, because "the host holds
 * nothing" is exactly the answer a caller is usually asking for.
 * @param sessionId - the session to describe.
 * @returns the held set, oldest first, whether it has been injected, and the pushes that produced it.
 */
export function readRefs(sessionId: string): {
  refs: PendingAttachment[]
  spent: boolean
  log: RefPushRecord[]
} {
  const current = sessions.get(sessionId)
  if (current === undefined) return { refs: [], spent: false, log: [] }
  return {
    refs: [...current.refs],
    spent: current.spent,
    // Fresh rows as well as a fresh array: the caller of a diagnostic must not be
    // able to edit the record of what happened.
    log: current.log.map(entry => ({ ...entry })),
  }
}

/**
 * Drop one session's set, spent or not.
 *
 * The session-disposal path: a session that is gone must not leave an
 * injection waiting for a turn that will never come.
 * @param sessionId - the session to forget.
 */
export function clearRefs(sessionId: string): void {
  sessions.delete(sessionId)
}

/** Order-sensitive comparison — the client's own order is the attachment order. */
function sameRefs(a: readonly PendingAttachment[], b: readonly PendingAttachment[]): boolean {
  if (a.length !== b.length) return false
  return a.every((record, i) => record.ref === b[i]?.ref
    && record.relativePath === b[i]?.relativePath
    && record.isPhoto === b[i]?.isPhoto)
}

/**
 * Validate one ref row off the wire.
 *
 * The endpoint is same-origin and the payload is the plugin's own client, but a
 * malformed row would otherwise reach `instructionFor` and render `undefined`
 * into the model's context, so the shape is checked where it enters.
 * @param value - one element of the request's `refs` array.
 * @returns the row, or undefined when it is not a usable record.
 */
export function parsePendingAttachment(value: unknown): PendingAttachment | undefined {
  if (typeof value !== 'object' || value === null) return undefined
  const record = value as Record<string, unknown>
  if (typeof record['ref'] !== 'string' || record['ref'] === '') return undefined
  if (typeof record['relativePath'] !== 'string' || record['relativePath'] === '') return undefined
  if (typeof record['isPhoto'] !== 'boolean') return undefined
  return { ref: record['ref'], relativePath: record['relativePath'], isPhoto: record['isPhoto'] }
}
