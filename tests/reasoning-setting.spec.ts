import { describe, it, expect } from 'vitest'
import {
  addEffort,
  declaredEfforts,
  planDeclaration,
  planTypedEffort,
} from '../src/client/reasoning-setting.js'
import { THINKING_LEVELS } from '../src/client/effort.js'
import type { ModelRow } from '../src/client/vision-setting.js'

/**
 * The shape the reporting user's document actually holds: a custom route whose
 * rows spell out the four levels the endpoint serves, `off` included.
 */
const ROWS: ModelRow[] = [
  {
    id: 'cx/gpt-5.6-luna',
    name: 'GPT 5.6 Luna',
    contextWindow: 1000000,
    maxTokens: 50000,
    input: ['text', 'image'],
    reasoningEfforts: { off: null, low: 'low', medium: 'medium', high: 'high' },
    future: { keep: true },
  },
  { id: 'other/model', name: 'Other', reasoningEfforts: { high: 'high' } },
  { id: 'inherits', name: 'Inherits the catalog' },
  { id: 'no-reasoning', name: 'No reasoning', reasoningEfforts: false },
]

const MODEL = 'cx/gpt-5.6-luna'

describe('declaredEfforts', () => {
  it('returns the row’s own level dict', () => {
    expect(declaredEfforts(ROWS[0])).toEqual({ off: null, low: 'low', medium: 'medium', high: 'high' })
  })

  it('returns undefined when the row declares nothing', () => {
    // Undefined is the fact the whole refusal path turns on: the levels this
    // model offers come from the installed catalog, not from the document.
    expect(declaredEfforts(ROWS[2])).toBeUndefined()
  })

  it('treats false as no dict to extend', () => {
    // `false` is a declaration — "this model does not reason" — and extending it
    // would be a type error the schema refuses.
    expect(declaredEfforts(ROWS[3])).toBeUndefined()
  })

  it('rejects a non-dict value a hand-edited document can hold', () => {
    expect(declaredEfforts({ id: 'x', reasoningEfforts: ['high'] } as unknown as ModelRow)).toBeUndefined()
    expect(declaredEfforts({ id: 'x', reasoningEfforts: 'high' } as unknown as ModelRow)).toBeUndefined()
  })
})

describe('addEffort', () => {
  it('adds a level under its own name as the wire value', () => {
    const next = addEffort(ROWS, MODEL, 'xhigh')
    expect(declaredEfforts(next[0])).toEqual({
      off: null, low: 'low', medium: 'medium', high: 'high', xhigh: 'xhigh',
    })
  })

  it('keeps every level the row already declared, with its wire spelling', () => {
    // The declaration is the whole offer, so a level dropped here is a level the
    // menu stops offering: the write must extend the dict, never replace it.
    const next = addEffort(ROWS, MODEL, 'minimal')
    const declared = declaredEfforts(next[0])!
    expect(declared.off).toBeNull()
    expect(declared.low).toBe('low')
    expect(declared.medium).toBe('medium')
    expect(declared.high).toBe('high')
  })

  it('declares off as null, the one level that may send no parameter', () => {
    const next = addEffort(ROWS, 'other/model', 'off')
    expect(declaredEfforts(next[1])!.off).toBeNull()
  })

  it('preserves every other field of the row', () => {
    const next = addEffort(ROWS, MODEL, 'xhigh')
    expect(next[0].name).toBe('GPT 5.6 Luna')
    expect(next[0].contextWindow).toBe(1000000)
    expect(next[0].maxTokens).toBe(50000)
    expect(next[0].input).toEqual(['text', 'image'])
    expect(next[0].future).toEqual({ keep: true })
  })

  it('leaves every other row untouched', () => {
    const next = addEffort(ROWS, MODEL, 'xhigh')
    expect(next[1]).toEqual(ROWS[1])
    expect(next[2]).toEqual(ROWS[2])
    expect(next[3]).toEqual(ROWS[3])
  })

  it('is a no-op for an unknown id', () => {
    expect(addEffort(ROWS, 'zzz', 'xhigh')).toEqual(ROWS)
  })

  it('leaves a row with no declaration alone rather than inventing one', () => {
    // Declaring a single level on this row would NARROW the model to that level
    // alone, and restating the catalog's levels would change their wire
    // spellings — the catalog maps `minimal` to "low" and `off` to "none".
    expect(addEffort(ROWS, 'inherits', 'xhigh')[2]).toEqual(ROWS[2])
    expect(addEffort(ROWS, 'no-reasoning', 'xhigh')[3]).toEqual(ROWS[3])
  })

  it('is idempotent for a level the row already declares', () => {
    const once = addEffort(ROWS, MODEL, 'high')
    const twice = addEffort(once, MODEL, 'high')
    expect(declaredEfforts(twice[0])).toEqual(declaredEfforts(ROWS[0]))
  })

  it('does not mutate the input array or its rows', () => {
    addEffort(ROWS, MODEL, 'xhigh')
    expect(declaredEfforts(ROWS[0])).toEqual({ off: null, low: 'low', medium: 'medium', high: 'high' })
    expect(ROWS).toHaveLength(4)
  })
})

