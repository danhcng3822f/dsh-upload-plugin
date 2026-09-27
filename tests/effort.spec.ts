import { describe, it, expect } from 'vitest'
import {
  CUSTOM_EFFORT_KEY,
  DECLARABLE_LEVELS,
  effortChoices,
  effortLabel,
  firstDeclarationChoices,
  isDeclarableLevel,
  isThinkingLevel,
  reportsEfforts,
  thinkingLevelLabel,
  THINKING_LEVEL_NAMES,
  THINKING_LEVELS,
} from '../src/client/effort.js'

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

describe('the level vocabulary a Custom value is checked against', () => {
  it('is exactly pi-ai’s seven level names, in escalation order', () => {
    // Copied from `llm-pi-ai/src/catalog.ts:69-77`, which the profile schema
    // validates the declaration's keys against (`config.ts:203-206`). A drift
    // here is a value Custom accepts and the settings write then rejects.
    expect(THINKING_LEVELS).toEqual(['off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'])
  })

  it('accepts every level name', () => {
    for (const level of THINKING_LEVELS) expect(isThinkingLevel(level)).toBe(true)
  })

  it('refuses everything that is not a level name', () => {
    // The values a user is most likely to try instead: a token budget, a
    // provider's own spelling, a case variant, and the empty string.
    for (const value of ['8192', 'none', 'High', 'very-high', '', ' high', 'thinking']) {
      expect(isThinkingLevel(value)).toBe(false)
    }
  })

  it('spells the accepted levels for the notice, without a second list', () => {
    expect(THINKING_LEVEL_NAMES).toBe(THINKING_LEVELS.join(', '))
    for (const level of THINKING_LEVELS) expect(THINKING_LEVEL_NAMES).toContain(level)
  })
})

describe('reportsEfforts', () => {
  it('is true when the model names at least one level', () => {
    expect(reportsEfforts({ efforts: [{ id: 'high', name: 'High' }] })).toBe(true)
  })

  it('is false when the model declares no reasoning at all', () => {
    // The directory leaves `reasoning` out entirely for a model resolution finds
    // no levels for (`llm-pi-ai/src/adapter.ts:159-174`), which is the state the
    // user's undeclared model is in.
    expect(reportsEfforts(undefined)).toBe(false)
  })

  it('is false when the model carries an empty level list', () => {
    expect(reportsEfforts({ efforts: [], defaultEffort: 'high' })).toBe(false)
  })
})

describe('the levels a first declaration may name', () => {
  it('is every level except off', () => {
    // `off` cannot stand alone: resolution refuses a declaration that offers no
    // level beyond it (`llm-pi-ai/src/catalog.ts:355-357`), and that resolution is
    // the settings namespace's own write-time `validate`
    // (`llm-pi-ai/src/index.ts:284-288`), so `{ off: null }` is refused by the
    // Host rather than stored.
    expect(DECLARABLE_LEVELS).toEqual(['minimal', 'low', 'medium', 'high', 'xhigh', 'max'])
  })

  it('is derived from the seven, so a pi-ai upgrade cannot make the two drift', () => {
    expect([...DECLARABLE_LEVELS, 'off'].sort()).toEqual([...THINKING_LEVELS].sort())
    expect(DECLARABLE_LEVELS).toHaveLength(THINKING_LEVELS.length - 1)
  })

  it('accepts the six and refuses off and everything else', () => {
    for (const level of DECLARABLE_LEVELS) expect(isDeclarableLevel(level)).toBe(true)
    for (const value of ['off', '8192', 'High', 'high ', '']) expect(isDeclarableLevel(value)).toBe(false)
  })

  it('spells a level the way the Host spells it once the declaration exists', () => {
    // Mirrors the naming `reasoningInfo` applies (`llm-pi-ai/src/adapter.ts:169`),
    // so a row reads the same before the declaration and after the Host reports it.
    expect(DECLARABLE_LEVELS.map(level => thinkingLevelLabel(level)))
      .toEqual(['Minimal', 'Low', 'Medium', 'High', 'Xhigh', 'Max'])
  })
})

describe('firstDeclarationChoices', () => {
  it('offers one row per declarable level, in pi-ai’s escalation order', () => {
    expect(firstDeclarationChoices().map(c => c.key)).toEqual([
      'effort:minimal', 'effort:low', 'effort:medium', 'effort:high', 'effort:xhigh', 'effort:max',
    ])
  })

  it('carries each level as the row’s own effort', () => {
    expect(firstDeclarationChoices().map(c => c.effort)).toEqual([...DECLARABLE_LEVELS])
  })

  it('offers no Custom row: every level Custom could name is already a row', () => {
    expect(firstDeclarationChoices().some(c => c.custom)).toBe(false)
  })

  it('selects nothing, because no level is in effect', () => {
    expect(firstDeclarationChoices().some(c => c.selected)).toBe(false)
  })

  it('names every row, so a pick is never a blank button', () => {
    for (const choice of firstDeclarationChoices()) expect(choice.label).not.toBe('')
  })
})
