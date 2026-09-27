import { describe, it, expect, beforeEach } from 'vitest'
import {
  PUSH_LOG_LIMIT, claimRefs, clearRefs, parsePendingAttachment, parsePushReason, readRefs, syncRefs,
} from '../src/host/refs-store.js'
import type { PendingAttachment, RefPushReason } from '../src/types.js'

const photo = (ref = 'r1'): PendingAttachment => ({
  ref, relativePath: `uploads/s/${ref}.png`, isPhoto: true,
})
const file = (ref = 'r2'): PendingAttachment => ({
  ref, relativePath: `uploads/s/${ref}.txt`, isPhoto: false,
})

beforeEach(() => { clearRefs('s1'); clearRefs('s2') })

describe('syncRefs / claimRefs', () => {
  it('holds nothing for a session that never pushed', () => {
    expect(claimRefs('s1')).toBeUndefined()
  })

  it('hands the pushed set to the next turn', () => {
    syncRefs('s1', [photo()], 'live')
    expect(claimRefs('s1')).toEqual([photo()])
  })

  it('spends the set: a later claim gets nothing', () => {
    syncRefs('s1', [photo()], 'live')
    expect(claimRefs('s1')).toEqual([photo()])
    expect(claimRefs('s1')).toBeUndefined()
  })

  // The one-shot guarantee, and the reason the flag is a plain "spent" rather than
  // a "last injected turn". `agent/pre-step` runs once per STEP
  // (`core/agent-loop/src/agent.ts:266`, inside the step loop), so a turn that
  // calls tools proposes several steps and a client push can land mid-turn. A
  // spent set stays spent for every later step AND every later turn, so the
  // message after a send carries no instruction.
  it('never injects the same set twice, even after a mid-turn re-push', () => {
    syncRefs('s1', [photo()], 'live')
    expect(claimRefs('s1')).toEqual([photo()])
    // The composer re-renders during the turn and re-issues the same live set —
    // which the client only ever does as `retry`, since it does not push an
    // unchanged set otherwise.
    syncRefs('s1', [photo()], 'retry')
    expect(claimRefs('s1')).toBeUndefined()
    expect(claimRefs('s1')).toBeUndefined()
  })

  it('treats a different set as a fresh attachment', () => {
    syncRefs('s1', [photo()], 'live')
    expect(claimRefs('s1')).toEqual([photo()])
    // The user attached another file and sent again.
    syncRefs('s1', [photo(), file()], 'live')
    expect(claimRefs('s1')).toEqual([photo(), file()])
  })

  it('keeps sessions apart', () => {
    syncRefs('s1', [photo()], 'live')
    syncRefs('s2', [file()], 'live')
    expect(claimRefs('s2')).toEqual([file()])
    expect(claimRefs('s1')).toEqual([photo()])
  })

  it('ignores an empty session id', () => {
    syncRefs('', [photo()], 'live')
    expect(claimRefs('')).toBeUndefined()
  })

  // Asserted through the store's own behaviour rather than by reading internals:
  // an identical re-push keeps the held set, so mutating what a claim handed back
  // must not change what the store compares against. If the claim returned the
  // held array itself, the appended element would make the re-push look different
  // and the set would be re-armed.
  it('hands over a copy, so a caller cannot mutate the held set', () => {
    syncRefs('s1', [photo()], 'live')
    const claimed = claimRefs('s1')!
    claimed.push(file())
    syncRefs('s1', [photo()], 'retry')
    expect(claimRefs('s1')).toBeUndefined()
  })

  it('drops a session on clear', () => {
    syncRefs('s1', [photo()], 'live')
    clearRefs('s1')
    expect(claimRefs('s1')).toBeUndefined()
  })
})

/**
 * R31: the empty set, which is the only ambiguous push. The client says which
 * cause it is, and the two causes get opposite treatment — that distinction is
 * the whole fix, so each rule is pinned here.
 */
