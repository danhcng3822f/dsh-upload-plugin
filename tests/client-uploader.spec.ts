import { describe, it, expect } from 'vitest'
import { formatFileSize, generateDraftPrompt } from '../src/client/uploader.js'

describe('client uploader prompt generation', () => {
  it('generates prompt for a single photo referencing read_image', () => {
    const prompt = generateDraftPrompt([{ relativePath: 'uploads/scenery.png', isPhoto: true }])
    expect(prompt).toContain('uploads/scenery.png')
    expect(prompt).toContain('read_image')
  })

  it('generates prompt for multiple photos referencing read_image', () => {
    const prompt = generateDraftPrompt([
      { relativePath: 'uploads/photo1.png', isPhoto: true },
      { relativePath: 'uploads/photo2.jpg', isPhoto: true },
    ])
    expect(prompt).toContain('uploads/photo1.png')
    expect(prompt).toContain('uploads/photo2.jpg')
    expect(prompt).toContain('2 ảnh')
    expect(prompt).toContain('read_image')
  })

  it('generates prompt for a single file referencing read tool', () => {
    const prompt = generateDraftPrompt([{ relativePath: 'uploads/notes.txt', isPhoto: false }])
    expect(prompt).toContain('uploads/notes.txt')
    expect(prompt).toContain('read')
  })

  it('generates prompt for multiple files referencing read tool', () => {
    const prompt = generateDraftPrompt([
      { relativePath: 'uploads/data.csv', isPhoto: false },
      { relativePath: 'uploads/info.pdf', isPhoto: false },
    ])
    expect(prompt).toContain('uploads/data.csv')
    expect(prompt).toContain('uploads/info.pdf')
    expect(prompt).toContain('2 file')
    expect(prompt).toContain('read')
  })

  it('formats file sizes accurately', () => {
    expect(formatFileSize(500)).toBe('500 B')
    expect(formatFileSize(1536)).toBe('1.5 KB')
    expect(formatFileSize(2.5 * 1024 * 1024)).toBe('2.5 MB')
  })
})
