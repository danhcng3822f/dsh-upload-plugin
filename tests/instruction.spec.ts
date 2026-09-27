import { describe, it, expect } from 'vitest'
import { instructionFor } from '../src/instruction.js'
import { makeRef, type AttachmentRecord } from '../src/client/attachments.js'

const record = (over: Partial<AttachmentRecord> = {}): AttachmentRecord => ({
  token: 'photo.png', ref: makeRef('abc12345', 'photo.png'),
  relativePath: 'uploads/session-abc12345/photo.png', isPhoto: true, size: 10, uploadedAt: 1,
  ...over,
})

describe('instructionFor', () => {
  it('asks for read_image on a photo, naming the workspace path', () => {
    const text = instructionFor(record())
    expect(text).toContain('read_image')
    expect(text).toContain('uploads/session-abc12345/photo.png')
  })

  it('asks for read on a file, naming the workspace path', () => {
    const text = instructionFor(record({ token: 'notes.txt', isPhoto: false }))
    expect(text).toContain('`read`')
    expect(text).toContain('uploads/session-abc12345/photo.png')
  })

  it('never leaks the token or the ref into the model text', () => {
    const text = instructionFor(record())
    expect(text).not.toContain('abc12345-photo.png')
  })

  // R25-B2: the instruction is delivered as a host-side context injection, so it
  // must not read as something the USER typed. The old wording opened with "Tôi
  // vừa tải lên…" ("I just uploaded…"), which was accurate while the composer
  // spliced it into the user's own message and is a lie inside a context row.
  it('addresses the model rather than impersonating the user', () => {
    expect(instructionFor(record())).not.toContain('Tôi ')
    expect(instructionFor(record({ isPhoto: false }))).not.toContain('Tôi ')
    expect(instructionFor(record())).toContain('Bạn ')
  })

  // The two branches differ ONLY in the tool they name. A photo routed to `read`
  // or a file routed to `read_image` is a silently wrong turn, so each side is
  // asserted to exclude the other's tool.
  it('names read_image for a photo and read for a file, never both', () => {
    expect(instructionFor(record())).not.toContain('`read`')
    expect(instructionFor(record({ isPhoto: false }))).not.toContain('read_image')
  })
})
