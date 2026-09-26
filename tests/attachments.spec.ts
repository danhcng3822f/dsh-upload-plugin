import { describe, it, expect } from 'vitest'
import {
  VISION_SOURCE, activeTokens, addRecord, findRecord, makeRef, makeToken, removeRecord,
  type AttachmentRecord,
} from '../src/client/attachments.js'

const rec = (token: string, isPhoto = true): AttachmentRecord => ({
  token, ref: makeRef('abc12345', token), relativePath: `uploads/s/${token}`,
  isPhoto, size: 10, uploadedAt: 1,
})

describe('makeToken', () => {
  it('strips the session prefix the uploader adds', () => {
    expect(makeToken('session_abc12345__photo.png', [])).toBe('photo.png')
  })

  it('returns the bare name when free', () => {
    expect(makeToken('photo.png', [])).toBe('photo.png')
  })

  it('suffixes before the extension on collision', () => {
    expect(makeToken('photo.png', ['photo.png'])).toBe('photo_2.png')
    expect(makeToken('photo.png', ['photo.png', 'photo_2.png'])).toBe('photo_3.png')
  })

  it('suffixes a name with no extension', () => {
    expect(makeToken('notes', ['notes'])).toBe('notes_2')
  })
})

describe('makeRef', () => {
  it('is session-scoped so the codec can resolve a ref without a session', () => {
    expect(makeRef('abc12345', 'photo.png')).toBe('abc12345-photo.png')
  })

  it('differs across sessions for the same token', () => {
    expect(makeRef('a', 'x.png')).not.toBe(makeRef('b', 'x.png'))
  })
})

describe('list operations', () => {
  it('adds, finds and removes by token', () => {
    const one = addRecord([], rec('a.png'))
    expect(findRecord(one, 'a.png')?.token).toBe('a.png')
    expect(removeRecord(one, 'a.png')).toEqual([])
  })

  it('replaces an existing token rather than duplicating it', () => {
    const twice = addRecord(addRecord([], rec('a.png')), { ...rec('a.png'), size: 99 })
    expect(twice).toHaveLength(1)
    expect(twice[0].size).toBe(99)
  })
})

describe('activeTokens', () => {
  const records = [rec('a.png'), rec('notes.txt', false)]

  it('returns only chips of this source that resolve to a known record', () => {
    const occ = [
      { source: VISION_SOURCE, ref: makeRef('abc12345', 'a.png') },
      { source: 'subagent', ref: 'other' },
      { source: VISION_SOURCE, ref: makeRef('abc12345', 'gone.png') },
    ]
    expect(activeTokens(occ, records)).toEqual([makeRef('abc12345', 'a.png')])
  })

  it('ignores invalid chips', () => {
    const occ = [{ source: VISION_SOURCE, ref: makeRef('abc12345', 'a.png'), invalid: true }]
    expect(activeTokens(occ, records)).toEqual([])
  })

  it('is empty when the draft holds no chips — the one-shot guarantee', () => {
    expect(activeTokens([], records)).toEqual([])
  })

  it('deduplicates a token that appears twice', () => {
    const ref = makeRef('abc12345', 'a.png')
    expect(activeTokens([{ source: VISION_SOURCE, ref }, { source: VISION_SOURCE, ref }], records)).toEqual([ref])
  })
})
