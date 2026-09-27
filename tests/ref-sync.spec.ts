import { describe, it, expect, beforeEach } from 'vitest'
import {
  REFS_ENDPOINT, liveRecords, noteDraftRemoval, noteSerializedRef, resetRefSync, syncActiveRefs,
} from '../src/client/ref-sync.js'
import { makeRef, type AttachmentRecord, type ChipOccurrence } from '../src/client/attachments.js'
import type { RefPushReason } from '../src/types.js'

const record = (token: string, isPhoto = false): AttachmentRecord => ({
  token,
  ref: makeRef('abc12345', token),
  relativePath: `uploads/s/${token}`,
  isPhoto,
  size: 1,
  uploadedAt: 1,
})

const occurrence = (r: AttachmentRecord, over: Partial<ChipOccurrence> = {}): ChipOccurrence => ({
  source: 'vision', ref: r.ref, ...over,
})

/** A `fetch` stand-in that records its calls and answers ok. */
function fakeFetch(ok = true) {
  const calls: { url: string; init: RequestInit }[] = []
  const impl = ((url: string, init: RequestInit) => {
    calls.push({ url, init })
    return Promise.resolve({ ok })
  }) as unknown as typeof fetch
  return { calls, impl }
}

/** The reason one recorded push carried. */
function reasonOf(call: { init: RequestInit }): RefPushReason {
  return JSON.parse(String(call.init.body)).reason
}

beforeEach(() => { resetRefSync() })

describe('liveRecords', () => {
  it('resolves the live refs to their records', () => {
    const a = record('a.txt')
    const records = [a]
    expect(liveRecords([occurrence(a)], records, ref => records.find(r => r.ref === ref)))
      .toEqual([a])
  })

  it('skips a chip whose record the store never had', () => {
    const records: AttachmentRecord[] = []
    expect(liveRecords([{ source: 'vision', ref: 'gone' }], records, () => undefined))
      .toEqual([])
  })

  it('ignores a chip belonging to another source', () => {
    const a = record('a.txt')
    const records = [a]
    const occurrences: ChipOccurrence[] = [{ source: 'other', ref: a.ref }]
    expect(liveRecords(occurrences, records, ref => records.find(r => r.ref === ref)))
      .toEqual([])
  })

  it('ignores an invalidated chip — it must not be injected', () => {
    const a = record('a.txt')
    const records = [a]
    expect(liveRecords([occurrence(a, { invalid: true })], records, ref => records.find(r => r.ref === ref)))
      .toEqual([])
  })

  it('preserves draft order and de-duplicates', () => {
    const a = record('a.txt')
    const b = record('b.txt')
    const records = [a, b]
    const byRef = (ref: string) => records.find(r => r.ref === ref)
    expect(liveRecords([occurrence(b), occurrence(a), occurrence(b)], records, byRef))
      .toEqual([b, a])
  })
})

