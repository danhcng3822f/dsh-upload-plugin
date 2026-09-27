import { describe, it, expect, beforeEach } from 'vitest'
import { createVisionSource, mintChip, nextChipCursor, ZERO_WIDTH_PLACEHOLDER } from '../src/client/reference.js'
import { AttachmentStore } from '../src/client/attachment-store.js'
import { makeRef } from '../src/client/attachments.js'
import { resetRefSync, syncActiveRefs } from '../src/client/ref-sync.js'
import type { RefPushReason } from '../src/types.js'

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

  // R25-B2 replaced the instruction text with a zero-width space. The point of
  // these three assertions is the TRAP, not the character: the harness silently
  // drops a message with no text and no images
  // (`ui-conversation/src/client/input/hub.ts:155`), so a codec that returned ''
  // would turn "attach a file, press Enter" into a dead button — nothing sent, no
  // error, no notice, draft not even cleared.
  it('serializes a chip to a single zero-width space, never to prose', async () => {
    const source = createVisionSource(storeWith('s1', 'a.png'))
    const text = await source.codec.serialize(makeRef('abc12345', 'a.png'), new AbortController().signal)
    expect(text).toBe(ZERO_WIDTH_PLACEHOLDER)
    expect(text).not.toContain('read_image')
    expect(text).not.toContain('uploads/')
  })

  it('serializes a file chip the same way — the tool choice moved to the host', async () => {
    const source = createVisionSource(storeWith('s1', 'n.txt', false))
    const text = await source.codec.serialize(makeRef('abc12345', 'n.txt'), new AbortController().signal)
    expect(text).toBe(ZERO_WIDTH_PLACEHOLDER)
    expect(text).not.toContain('`read`')
  })

  // The whole reason the placeholder is U+200B and not a space. The harness passes
  // the spliced prompt through `out.trim()` before handing it to the sink
  // (`ui-conversation/src/client/input/facade.ts:440`), and `trim` strips
  // WhiteSpace and LineTerminator code points. U+200B is category Cf, not Zs, so it
  // survives — a file-only send stays non-empty and reaches the server.
  it('returns a placeholder that survives the harness trim()', async () => {
    const source = createVisionSource(storeWith('s1', 'a.png'))
    const text = await source.codec.serialize(makeRef('abc12345', 'a.png'), new AbortController().signal)
    expect(text.trim()).toBe(text)
    expect(text.trim().length).toBe(1)
    // And the contrast that makes the check meaningful: a space does NOT survive.
    expect(' '.trim()).toBe('')
  })

  it('rejects an unknown ref so the send blocks instead of silently degrading', async () => {
    const source = createVisionSource(storeWith('s1', 'a.png'))
    await expect(source.codec.serialize('gone', new AbortController().signal)).rejects.toThrow(/gone/)
  })

  it('lists the session tokens as the lexicon', () => {
    const source = createVisionSource(storeWith('s1', 'a.png'))
    expect(source.lexicon(session('s1'))).toEqual(['a.png'])
  })

  // `clipboardText` is not only the copy/paste projection: it is also the
  // PERSISTENCE projection, i.e. what a restored draft receives for a chip that
  // survives a reload. An untested one is untested draft persistence.
  it('projects a known ref to its readable token', () => {
    const source = createVisionSource(storeWith('s1', 'a.png'))
    expect(source.codec.clipboardText(makeRef('abc12345', 'a.png'))).toBe('@a.png')
  })

  it('falls back to the raw ref when the store holds no record for it', () => {
    const source = createVisionSource(storeWith('s1', 'a.png'))
    expect(source.codec.clipboardText('gone')).toBe('@gone')
  })
})

/**
 * R31: `serialize` is the only trace a SEND leaves on the client, and the ref
 * sync reads it to tell an empty push caused by a send (the host must keep the
 * refs) from one caused by a removal (the host must clear them). Pinned here
 * rather than only in `ref-sync.spec.ts` so that deleting the call from the codec
 * fails a test in the codec's own spec.
 */
describe('the codec as the send\'s evidence', () => {
  /** A `fetch` stand-in that records the reason of each push. */
  function fakeFetch() {
    const reasons: RefPushReason[] = []
    const impl = ((_url: string, init: RequestInit) => {
      reasons.push(JSON.parse(String(init.body)).reason)
      return Promise.resolve({ ok: true })
    }) as unknown as typeof fetch
    return { reasons, impl }
  }

  const chip = (ref: string) => ({
    token: 'a.png', ref, relativePath: 'uploads/s1/a.png', isPhoto: true, size: 1, uploadedAt: 1,
  })

  beforeEach(() => { resetRefSync() })

  it('marks the chip it serialized, so the empty push after a send says sent', async () => {
    const { reasons, impl } = fakeFetch()
    const source = createVisionSource(storeWith('s1', 'a.png'))
    const ref = makeRef('abc12345', 'a.png')
    syncActiveRefs('s1', [chip(ref)], impl)
    await source.codec.serialize(ref, new AbortController().signal)
    // The draft is committed and the rail re-renders with nothing in it.
    syncActiveRefs('s1', [], impl)
    expect(reasons).toEqual(['live', 'sent'])
  })

  // The failure path is not a send: the harness rejects the whole attempt, the
  // draft is retained, and nothing empties. A mark here would let a later,
  // unrelated removal be read as a send and the removed file would inject.
  it('marks nothing when the serialization fails, so the send is not a send', async () => {
    const { reasons, impl } = fakeFetch()
    const source = createVisionSource(storeWith('s1', 'a.png'))
    const ref = makeRef('abc12345', 'a.png')
    syncActiveRefs('s1', [chip(ref)], impl)
    await expect(source.codec.serialize('gone', new AbortController().signal)).rejects.toThrow()
    syncActiveRefs('s1', [], impl)
    expect(reasons).toEqual(['live', 'removed'])
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

describe('nextChipCursor', () => {
  it('appends the placeholder plus exactly one separating space', () => {
    const next = nextChipCursor({ draft: 'xem ', draftRev: 4 })
    expect(next.draft).toBe('xem \uFFFC ')
    // Two UTF-16 code units: the machine's `PLACEHOLDER + gap`
    // (`machine.ts:296-298`), and PLACEHOLDER is one code unit (`:24`) — which is
    // what makes the cursor's draft length track the machine's exactly.
    expect(next.draft.length - 'xem '.length).toBe(2)
  })

  it('advances the revision by exactly one', () => {
    expect(nextChipCursor({ draft: '', draftRev: 7 }).draftRev).toBe(8)
  })

  it('returns a new pair and leaves the one it was given untouched', () => {
    const cursor = { draft: 'a', draftRev: 1 }
    const next = nextChipCursor(cursor)
    expect(cursor).toEqual({ draft: 'a', draftRev: 1 })
    expect(next).not.toBe(cursor)
  })

  it('models a batch of successful mints as one chip and one revision each', () => {
    // The defect this function exists to prevent: every iteration after the first
    // reused a stale CAS pair, so three photos produced one chip and two notices.
    let cursor = { draft: 'xem ', draftRev: 4 }
    for (let i = 0; i < 3; i++) cursor = nextChipCursor(cursor)
    expect(cursor.draft).toBe('xem \uFFFC \uFFFC \uFFFC ')
    expect(cursor.draftRev).toBe(7)
    // The next mint's span is zero-width at `draft.length`, and `casOk`
    // bounds-checks `span.end <= draft.length` (`machine.ts:259-262`), so the
    // cursor's length has to grow with the machine's: two units per chip.
    expect(cursor.draft.length).toBe('xem '.length + 3 * 2)
  })
})
