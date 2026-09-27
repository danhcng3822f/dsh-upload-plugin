import { describe, it, expect, beforeEach } from 'vitest'
import {
  REFS_ENDPOINT, liveRecords, resetRefSync, syncActiveRefs,
} from '../src/client/ref-sync.js'
import { makeRef, type AttachmentRecord, type ChipOccurrence } from '../src/client/attachments.js'

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
