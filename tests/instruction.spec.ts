import { describe, it, expect } from 'vitest'
import { instructionFor } from '../src/client/instruction.js'
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
})
