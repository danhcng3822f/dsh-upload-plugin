import { describe, it, expect } from 'vitest'
import { formatFileSize } from '../src/client/uploader.js'

describe('client uploader', () => {
  it('formats file sizes accurately', () => {
    expect(formatFileSize(500)).toBe('500 B')
    expect(formatFileSize(1536)).toBe('1.5 KB')
    expect(formatFileSize(2.5 * 1024 * 1024)).toBe('2.5 MB')
  })
})
