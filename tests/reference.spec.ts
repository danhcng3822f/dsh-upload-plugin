import { describe, it, expect } from 'vitest'
import { createVisionSource, mintChip } from '../src/client/reference.js'
import { AttachmentStore } from '../src/client/attachment-store.js'
import { makeRef } from '../src/client/attachments.js'

const session = (sessionId: string) => ({ sessionId } as never)

function storeWith(sessionId: string, token: string, isPhoto = true) {
  const store = new AttachmentStore({ getItem: () => null, setItem: () => {}, removeItem: () => {} })
  store.add(sessionId, {
    token, ref: makeRef('abc12345', token), relativePath: `uploads/${sessionId}/${token}`,
    isPhoto, size: 1, uploadedAt: 1,
  })
  return store
}

describe('createVisionSource', () => {
  it('registers under the plugin source name on the @ trigger', () => {
    const source = createVisionSource(storeWith('s1', 'a.png'))
    expect(source.trigger).toBe('@')
    expect(source.name).toBe('vision')
  })

  it('offers the session attachments as candidates', async () => {
    const source = createVisionSource(storeWith('s1', 'a.png'))
    const candidates = await source.candidates(session('s1'), {} as never)
    expect(candidates.map(c => c.name)).toEqual(['a.png'])
  })

  it('inserts a chip whose ref is the session-scoped id and whose label is the token', () => {
    const source = createVisionSource(storeWith('s1', 'a.png'))
    const outcome = source.onPick({
      candidate: { name: 'a.png' }, session: session('s1'), via: 'menu', span: { start: 0, end: 0, draftRev: 0 },
    } as never) as { kind: string; insert: { ref: string; label: string; clipboardText: string } }
    expect(outcome.kind).toBe('insert')
    expect(outcome.insert.ref).toBe(makeRef('abc12345', 'a.png'))
    expect(outcome.insert.label).toBe('a.png')
    expect(outcome.insert.clipboardText).toBe('@a.png')
  })

  it('serializes a photo ref into the read_image instruction', async () => {
    const source = createVisionSource(storeWith('s1', 'a.png'))
    const text = await source.codec.serialize(makeRef('abc12345', 'a.png'), new AbortController().signal)
    expect(text).toContain('read_image')
    expect(text).toContain('uploads/s1/a.png')
  })

  it('serializes a file ref into the read instruction', async () => {
    const source = createVisionSource(storeWith('s1', 'n.txt', false))
    const text = await source.codec.serialize(makeRef('abc12345', 'n.txt'), new AbortController().signal)
    expect(text).toContain('`read`')
  })

  it('rejects an unknown ref so the send blocks instead of silently degrading', async () => {
    const source = createVisionSource(storeWith('s1', 'a.png'))
    await expect(source.codec.serialize('gone', new AbortController().signal)).rejects.toThrow(/gone/)
  })

  it('lists the session tokens as the lexicon', () => {
    const source = createVisionSource(storeWith('s1', 'a.png'))
    expect(source.lexicon(session('s1'))).toEqual(['a.png'])
  })
})

const record = (token: string, isPhoto = true) => ({
  token,
  ref: makeRef('abc12345', token),
  relativePath: `uploads/s1/${token}`,
  isPhoto, size: 1, uploadedAt: 1,
})

/** What `mintChip` is expected to hand the scoped consumer. */
interface MintedPayload {
  reference: { source: string; ref: string; label: string; clipboardText: string }
  span: { start: number; end: number; draftRev: number }
}

/**
 * A fake `sessions` facade: `scope('s1')` yields a context whose `bail` records the
 * event and payload it received and answers `result`. Plain object literals are the
 * whole dependency, which is why `mintChip` is testable without a DOM or a harness.
 */
function fakeSessions(result: unknown) {
  const calls: { event: string; payload: MintedPayload }[] = []
  const actx = {
    bail(_ctx: unknown, event: string, payload: unknown) {
      calls.push({ event, payload: payload as MintedPayload })
      return result
    },
  }
  return { calls, facade: { scope: (id: string) => (id === 's1' ? actx : undefined) } }
}

describe('mintChip', () => {
  it('returns false when the session is not scoped', () => {
    const { facade } = fakeSessions(true)
    expect(mintChip(facade, 'unknown-session', { draft: 'hi', draftRev: 3 }, record('a.png'))).toBe(false)
  })

  it('returns false when there is no sessions facade at all', () => {
    expect(mintChip(undefined, 's1', { draft: 'hi', draftRev: 3 }, record('a.png'))).toBe(false)
  })

  it('bails the insert-reference event with a zero-width span at the live draft revision', () => {
    const { calls, facade } = fakeSessions(true)
    const r = record('a.png')
    expect(mintChip(facade, 's1', { draft: 'look at ', draftRev: 7 }, r)).toBe(true)
    expect(calls).toHaveLength(1)
    expect(calls[0]?.event).toBe('slash/input-insert-reference')
    expect(calls[0]?.payload.reference).toEqual({
      source: 'vision', ref: r.ref, label: 'a.png', clipboardText: '@a.png',
    })
    // Zero-width at the end of the draft, carrying the LIVE revision — the CAS
    // contract that lets the insert land instead of being dropped as stale.
    expect(calls[0]?.payload.span).toEqual({ start: 8, end: 8, draftRev: 7 })
  })

  it('returns false when bail does not answer a literal true', () => {
    const { facade } = fakeSessions(undefined)
    expect(mintChip(facade, 's1', { draft: 'hi', draftRev: 3 }, record('a.png'))).toBe(false)
  })
})