describe('syncRefs — the reason an empty push carries', () => {
  // The reported bug, end to end at this seam: attach, send, and the host must
  // still hold the ref when the turn's first step claims it.
  it('keeps the held set when a send emptied the draft', () => {
    syncRefs('s1', [photo()], 'live')
    syncRefs('s1', [], 'sent')
    expect(readRefs('s1').refs).toEqual([photo()])
    expect(claimRefs('s1')).toEqual([photo()])
  })

  // And the one-shot guarantee survives it: the send's own refs are injected once
  // and the next message carries nothing.
  it('still spends what a send kept, so the next message injects nothing', () => {
    syncRefs('s1', [photo()], 'live')
    syncRefs('s1', [], 'sent')
    expect(claimRefs('s1')).toEqual([photo()])
    expect(claimRefs('s1')).toBeUndefined()
    expect(claimRefs('s1')).toBeUndefined()
  })

  it('keeps a set a step has already spent, rather than re-arming it', () => {
    syncRefs('s1', [photo()], 'live')
    syncRefs('s1', [], 'sent')
    expect(claimRefs('s1')).toEqual([photo()])
    // A late re-render pushes the empty set again, after the claim.
    syncRefs('s1', [], 'sent')
    expect(readRefs('s1').spent).toBe(true)
    expect(claimRefs('s1')).toBeUndefined()
  })

  it('clears the held set when the user removed the attachment', () => {
    syncRefs('s1', [photo()], 'live')
    syncRefs('s1', [], 'removed')
    expect(readRefs('s1')).toMatchObject({ refs: [], spent: false })
    expect(claimRefs('s1')).toBeUndefined()
  })

  it('clears a re-armed set on a removal, so a removed attachment cannot come back', () => {
    syncRefs('s1', [photo()], 'live')
    expect(claimRefs('s1')).toEqual([photo()])
    // The user references it again, then changes their mind and removes the chip.
    syncRefs('s1', [photo()], 'live')
    syncRefs('s1', [], 'removed')
    expect(claimRefs('s1')).toBeUndefined()
  })

  // `sent` on a session the host never heard of must not invent a set.
  it('holds nothing for a send that arrives before any live push', () => {
    syncRefs('s1', [], 'sent')
    expect(readRefs('s1').refs).toEqual([])
    expect(claimRefs('s1')).toBeUndefined()
  })

  // The re-attach property, and the trap in it: `/photos` re-references an
  // EXISTING record, so the second push is byte-identical to the first. It must
  // still re-arm, because the client only says `live` for a set that differs from
  // the last one it reported.
  it('re-arms on an identical live push, so re-attaching the same file injects again', () => {
    syncRefs('s1', [photo()], 'live')
    syncRefs('s1', [], 'sent')
    expect(claimRefs('s1')).toEqual([photo()])
    // The user references the same file again for a new message.
    syncRefs('s1', [photo()], 'live')
    expect(claimRefs('s1')).toEqual([photo()])
  })

  it('re-arms after a removal, so a re-attach injects again', () => {
    syncRefs('s1', [photo()], 'live')
    expect(claimRefs('s1')).toEqual([photo()])
    syncRefs('s1', [], 'removed')
    syncRefs('s1', [photo()], 'live')
    expect(claimRefs('s1')).toEqual([photo()])
  })

  // The other half of the distinction: an unconfirmed push is re-issued as
  // `retry` and must NOT resurrect a set that was already injected, while a
  // genuinely different set still replaces a stale held one.
  it('keeps a spent set on an identical retry, and re-arms on a different one', () => {
    syncRefs('s1', [photo()], 'live')
    expect(claimRefs('s1')).toEqual([photo()])
    syncRefs('s1', [photo()], 'retry')
    expect(claimRefs('s1')).toBeUndefined()
    syncRefs('s1', [photo(), file()], 'retry')
    expect(claimRefs('s1')).toEqual([photo(), file()])
  })

  it.each<[RefPushReason]>([['live'], ['retry'], ['removed']])(
    'lets %s replace a held set with a different one',
    (reason) => {
      syncRefs('s1', [photo()], 'live')
      syncRefs('s1', [file()], reason)
      expect(readRefs('s1').refs).toEqual([file()])
      expect(claimRefs('s1')).toEqual([file()])
    },
  )
})

