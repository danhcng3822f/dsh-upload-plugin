import { describe, it, expect } from 'vitest'
import { CUSTOM_EFFORT_KEY, effortChoices } from '../src/client/effort.js'

describe('effortChoices', () => {
  it('lists the model-declared efforts in host order, then Custom', () => {
    const choices = effortChoices(
      { efforts: [{ id: 'low', name: 'Low' }, { id: 'high', name: 'High' }], defaultEffort: 'high' },
      undefined,
    )
    expect(choices.map(c => c.key)).toEqual(['effort:low', 'effort:high', CUSTOM_EFFORT_KEY])
    expect(choices[1].label).toBe('High')
  })

  it('marks the effective effort as selected', () => {
    const choices = effortChoices({ efforts: [{ id: 'high', name: 'High' }], defaultEffort: 'high' }, undefined)
    expect(choices.find(c => c.selected)?.effort).toBe('high')
  })

  it('falls back to the model default when the session names none', () => {
    const choices = effortChoices({ efforts: [{ id: 'low', name: 'Low' }], defaultEffort: 'low' }, undefined)
    expect(choices.find(c => c.selected)?.effort).toBe('low')
  })

  it('prefers the session effort over the model default', () => {
    const choices = effortChoices({ efforts: [{ id: 'low', name: 'Low' }], defaultEffort: 'low' }, 'low')
    expect(choices.find(c => c.selected)?.effort).toBe('low')
  })

  it('returns nothing when the model declares no reasoning', () => {
    expect(effortChoices(undefined, undefined)).toEqual([])
  })

  it('returns nothing when the model declares an empty effort list', () => {
    expect(effortChoices({ efforts: [], defaultEffort: 'high' }, undefined)).toEqual([])
  })

  it('offers Custom with no effort value of its own', () => {
    const choices = effortChoices({ efforts: [{ id: 'high', name: 'High' }], defaultEffort: 'high' }, undefined)
    expect(choices.at(-1)?.effort).toBeUndefined()
    expect(choices.at(-1)?.custom).toBe(true)
  })
})
