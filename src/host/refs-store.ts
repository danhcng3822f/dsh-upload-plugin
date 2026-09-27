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

import type { PendingAttachment } from '../types.js'

/** What the host holds for one session: the live refs, and whether they are still owed. */
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
}

const sessions = new Map<string, SessionRefs>()

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
export function syncRefs(sessionId: string, refs: readonly PendingAttachment[]): void {
  if (sessionId === '') return
  const current = sessions.get(sessionId)
  if (current !== undefined && sameRefs(current.refs, refs)) {
    // An identical set keeps its spent flag: the client re-pushes on every
    // composer render, and a redundant push must not resurrect a spent set.
    current.refs = [...refs]
    return
  }
  sessions.set(sessionId, { refs: [...refs], spent: false })
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
