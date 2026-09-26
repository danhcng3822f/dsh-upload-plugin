import { describe, it, expect } from 'vitest'
import { createVisionSource } from '../src/client/reference.js'
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
