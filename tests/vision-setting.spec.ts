import { describe, it, expect } from 'vitest'
import { hasVision, setVision, type ModelRow } from '../src/client/vision-setting.js'

const rows: ModelRow[] = [
  { id: 'a', name: 'A', contextWindow: 1000 },
  { id: 'b', name: 'B', input: ['text'], future: { keep: true } },
]

describe('hasVision', () => {
  it('is true only when input lists image', () => {
    expect(hasVision({ id: 'x', input: ['text', 'image'] })).toBe(true)
    expect(hasVision({ id: 'x', input: ['text'] })).toBe(false)
    expect(hasVision({ id: 'x' })).toBe(false)
  })

  it('reads the declared modalities, not the position of image in the list', () => {
    // A position-based check (`row.input[1] === 'image'`) passes every case above,
    // and this function decides whether a checkbox reads checked.
    expect(hasVision({ id: 'x', input: ['image', 'text'] })).toBe(true)
    expect(hasVision({ id: 'x', input: ['text', 'image', 'audio'] })).toBe(true)
  })

  it('is false when input is present but is not an array', () => {
    // The document is hand-editable, so `Array.isArray` is what stops a plain
    // string from answering true through `String.prototype.includes`.
    expect(hasVision({ id: 'x', input: 'image' } as unknown as ModelRow)).toBe(false)
  })
})

describe('setVision', () => {
  it('adds the image modality to the named row', () => {
    const next = setVision(rows, 'a', true)
    expect(next[0].input).toEqual(['text', 'image'])
  })

  it('preserves every other field of the row verbatim', () => {
    const next = setVision(rows, 'b', true)
    expect(next[1].future).toEqual({ keep: true })
    expect(next[1].name).toBe('B')
  })

  it('removes the input key when switching off', () => {
    const next = setVision(setVision(rows, 'a', true), 'a', false)
    expect('input' in next[0]).toBe(false)
  })

  it('leaves other rows untouched', () => {
    const next = setVision(rows, 'a', true)
    expect(next[1]).toEqual(rows[1])
  })

  it('is a no-op for an unknown id', () => {
    expect(setVision(rows, 'zzz', true)).toEqual(rows)
  })

  it('does not mutate the input array', () => {
    setVision(rows, 'a', true)
    expect(rows[0].input).toBeUndefined()
  })

  it('clones the row it switches off instead of mutating it in place', () => {
    // The suite's only mutation detector covered the `on` path, so an
    // implementation that mutated in place when switching OFF passed all of it.
    const source: ModelRow[] = [{ id: 'a', name: 'A', input: ['text', 'image'], future: { keep: true } }]
    const next = setVision(source, 'a', false)
    expect('input' in next[0]).toBe(false)
    expect(next[0]).not.toBe(source[0])
    expect(source[0].input).toEqual(['text', 'image'])
    expect(source[0].future).toEqual({ keep: true })
  })
})