/**
 * The push log: the instrument that settles "the client pushed nothing" against
 * "the client pushed an empty set" in one request, which is the afternoon R31
 * spent. It is bounded, per session, and in memory only.
 */
describe('the push log', () => {
  it('records the count and the reason of every push, oldest first', () => {
    syncRefs('s1', [photo()], 'live')
    syncRefs('s1', [], 'sent')
    expect(readRefs('s1').log).toMatchObject([
      { count: 1, reason: 'live' },
      { count: 0, reason: 'sent' },
    ])
  })

  // This pair is the diagnosis the log exists for: it says the client pushed the
  // set, then pushed an empty one ON PURPOSE after the send, which is a fact no
  // single `refs` reading can show.
  it('shows a send as the empty push it was, not as a missing push', () => {
    syncRefs('s1', [photo()], 'live')
    syncRefs('s1', [], 'sent')
    const log = readRefs('s1').log
    expect(log.map(entry => entry.reason)).toEqual(['live', 'sent'])
    expect(log[1]!.count).toBe(0)
  })

  it('records a redundant identical push too, since that is what it explains', () => {
    syncRefs('s1', [photo()], 'live')
    syncRefs('s1', [photo()], 'retry')
    expect(readRefs('s1').log).toHaveLength(2)
  })

  it('timestamps each entry with a number, and never goes backwards', () => {
    syncRefs('s1', [photo()], 'live')
    syncRefs('s1', [], 'removed')
    const log = readRefs('s1').log
    expect(log.every(entry => typeof entry.at === 'number')).toBe(true)
    expect(log[1]!.at).toBeGreaterThanOrEqual(log[0]!.at)
  })

  it('keeps only the newest entries, bounded by the limit', () => {
    for (let i = 0; i < PUSH_LOG_LIMIT + 5; i++) syncRefs('s1', [photo(`r${i}`)], 'live')
    const log = readRefs('s1').log
    expect(log).toHaveLength(PUSH_LOG_LIMIT)
    // The five oldest fell off: the newest entry is the last push made.
    expect(log[log.length - 1]!.count).toBe(1)
    expect(log[0]!.reason).toBe('live')
  })

  it('keeps each session\'s log its own', () => {
    syncRefs('s1', [photo()], 'live')
    syncRefs('s2', [file()], 'live')
    syncRefs('s2', [], 'removed')
    expect(readRefs('s1').log).toHaveLength(1)
    expect(readRefs('s2').log).toHaveLength(2)
  })

  it('drops the log with the session', () => {
    syncRefs('s1', [photo()], 'live')
    clearRefs('s1')
    expect(readRefs('s1').log).toEqual([])
  })

  it('hands over fresh rows, so a reader cannot edit the record', () => {
    syncRefs('s1', [photo()], 'live')
    const log = readRefs('s1').log
    log[0]!.reason = 'sent'
    log[0]!.count = 99
    expect(readRefs('s1').log).toMatchObject([{ count: 1, reason: 'live' }])
  })

  it('reports no pushes at all for a session the host never heard of', () => {
    expect(readRefs('never-pushed').log).toEqual([])
  })
})

