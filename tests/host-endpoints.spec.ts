import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  handleCheckVision, handleListUploads, handleReadRefs, handleSyncRefs, handleUpload, handleViewFile,
} from '../src/host/endpoints.ts'
import { claimRefs, clearRefs } from '../src/host/refs-store.ts'
import { mkdtemp, rm, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

describe('host endpoints', () => {
  it('detects model vision capability correctly', async () => {
    const mockLlm = {
      resolveModelInfo: vi.fn().mockResolvedValue({
        id: 'gpt-4o',
        inputModalities: ['text', 'image'],
      }),
    }
    const result = await handleCheckVision(mockLlm as any, 'openai', 'gpt-4o')
    expect(result.hasVision).toBe(true)
    expect(result.model).toBe('gpt-4o')
  })

  it('reports no vision if model only has text modality', async () => {
    const mockLlm = {
      resolveModelInfo: vi.fn().mockResolvedValue({
        id: 'deepseek-chat',
        inputModalities: ['text'],
      }),
    }
    const result = await handleCheckVision(mockLlm as any, 'deepseek', 'deepseek-chat')
    expect(result.hasVision).toBe(false)
  })

  it('saves uploaded file to uploads directory', async () => {
    const tempDir = await mkdtemp(join(tmpdir(), 'dsh-upload-'))
    try {
      const base64Data = Buffer.from('hello world').toString('base64')
      const result = await handleUpload(tempDir, 'test.txt', base64Data, false)
      expect(result.ok).toBe(true)
      expect(result.relativePath).toBe('uploads/test.txt')

      const saved = await readFile(result.fullPath!, 'utf8')
      expect(saved).toBe('hello world')
    } finally {
      await rm(tempDir, { recursive: true, force: true })
    }
  })

  it('isolates uploads per session ID', async () => {
    const tempDir = await mkdtemp(join(tmpdir(), 'dsh-upload-session-'))
    try {
      const b64A = Buffer.from('session A file').toString('base64')
      const b64B = Buffer.from('session B file').toString('base64')

      const resA = await handleUpload(tempDir, 'doc.txt', b64A, false, 'session-123')
      const resB = await handleUpload(tempDir, 'doc.txt', b64B, false, 'session-456')

      expect(resA.relativePath).toBe('uploads/session-123/doc.txt')
      expect(resB.relativePath).toBe('uploads/session-456/doc.txt')

      const listA = await handleListUploads(tempDir, 'session-123')
      expect(listA.files.length).toBe(1)
      expect(listA.files[0].relativePath).toBe('uploads/session-123/doc.txt')

      const listB = await handleListUploads(tempDir, 'session-456')
      expect(listB.files.length).toBe(1)
      expect(listB.files[0].relativePath).toBe('uploads/session-456/doc.txt')

      const viewA = await handleViewFile(tempDir, resA.relativePath!)
      expect(viewA.buffer?.toString()).toBe('session A file')

      const viewB = await handleViewFile(tempDir, resB.relativePath!)
      expect(viewB.buffer?.toString()).toBe('session B file')
    } finally {
      await rm(tempDir, { recursive: true, force: true })
    }
  })

  it('lists uploaded files and views an uploaded file', async () => {
    const tempDir = await mkdtemp(join(tmpdir(), 'dsh-upload-list-'))
    try {
      const b64 = Buffer.from('image content').toString('base64')
      await handleUpload(tempDir, 'photo.png', b64, true)

      const listRes = await handleListUploads(tempDir)
      expect(listRes.ok).toBe(true)
      expect(listRes.files.length).toBe(1)
      expect(listRes.files[0].name).toBe('photo.png')
      expect(listRes.files[0].isPhoto).toBe(true)

      const viewRes = await handleViewFile(tempDir, 'uploads/photo.png')
      expect(viewRes.found).toBe(true)
      expect(viewRes.contentType).toBe('image/png')
      expect(viewRes.buffer?.toString()).toBe('image content')
    } finally {
      await rm(tempDir, { recursive: true, force: true })
    }
  })
})

describe('handleSyncRefs', () => {
  beforeEach(() => { clearRefs('s1') })

  it('records a valid push and reports the count', async () => {
    const result = await handleSyncRefs({
      sessionId: 's1',
      refs: [
        { ref: 'a', relativePath: 'uploads/s/a.png', isPhoto: true },
        { ref: 'b', relativePath: 'uploads/s/b.txt', isPhoto: false },
      ],
    })
    expect(result).toEqual({ ok: true, count: 2 })
    expect(claimRefs('s1')).toHaveLength(2)
  })

  it('accepts an empty set, which is how a removal clears the host', async () => {
    const result = await handleSyncRefs({ sessionId: 's1', refs: [] })
    expect(result).toEqual({ ok: true, count: 0 })
    expect(claimRefs('s1')).toBeUndefined()
  })

  // R31: an empty push that says it came from a send must NOT clear the held set —
  // that is the bug this endpoint's reason field exists to fix.
  it('keeps the held set for an empty push the client marked as a send', async () => {
    await handleSyncRefs({
      sessionId: 's1',
      reason: 'live',
      refs: [{ ref: 'a', relativePath: 'uploads/s/a.txt', isPhoto: false }],
    })
    const result = await handleSyncRefs({ sessionId: 's1', reason: 'sent', refs: [] })
    expect(result).toEqual({ ok: true, count: 0 })
    expect(claimRefs('s1')).toEqual([
      { ref: 'a', relativePath: 'uploads/s/a.txt', isPhoto: false },
    ])
  })

  // A partially-recognized push still points the model at the attachments it can
  // name. Rejecting the whole push would silently lose all of them, which is the
  // worse failure for a set the user can see on the rail.
  it('drops malformed rows but keeps the usable ones', async () => {
    const result = await handleSyncRefs({
      sessionId: 's1',
      refs: [
        { ref: 'a', relativePath: 'uploads/s/a.png', isPhoto: true },
        { ref: '', relativePath: 'x', isPhoto: true },
        { nope: true },
        null,
      ],
    })
    expect(result).toEqual({ ok: true, count: 1 })
    expect(claimRefs('s1')).toEqual([
      { ref: 'a', relativePath: 'uploads/s/a.png', isPhoto: true },
    ])
  })

  it.each([
    ['a non-object body', 42],
    ['null', null],
    ['a missing sessionId', { refs: [] }],
    ['an empty sessionId', { sessionId: '', refs: [] }],
    ['a missing refs array', { sessionId: 's1' }],
    ['a non-array refs', { sessionId: 's1', refs: 'nope' }],
  ])('refuses %s', async (_label, payload) => {
    const result = await handleSyncRefs(payload)
    expect(result.ok).toBe(false)
    expect(result.count).toBe(0)
    expect(result.error).toBeDefined()
  })

  it('refuses without recording anything', async () => {
    await handleSyncRefs({ sessionId: 's1', refs: 'nope' })
    expect(claimRefs('s1')).toBeUndefined()
  })
})

/**
 * The read half of the refs endpoint: what the host holds for a session, right
 * now. This is the difference between "the client never pushed" and "the host
 * never injected" being one request instead of an afternoon of inference.
 */
describe('handleReadRefs', () => {
  beforeEach(() => { clearRefs('s1') })

  it('reports a session the host never heard of as empty, unspent, with no pushes', async () => {
    expect(await handleReadRefs('s1')).toEqual({ sessionId: 's1', refs: [], spent: false, log: [] })
  })

  // Echoing the id is what makes a mistyped query parameter visible: the caller
  // sees '' come back rather than reading "nothing held" as a client failure.
  it('echoes the session id it was asked about, empty when none was given', async () => {
    expect(await handleReadRefs(undefined)).toEqual({ sessionId: '', refs: [], spent: false, log: [] })
    expect(await handleReadRefs('s1')).toEqual({ sessionId: 's1', refs: [], spent: false, log: [] })
  })

  it('reports exactly what a push left held, and the push that left it', async () => {
    await handleSyncRefs({
      sessionId: 's1',
      refs: [{ ref: 'a', relativePath: 'uploads/s/a.txt', isPhoto: false }],
    })
    expect(await handleReadRefs('s1')).toEqual({
      sessionId: 's1',
      refs: [{ ref: 'a', relativePath: 'uploads/s/a.txt', isPhoto: false }],
      spent: false,
      // No reason on the wire is an older client, which this store treats as it
      // always did: a non-empty set re-asserted.
      log: [{ at: expect.any(Number), count: 1, reason: 'retry' }],
    })
  })

  it('reports the set as spent once a step claimed it', async () => {
    await handleSyncRefs({
      sessionId: 's1',
      refs: [{ ref: 'a', relativePath: 'uploads/s/a.txt', isPhoto: false }],
    })
    claimRefs('s1')
    const read = await handleReadRefs('s1')
    expect(read.spent).toBe(true)
    expect(read.refs).toHaveLength(1)
  })

  // A diagnostic that spent the set would break the very turn it was run to
  // explain, and one that re-armed it would re-inject an attachment twice.
  it('does not spend the set it reports', async () => {
    await handleSyncRefs({
      sessionId: 's1',
      refs: [{ ref: 'a', relativePath: 'uploads/s/a.txt', isPhoto: false }],
    })
    await handleReadRefs('s1')
    expect(claimRefs('s1')).toHaveLength(1)
    await handleReadRefs('s1')
    expect(claimRefs('s1')).toBeUndefined()
  })

  // The two halves must agree, or the diagnostic measures something other than
  // what the injection will do.
  it('agrees with what a removal cleared', async () => {
    await handleSyncRefs({
      sessionId: 's1',
      refs: [{ ref: 'a', relativePath: 'uploads/s/a.txt', isPhoto: false }],
    })
    await handleSyncRefs({ sessionId: 's1', reason: 'removed', refs: [] })
    expect(await handleReadRefs('s1')).toEqual({
      sessionId: 's1',
      refs: [],
      spent: false,
      log: [
        { at: expect.any(Number), count: 1, reason: 'retry' },
        { at: expect.any(Number), count: 0, reason: 'removed' },
      ],
    })
  })

  // And the diagnosis the log exists for: the send's empty push is visible as a
  // push, with the reason that says it must not have cleared anything.
  it('shows a send as an empty push that kept the held set', async () => {
    await handleSyncRefs({
      sessionId: 's1',
      reason: 'live',
      refs: [{ ref: 'a', relativePath: 'uploads/s/a.txt', isPhoto: false }],
    })
    await handleSyncRefs({ sessionId: 's1', reason: 'sent', refs: [] })
    expect(await handleReadRefs('s1')).toEqual({
      sessionId: 's1',
      refs: [{ ref: 'a', relativePath: 'uploads/s/a.txt', isPhoto: false }],
      spent: false,
      log: [
        { at: expect.any(Number), count: 1, reason: 'live' },
        { at: expect.any(Number), count: 0, reason: 'sent' },
      ],
    })
  })
})
