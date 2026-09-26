import { describe, it, expect } from 'vitest'
import { CUSTOM_EFFORT_KEY, effortChoices, effortLabel } from '../src/client/effort.js'

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
    const choices = effortChoices(
      { efforts: [{ id: 'low', name: 'Low' }, { id: 'high', name: 'High' }], defaultEffort: 'low' },
      'high',
    )
    expect(choices.find(c => c.selected)?.effort).toBe('high')
    expect(choices.filter(c => c.selected)).toHaveLength(1)
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

describe('effortLabel', () => {
  it('names the model default effort when the session names none', () => {
    expect(effortLabel({ efforts: [{ id: 'high', name: 'High' }], defaultEffort: 'high' }, undefined)).toBe('High')
  })

  it('names the session effort when it differs from the model default', () => {
    expect(
      effortLabel({ efforts: [{ id: 'low', name: 'Low' }, { id: 'high', name: 'High' }], defaultEffort: 'low' }, 'high'),
    ).toBe('High')
  })

  it('falls back to the raw id when the effective effort is not in the catalog', () => {
    expect(effortLabel({ efforts: [{ id: 'high', name: 'High' }], defaultEffort: 'max' }, undefined)).toBe('max')
  })

  it('returns undefined when the model declares no reasoning', () => {
    expect(effortLabel(undefined, 'high')).toBeUndefined()
  })

  it('returns undefined when no effort is effective', () => {
    expect(effortLabel({ efforts: [{ id: 'high', name: 'High' }] }, undefined)).toBeUndefined()
  })
})