describe('planTypedEffort', () => {
  const offered = ['off', 'low', 'medium', 'high']

  it('selects a level the model already offers, with no write', () => {
    expect(planTypedEffort('high', offered)).toEqual({ kind: 'select', effort: 'high' })
  })

  it('refuses a value outside the seven level names, naming all of them', () => {
    const plan = planTypedEffort('8192', offered)
    expect(plan.kind).toBe('refuse')
    if (plan.kind !== 'refuse') return
    for (const level of THINKING_LEVELS) expect(plan.reason).toContain(level)
    expect(plan.reason).toContain('8192')
  })

  it('refuses a provider-specific spelling the schema would reject', () => {
    // The half of the bug that was purely a UX lie: this used to be accepted,
    // submitted, and refused by the Host at send time.
    expect(planTypedEffort('none', offered).kind).toBe('refuse')
    expect(planTypedEffort('High', offered).kind).toBe('refuse')
    expect(planTypedEffort('', offered).kind).toBe('refuse')
  })

  it('reads the declaration for a level the schema accepts but the model lacks', () => {
    expect(planTypedEffort('xhigh', offered)).toEqual({ kind: 'read', level: 'xhigh' })
    expect(planTypedEffort('minimal', offered)).toEqual({ kind: 'read', level: 'minimal' })
  })
})

describe('planDeclaration', () => {
  it('produces the provider’s rows with the level added', () => {
    const plan = planDeclaration('xhigh', ROWS, MODEL)
    expect(plan.kind).toBe('declare')
    if (plan.kind !== 'declare') return
    expect(declaredEfforts(plan.models[0])!.xhigh).toBe('xhigh')
    expect(declaredEfforts(plan.models[0])!.high).toBe('high')
  })

  it('refuses when the document does not describe the provider route', () => {
    const plan = planDeclaration('xhigh', undefined, MODEL)
    expect(plan.kind).toBe('refuse')
    if (plan.kind !== 'refuse') return
    expect(plan.reason).toContain(MODEL)
  })

  it('refuses a route that declares no models at all', () => {
    // A route serving the installed catalog: there is no row to extend, and the
    // catalog's per-level wire spellings are not readable from here.
    const plan = planDeclaration('xhigh', [], MODEL)
    expect(plan.kind).toBe('refuse')
    if (plan.kind !== 'refuse') return
    expect(plan.reason).toContain('reasoningEfforts')
  })

  it('refuses a row that declares no reasoningEfforts, and says why', () => {
    const plan = planDeclaration('xhigh', ROWS, 'inherits')
    expect(plan.kind).toBe('refuse')
    if (plan.kind !== 'refuse') return
    expect(plan.reason).toContain('inherits')
    expect(plan.reason).toContain('reasoningEfforts')
    expect(plan.reason).toContain('xhigh')
  })

  it('refuses a row whose reasoningEfforts is false', () => {
    expect(planDeclaration('xhigh', ROWS, 'no-reasoning').kind).toBe('refuse')
  })
})