describe('syncActiveRefs', () => {
  it('posts the live set to the plugin endpoint', () => {
    const { calls, impl } = fakeFetch()
    const a = record('a.txt')
    expect(syncActiveRefs('s1', [a], impl)).toBe(true)
    expect(calls).toHaveLength(1)
    expect(calls[0]!.url).toBe(REFS_ENDPOINT)
    expect(calls[0]!.init.method).toBe('POST')
    expect(JSON.parse(String(calls[0]!.init.body))).toEqual({
      sessionId: 's1',
      reason: 'live',
      refs: [{ ref: a.ref, relativePath: a.relativePath, isPhoto: false }],
    })
  })

  it('sends only the three fields the host renders from', () => {
    const { calls, impl } = fakeFetch()
    syncActiveRefs('s1', [record('a.txt')], impl)
    const body = JSON.parse(String(calls[0]!.init.body))
    // `token`, `size` and `uploadedAt` stay on the client: the host needs the
    // path and the photo/file distinction, nothing else.
    expect(Object.keys(body.refs[0]).sort()).toEqual(['isPhoto', 'ref', 'relativePath'])
  })

  // The effect that calls this runs on every composer render, i.e. once per
  // keystroke. Without the guard this would be a POST per character typed.
  it('de-duplicates an unchanged set', () => {
    const { calls, impl } = fakeFetch()
    const a = record('a.txt')
    expect(syncActiveRefs('s1', [a], impl)).toBe(true)
    expect(syncActiveRefs('s1', [a], impl)).toBe(false)
    expect(calls).toHaveLength(1)
  })

  it('re-pushes when the set changes, including back to empty', () => {
    const { calls, impl } = fakeFetch()
    const a = record('a.txt')
    syncActiveRefs('s1', [a], impl)
    syncActiveRefs('s1', [], impl)
    expect(calls).toHaveLength(2)
    expect(JSON.parse(String(calls[1]!.init.body)).refs).toEqual([])
  })

  it('treats the same ref with a different photo flag as a change', () => {
    const { calls, impl } = fakeFetch()
    const a = record('a.txt', false)
    syncActiveRefs('s1', [a], impl)
    syncActiveRefs('s1', [{ ...a, isPhoto: true }], impl)
    expect(calls).toHaveLength(2)
  })

  it('tracks sessions independently', () => {
    const { calls, impl } = fakeFetch()
    const a = record('a.txt')
    syncActiveRefs('s1', [a], impl)
    syncActiveRefs('s2', [a], impl)
    expect(calls).toHaveLength(2)
  })

  it('issues nothing for an empty session id', () => {
    const { calls, impl } = fakeFetch()
    expect(syncActiveRefs('', [record('a.txt')], impl)).toBe(false)
    expect(calls).toHaveLength(0)
  })

  it('issues nothing when there is no fetch to issue with', () => {
    expect(syncActiveRefs('s1', [record('a.txt')], null)).toBe(false)
  })

  // A push the host refused must not be remembered as delivered, or the next
  // render would de-duplicate against a set the host never received and the
  // attachment would never be injected.
  it('re-arms after a refused push', async () => {
    const { calls, impl } = fakeFetch(false)
    const a = record('a.txt')
    syncActiveRefs('s1', [a], impl)
    await Promise.resolve(); await Promise.resolve()
    expect(syncActiveRefs('s1', [a], impl)).toBe(true)
    expect(calls).toHaveLength(2)
    // The re-issue says it is the same set again, so the host can tell it apart
    // from a set the user just changed and must not re-arm one it has spent.
    expect(reasonOf(calls[1]!)).toBe('retry')
  })

  it('re-arms after a transport failure', async () => {
    const calls: string[] = []
    const impl = (() => {
      calls.push('x')
      return Promise.reject(new Error('offline'))
    }) as unknown as typeof fetch
    const a = record('a.txt')
    syncActiveRefs('s1', [a], impl)
    await Promise.resolve(); await Promise.resolve()
    expect(syncActiveRefs('s1', [a], impl)).toBe(true)
    expect(calls).toHaveLength(2)
  })

  it('never throws when the transport throws synchronously', () => {
    const impl = (() => { throw new Error('boom') }) as unknown as typeof fetch
    // A composer effect must survive this: the failure costs one injection, while
    // an escaping exception would cost the rail and the draft.
    expect(() => syncActiveRefs('s1', [record('a.txt')], impl)).not.toThrow()
    // It reports that nothing was issued, so the caller cannot mistake this for a
    // delivered push — and it re-arms, so the next render retries.
    expect(syncActiveRefs('s1', [record('a.txt')], impl)).toBe(false)
  })

  it('resetRefSync forgets one session, or all of them', () => {
    const { calls, impl } = fakeFetch()
    const a = record('a.txt')
    syncActiveRefs('s1', [a], impl)
    resetRefSync('s1')
    expect(syncActiveRefs('s1', [a], impl)).toBe(true)
    resetRefSync()
    expect(syncActiveRefs('s1', [a], impl)).toBe(true)
    expect(calls).toHaveLength(3)
  })
})