describe('readRefs', () => {
  // The diagnostic's whole point: after attaching a file and sending, this says
  // whether the client failed to push (empty) or the host failed to inject
  // (non-empty and unspent) — instead of an afternoon of inference.
  it('reports an absent session as an empty, unspent set with no pushes', () => {
    expect(readRefs('never-pushed')).toEqual({ refs: [], spent: false, log: [] })
  })

  it('reports exactly what a push left held', () => {
    syncRefs('s1', [photo(), file()], 'live')
    const read = readRefs('s1')
    expect(read.refs).toEqual([photo(), file()])
    expect(read.spent).toBe(false)
  })

  it('reports the set as spent once a step claimed it', () => {
    syncRefs('s1', [photo()], 'live')
    claimRefs('s1')
    expect(readRefs('s1')).toMatchObject({ refs: [photo()], spent: true })
  })

  it('reports an empty set after a removal cleared the draft', () => {
    syncRefs('s1', [photo()], 'live')
    syncRefs('s1', [], 'removed')
    expect(readRefs('s1')).toMatchObject({ refs: [], spent: false })
  })

  it('reports an absent session after disposal', () => {
    syncRefs('s1', [photo()], 'live')
    clearRefs('s1')
    expect(readRefs('s1')).toEqual({ refs: [], spent: false, log: [] })
  })

  // Reading is not claiming: a diagnostic that spent the set would break the
  // very turn it was run to explain.
  it('does not spend the set, and does not re-arm it either', () => {
    syncRefs('s1', [photo()], 'live')
    readRefs('s1')
    expect(claimRefs('s1')).toEqual([photo()])
    readRefs('s1')
    expect(claimRefs('s1')).toBeUndefined()
  })

  it('hands over a copy, so a caller cannot mutate the held set', () => {
    syncRefs('s1', [photo()], 'live')
    expect(claimRefs('s1')).toEqual([photo()])
    // If the read handed back the held array itself, this push would make the
    // identical re-push below look like a NEW set and re-arm it.
    readRefs('s1').refs.push(file())
    syncRefs('s1', [photo()], 'retry')
    expect(claimRefs('s1')).toBeUndefined()
  })
})

describe('parsePendingAttachment', () => {
  it('accepts a well-formed row', () => {
    expect(parsePendingAttachment({ ref: 'r1', relativePath: 'uploads/s/a.png', isPhoto: true }))
      .toEqual({ ref: 'r1', relativePath: 'uploads/s/a.png', isPhoto: true })
  })

  // Each rejection is a row that would otherwise reach `instructionFor` and render
  // `undefined` into the model's context.
  it.each([
    ['a non-object', 42],
    ['null', null],
    ['a missing ref', { relativePath: 'a', isPhoto: true }],
    ['an empty ref', { ref: '', relativePath: 'a', isPhoto: true }],
    ['a missing path', { ref: 'r', isPhoto: true }],
    ['an empty path', { ref: 'r', relativePath: '', isPhoto: true }],
    ['a non-boolean isPhoto', { ref: 'r', relativePath: 'a', isPhoto: 'yes' }],
    ['a missing isPhoto', { ref: 'r', relativePath: 'a' }],
  ])('rejects %s', (_label, value) => {
    expect(parsePendingAttachment(value)).toBeUndefined()
  })

  it('drops unknown extra fields rather than passing them through', () => {
    expect(parsePendingAttachment({ ref: 'r', relativePath: 'a', isPhoto: false, evil: 1 }))
      .toEqual({ ref: 'r', relativePath: 'a', isPhoto: false })
  })
})

describe('parsePushReason', () => {
  it.each<[RefPushReason]>([['live'], ['retry'], ['sent'], ['removed']])('accepts %s', (reason) => {
    expect(parsePushReason(reason, 0)).toBe(reason)
    expect(parsePushReason(reason, 3)).toBe(reason)
  })

  // An older client sends no reason. The default is exactly what this store did
  // before reasons existed — an empty push cleared, a non-empty one that was
  // identical kept its spent flag — so an old client keeps working, bug included,
  // rather than acquiring a new one.
  it.each([
    ['an absent reason', undefined],
    ['null', null],
    ['a number', 7],
    ['an unknown word', 'commit'],
    ['an object', { reason: 'sent' }],
  ])('defaults %s to the pre-R31 behaviour', (_label, value) => {
    expect(parsePushReason(value, 0)).toBe('removed')
    expect(parsePushReason(value, 1)).toBe('retry')
  })
})
