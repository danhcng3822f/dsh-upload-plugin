import { describe, it, expect } from 'vitest'
import { checkImageIntake, intakeRefusalText, type ImageLimits } from '../src/client/intake.js'

const LIMITS: ImageLimits = {
  mediaTypes: ['image/png', 'image/jpeg', 'image/webp', 'image/gif'],
  maxImagesPerMessage: 3,
  maxImageBytes: 100,
  maxMessageImageBytes: 200,
}

/** A file as the checks read it: only the declared type and the byte count. */
const file = (type: string, size: number) => ({ type, size })
const png = (size = 10) => file('image/png', size)

describe('checkImageIntake', () => {
  it('admits a batch inside every limit', () => {
    expect(checkImageIntake([png(), png()], [png()], LIMITS)).toBeNull()
  })

  it('admits an empty batch without consulting the limits', () => {
    expect(checkImageIntake([], [png(), png(), png(), png()], LIMITS)).toBeNull()
  })

  it('admits everything while no limits are projected, deferring to the host', () => {
    expect(checkImageIntake([file('application/pdf', 1_000_000)], [png()], undefined)).toBeNull()
  })

  it('refuses a file the deployment does not list', () => {
    expect(checkImageIntake([png(), file('image/bmp', 10)], [], LIMITS))
      .toEqual({ reason: 'unsupportedType' })
  })

  it('checks format before any limit, so a non-image never reports a count or size', () => {
    // Four files break the count limit and the total, and one of them is a
    // non-image: the format problem is the one the user can act on.
    const batch = [png(90), png(90), file('text/plain', 90), png(90)]
    expect(checkImageIntake(batch, [], LIMITS)).toEqual({ reason: 'unsupportedType' })
  })

  it('counts the draft images the message already carries', () => {
    const batch = [png(), png()]
    expect(checkImageIntake(batch, [], LIMITS)).toBeNull()
    expect(checkImageIntake(batch, [png()], LIMITS)).toBeNull()
    expect(checkImageIntake(batch, [png(), png()], LIMITS))
      .toEqual({ reason: 'tooMany', limit: 3 })
  })

  it('refuses a batch whose own file exceeds the per-image limit', () => {
    expect(checkImageIntake([png(101)], [], LIMITS)).toEqual({ reason: 'fileTooLarge', limit: 100 })
  })

  it('does not apply the per-image limit to images already in the draft', () => {
    // The composer checks the picked batch alone against maxImageBytes; only the
    // total is a projection over the whole message.
    expect(checkImageIntake([png(10)], [png(150)], LIMITS)).toBeNull()
  })

  it('sums the draft bytes and the batch bytes for the message limit', () => {
    // 120 + 90 = 210 over the 200-byte total, while the batch file is inside the
    // 100-byte per-image limit — so only the summed check can refuse it.
    expect(checkImageIntake([png(90)], [png(120)], LIMITS))
      .toEqual({ reason: 'totalTooLarge', limit: 200 })
  })

  it('treats each limit as inclusive at its exact value', () => {
    // Exactly at the count, exactly at the per-image size, exactly at the total.
    expect(checkImageIntake([png(100)], [png(100)], LIMITS)).toBeNull()
  })

  it('prefers the count limit over a size problem in the same batch', () => {
    expect(checkImageIntake([png(101), png(101), png(101), png(101)], [], LIMITS))
      .toEqual({ reason: 'tooMany', limit: 3 })
  })

  it('prefers the per-image limit over the total it also breaks', () => {
    expect(checkImageIntake([png(150), png(150)], [], LIMITS))
      .toEqual({ reason: 'fileTooLarge', limit: 100 })
  })
})

describe('intakeRefusalText', () => {
  it('names the supported formats without echoing the rejected type', () => {
    expect(intakeRefusalText({ reason: 'unsupportedType' })).toBe('Chỉ hỗ trợ ảnh PNG, JPG, WebP, GIF')
  })

  it('names the count limit it broke', () => {
    expect(intakeRefusalText({ reason: 'tooMany', limit: 20 })).toContain('20')
  })

  it('renders the byte limits through the plugin formatter', () => {
    expect(intakeRefusalText({ reason: 'fileTooLarge', limit: 5 * 1024 * 1024 })).toContain('5.0 MB')
    expect(intakeRefusalText({ reason: 'totalTooLarge', limit: 100 * 1024 * 1024 })).toContain('100.0 MB')
  })

  it('distinguishes the per-image limit from the message total', () => {
    expect(intakeRefusalText({ reason: 'fileTooLarge', limit: 1024 }))
      .not.toBe(intakeRefusalText({ reason: 'totalTooLarge', limit: 1024 }))
  })
})