/**
 * R31: the reason every push carries, which is how the host tells an empty set
 * caused by a SEND (keep the refs — the turn about to run must still claim them)
 * from one caused by a REMOVAL (clear them). The client is the side that can tell
 * them apart, so the classification is pinned here.
 *
 * The evidence for a send is `noteSerializedRef`, called by the reference codec on
 * the submit path only; a removal by the rail's ✕ is `noteDraftRemoval`. Neither
 * is a guess about timing: the harness awaits every serialization before it clears
 * the draft, so the mark is set before the empty push by construction.
 */
describe('syncActiveRefs — the reason it carries', () => {
  it('says live for the first set and for every change to it', () => {
    const { calls, impl } = fakeFetch()
    const a = record('a.txt')
    const b = record('b.txt')
    syncActiveRefs('s1', [a], impl)
    syncActiveRefs('s1', [a, b], impl)
    syncActiveRefs('s1', [b], impl)
    expect(calls.map(reasonOf)).toEqual(['live', 'live', 'live'])
  })

  // The reported bug: a send empties the draft, and the empty push that follows
  // must NOT be read as a removal.
  it('says sent for the empty push that follows a send', () => {
    const { calls, impl } = fakeFetch()
    const a = record('a.txt')
    syncActiveRefs('s1', [a], impl)
    noteSerializedRef(a.ref)
    expect(syncActiveRefs('s1', [], impl)).toBe(true)
    expect(reasonOf(calls[1]!)).toBe('sent')
    expect(JSON.parse(String(calls[1]!.init.body)).refs).toEqual([])
  })

  it('says sent for every chip the send serialized', () => {
    const { calls, impl } = fakeFetch()
    const a = record('a.txt')
    const b = record('b.txt')
    syncActiveRefs('s1', [a, b], impl)
    noteSerializedRef(a.ref)
    noteSerializedRef(b.ref)
    syncActiveRefs('s1', [], impl)
    expect(reasonOf(calls[1]!)).toBe('sent')
  })

  // The removal half of the distinction, and the default for an empty set: with
  // no evidence of a send, an empty push means the user took the attachment back.
  it('says removed for an empty push with no evidence of a send', () => {
    const { calls, impl } = fakeFetch()
    const a = record('a.txt')
    syncActiveRefs('s1', [a], impl)
    syncActiveRefs('s1', [], impl)
    expect(reasonOf(calls[1]!)).toBe('removed')
  })

  it('says removed for the rail\'s ✕, even with a stale send mark', () => {
    const { calls, impl } = fakeFetch()
    const a = record('a.txt')
    syncActiveRefs('s1', [a], impl)
    // A submit that serialized the chip and then never emptied the draft — a send
    // the host refused — leaves its mark behind. The user's ✕ afterwards is the
    // more recent fact and must win, or the host would inject a removed file.
    noteSerializedRef(a.ref)
    noteDraftRemoval('s1')
    syncActiveRefs('s1', [], impl)
    expect(reasonOf(calls[1]!)).toBe('removed')
  })

  it('says removed for an empty push when a serialize of another session is the only mark', () => {
    const { calls, impl } = fakeFetch()
    const a = record('a.txt')
    const elsewhere = { ...record('c.txt'), ref: makeRef('zzz99999', 'c.txt') }
    syncActiveRefs('s1', [a], impl)
    noteSerializedRef(elsewhere.ref)
    syncActiveRefs('s1', [], impl)
    expect(reasonOf(calls[1]!)).toBe('removed')
  })

  // The marks are evidence about ONE push, and are spent by it: otherwise a
  // blocked submit's mark would decide a later, unrelated empty push.
  it('spends the send mark on the push that reads it', () => {
    const { calls, impl } = fakeFetch()
    const a = record('a.txt')
    syncActiveRefs('s1', [a], impl)
    noteSerializedRef(a.ref)
    syncActiveRefs('s1', [], impl)
    expect(reasonOf(calls[1]!)).toBe('sent')
    // The user references the same file again, then removes it: no new serialize
    // happened, so this empty push is a removal and must clear the host.
    syncActiveRefs('s1', [a], impl)
    syncActiveRefs('s1', [], impl)
    expect(calls.map(reasonOf)).toEqual(['live', 'sent', 'live', 'removed'])
  })

  it('spends the removal mark on the push that reads it', () => {
    const { calls, impl } = fakeFetch()
    const a = record('a.txt')
    syncActiveRefs('s1', [a], impl)
    noteDraftRemoval('s1')
    syncActiveRefs('s1', [], impl)
    // Re-attach, then send: the removal mark is gone, so the send is recognized.
    syncActiveRefs('s1', [a], impl)
    noteSerializedRef(a.ref)
    syncActiveRefs('s1', [], impl)
    expect(calls.map(reasonOf)).toEqual(['live', 'removed', 'live', 'sent'])
  })

  it('says retry only for the set whose push was not confirmed', async () => {
    const { calls, impl } = fakeFetch(false)
    const a = record('a.txt')
    syncActiveRefs('s1', [a], impl)
    expect(reasonOf(calls[0]!)).toBe('live')
    await Promise.resolve(); await Promise.resolve()
    syncActiveRefs('s1', [a], impl)
    expect(reasonOf(calls[1]!)).toBe('retry')
    // A changed set is a change the user made, never a retry.
    syncActiveRefs('s1', [{ ...a, isPhoto: true }], impl)
    expect(reasonOf(calls[2]!)).toBe('live')
  })

  // The retry path of the fix itself. The first `sent` push spends the evidence
  // that decided it, so a re-issue that re-derived the reason would read the same
  // empty set as a removal and erase the refs — the bug, reached through a lost
  // response instead of through a send.
  it('re-says sent when the send\'s own empty push was not confirmed', async () => {
    const { calls, impl } = fakeFetch(false)
    const a = record('a.txt')
    syncActiveRefs('s1', [a], impl)
    await Promise.resolve(); await Promise.resolve()
    noteSerializedRef(a.ref)
    syncActiveRefs('s1', [], impl)
    expect(reasonOf(calls[1]!)).toBe('sent')
    await Promise.resolve(); await Promise.resolve()
    // The next render retries the same empty set.
    syncActiveRefs('s1', [], impl)
    expect(reasonOf(calls[2]!)).toBe('sent')
  })

  it('re-says removed when the removal\'s own empty push was not confirmed', async () => {
    const { calls, impl } = fakeFetch(false)
    const a = record('a.txt')
    syncActiveRefs('s1', [a], impl)
    await Promise.resolve(); await Promise.resolve()
    noteDraftRemoval('s1')
    syncActiveRefs('s1', [], impl)
    await Promise.resolve(); await Promise.resolve()
    syncActiveRefs('s1', [], impl)
    expect(calls.map(reasonOf)).toEqual(['live', 'removed', 'removed'])
  })

  // The classification is per session: it asks whether the refs THIS session last
  // reported were serialized. Two sessions pushing in the same instant are told
  // apart by exactly that, and a ref belonging to another session can never
  // classify this one's empty push as a send.
  it('classifies each session against the refs it last reported', () => {
    const { calls, impl } = fakeFetch()
    const a = record('a.txt')
    const b = record('b.txt')
    syncActiveRefs('s1', [a], impl)
    syncActiveRefs('s2', [b], impl)
    // Only s1's chip was serialized: s2's draft was emptied by a removal.
    noteSerializedRef(a.ref)
    syncActiveRefs('s1', [], impl)
    syncActiveRefs('s2', [], impl)
    expect(calls.map(reasonOf)).toEqual(['live', 'live', 'sent', 'removed'])
  })

  it('forgets the marks when a session is reset', () => {
    const { calls, impl } = fakeFetch()
    const a = record('a.txt')
    syncActiveRefs('s1', [a], impl)
    noteSerializedRef(a.ref)
    noteDraftRemoval('s1')
    resetRefSync('s1')
    // Nothing is remembered, so the first push after a reset is a plain live set
    // and a following empty push is a removal rather than the old send.
    syncActiveRefs('s1', [a], impl)
    syncActiveRefs('s1', [], impl)
    expect(calls.map(reasonOf)).toEqual(['live', 'live', 'removed'])
  })
})
