import { describe, it, expect } from 'vitest'
import { generateFileDraftPrompt } from '../src/client/uploader.js'

describe('client uploader prompt generation', () => {
  it('generates prompt for photos referencing read_image', () => {
    const prompt = generateFileDraftPrompt('uploads/scenery.png', true)
    expect(prompt).toContain('uploads/scenery.png')
    expect(prompt).toContain('read_image')
  })

  it('generates prompt for general files referencing read tool', () => {
    const prompt = generateFileDraftPrompt('uploads/notes.txt', false)
    expect(prompt).toContain('uploads/notes.txt')
    expect(prompt).toContain('read')
  })
})
