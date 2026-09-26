import { describe, it, expect } from 'vitest'
import { draftWithoutChip } from '../src/client/attachment-bar.js'

/** The placeholder one chip occupies in the draft (one UTF-16 code unit). */
const CHIP = '\uFFFC'

describe('draftWithoutChip', () => {
  it('splices out the placeholder and leaves every other character alone', () => {
    expect(draftWithoutChip(`xem ${CHIP} rồi gửi`, 4)).toBe('xem  rồi gửi')
  })

  it('removes a chip sitting at the very start of the draft', () => {
    expect(draftWithoutChip(`${CHIP} sau`, 0)).toBe(' sau')
  })

  it('returns undefined when another character sits at the offset', () => {
    // The rail's ✕ must never eat a character the user typed: a stale offset
    // that lands on text is a refusal, not a deletion.
    expect(draftWithoutChip(`xem ${CHIP}`, 0)).toBeUndefined()
    expect(draftWithoutChip(`xem ${CHIP}`, 2)).toBeUndefined()
  })

  it('returns undefined when the offset is past the end of the draft', () => {
    expect(draftWithoutChip(`xem ${CHIP}`, 5)).toBeUndefined()
    expect(draftWithoutChip('', 0)).toBeUndefined()
  })

  it('returns undefined for a negative offset', () => {
    expect(draftWithoutChip(`${CHIP}x`, -1)).toBeUndefined()
  })
})
