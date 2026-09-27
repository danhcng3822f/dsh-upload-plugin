import { describe, it, expect, beforeEach } from 'vitest'
import {
  claimRefs, clearRefs, parsePendingAttachment, readRefs, syncRefs,
} from '../src/host/refs-store.js'
import type { PendingAttachment } from '../src/types.js'

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
    syncRefs('s1', [photo()])
    expect(claimRefs('s1')).toEqual([photo()])
  })

  it('spends the set: a later claim gets nothing', () => {
    syncRefs('s1', [photo()])
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
    syncRefs('s1', [photo()])
    expect(claimRefs('s1')).toEqual([photo()])
    // The composer re-renders during the turn and pushes the same live set again.
    syncRefs('s1', [photo()])
    expect(claimRefs('s1')).toBeUndefined()
    expect(claimRefs('s1')).toBeUndefined()
  })

  it('treats a different set as a fresh attachment', () => {
    syncRefs('s1', [photo()])
    expect(claimRefs('s1')).toEqual([photo()])
    // The user attached another file and sent again.
    syncRefs('s1', [photo(), file()])
    expect(claimRefs('s1')).toEqual([photo(), file()])
  })

  it('re-arms on an empty push, so a re-attach after a send injects again', () => {
    syncRefs('s1', [photo()])
    expect(claimRefs('s1')).toEqual([photo()])
    // A committed send empties the draft; the client pushes the empty set.
    syncRefs('s1', [])
    expect(claimRefs('s1')).toBeUndefined()
    // Attaching the same file again is a NEW set and must inject.
    syncRefs('s1', [photo()])
    expect(claimRefs('s1')).toEqual([photo()])
  })

  it('keeps sessions apart', () => {
    syncRefs('s1', [photo()])
    syncRefs('s2', [file()])
    expect(claimRefs('s2')).toEqual([file()])
    expect(claimRefs('s1')).toEqual([photo()])
  })

  it('ignores an empty session id', () => {
    syncRefs('', [photo()])
    expect(claimRefs('')).toBeUndefined()
  })

  // Asserted through the store's own behaviour rather than by reading internals:
  // an identical re-push keeps the held set, so mutating what a claim handed back
  // must not change what the store compares against. If the claim returned the
  // held array itself, the appended element would make the re-push look different
  // and the set would be re-armed.
  it('hands over a copy, so a caller cannot mutate the held set', () => {
    syncRefs('s1', [photo()])
    const claimed = claimRefs('s1')!
    claimed.push(file())
    syncRefs('s1', [photo()])
    expect(claimRefs('s1')).toBeUndefined()
  })

  it('drops a session on clear', () => {
    syncRefs('s1', [photo()])
    clearRefs('s1')
    expect(claimRefs('s1')).toBeUndefined()
  })
})

describe('readRefs', () => {
  // The diagnostic's whole point: after attaching a file and sending, this says
  // whether the client failed to push (empty) or the host failed to inject
  // (non-empty and unspent) — instead of an afternoon of inference.
  it('reports an absent session as an empty, unspent set', () => {
    expect(readRefs('never-pushed')).toEqual({ refs: [], spent: false })
  })

  it('reports exactly what a push left held', () => {
    syncRefs('s1', [photo(), file()])
    expect(readRefs('s1')).toEqual({ refs: [photo(), file()], spent: false })
  })

  it('reports the set as spent once a step claimed it', () => {
    syncRefs('s1', [photo()])
    claimRefs('s1')
    expect(readRefs('s1')).toEqual({ refs: [photo()], spent: true })
  })

  it('reports an empty set after a committed send cleared the draft', () => {
    syncRefs('s1', [photo()])
    syncRefs('s1', [])
    expect(readRefs('s1')).toEqual({ refs: [], spent: false })
  })

  it('reports an absent session after disposal', () => {
    syncRefs('s1', [photo()])
    clearRefs('s1')
    expect(readRefs('s1')).toEqual({ refs: [], spent: false })
  })

  // Reading is not claiming: a diagnostic that spent the set would break the
  // very turn it was run to explain.
  it('does not spend the set, and does not re-arm it either', () => {
    syncRefs('s1', [photo()])
    readRefs('s1')
    expect(claimRefs('s1')).toEqual([photo()])
    readRefs('s1')
    expect(claimRefs('s1')).toBeUndefined()
  })

  it('hands over a copy, so a caller cannot mutate the held set', () => {
    syncRefs('s1', [photo()])
    expect(claimRefs('s1')).toEqual([photo()])
    // If the read handed back the held array itself, this push would make the
    // identical re-push below look like a NEW set and re-arm it.
    readRefs('s1').refs.push(file())
    syncRefs('s1', [photo()])
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
