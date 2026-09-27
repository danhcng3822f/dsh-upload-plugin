import { describe, it, expect } from 'vitest'
import {
  addEffort,
  declareFirstEffort,
  declaredEfforts,
  hasEffortDeclaration,
  planDeclaration,
  planTypedEffort,
} from '../src/client/reasoning-setting.js'
import { DECLARABLE_LEVELS, THINKING_LEVELS } from '../src/client/effort.js'
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
  // No declaration at all — the row the first-declaration path is for.
  { id: 'inherits', name: 'Inherits the catalog' },
  { id: 'no-reasoning', name: 'No reasoning', reasoningEfforts: false },
]

const MODEL = 'cx/gpt-5.6-luna'

describe('declaredEfforts', () => {
  it('returns the row’s own level dict', () => {
    expect(declaredEfforts(ROWS[0])).toEqual({ off: null, low: 'low', medium: 'medium', high: 'high' })
  })

  it('returns undefined when the row declares nothing', () => {
    // Undefined is the fact the refusal path turns on: the levels this model
    // offers come from the installed catalog, not from the document.
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

describe('hasEffortDeclaration', () => {
  it('is false only when the field is absent', () => {
    expect(hasEffortDeclaration(ROWS[2])).toBe(false)
  })

  it('is true for a level dict', () => {
    expect(hasEffortDeclaration(ROWS[0])).toBe(true)
  })

  it('is true for false, which is a declaration and not an absent field', () => {
    // The distinction the first-declaration rule turns on: the resolved settings
    // value keeps an absent field `undefined` and `false` as `false`
    // (`llm-pi-ai/tests/config.spec.ts:27-33`), so the two are readable apart.
    expect(hasEffortDeclaration(ROWS[3])).toBe(true)
  })

  it('is true for a non-dict a hand-edited document can hold', () => {
    expect(hasEffortDeclaration({ id: 'x', reasoningEfforts: null } as unknown as ModelRow)).toBe(true)
    expect(hasEffortDeclaration({ id: 'x', reasoningEfforts: ['high'] } as unknown as ModelRow)).toBe(true)
    expect(hasEffortDeclaration({ id: 'x', reasoningEfforts: 'high' } as unknown as ModelRow)).toBe(true)
    expect(hasEffortDeclaration({ id: 'x', reasoningEfforts: {} } as unknown as ModelRow)).toBe(true)
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

describe('declareFirstEffort', () => {
  it('declares off plus the one level picked, and nothing else', () => {
    // The whole point: a level the user did not ask for may not exist on the
    // provider, so the first declaration names exactly the pick and `off`.
    expect(declaredEfforts(declareFirstEffort(ROWS, 'inherits', 'high')[2])).toEqual({ off: null, high: 'high' })
  })

  it('uses the level name as the wire value, as a hand declaration does', () => {
    expect(declaredEfforts(declareFirstEffort(ROWS, 'inherits', 'xhigh')[2])).toEqual({ off: null, xhigh: 'xhigh' })
  })

  it('always offers a level beyond off, which is what resolution requires', () => {
    for (const level of DECLARABLE_LEVELS) {
      const declared = declaredEfforts(declareFirstEffort(ROWS, 'inherits', level)[2])!
      expect(Object.keys(declared).some(key => key !== 'off')).toBe(true)
      expect(declared.off).toBeNull()
    }
  })

  it('preserves every other field of the row', () => {
    const rows: ModelRow[] = [{
      id: 'm',
      name: 'M',
      contextWindow: 1000000,
      maxTokens: 50000,
      input: ['text', 'image'],
      future: { keep: true },
    }]
    const next = declareFirstEffort(rows, 'm', 'low')
    expect(next[0].name).toBe('M')
    expect(next[0].contextWindow).toBe(1000000)
    expect(next[0].maxTokens).toBe(50000)
    expect(next[0].input).toEqual(['text', 'image'])
    expect(next[0].future).toEqual({ keep: true })
  })

  it('leaves every other row untouched', () => {
    const next = declareFirstEffort(ROWS, 'inherits', 'high')
    expect(next[0]).toEqual(ROWS[0])
    expect(next[1]).toEqual(ROWS[1])
    expect(next[3]).toEqual(ROWS[3])
  })

  it('is a no-op for an unknown id', () => {
    expect(declareFirstEffort(ROWS, 'zzz', 'high')).toEqual(ROWS)
  })

  it('does not mutate the input array or its rows', () => {
    declareFirstEffort(ROWS, 'inherits', 'high')
    expect('reasoningEfforts' in ROWS[2]).toBe(false)
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
    const plan = planDeclaration('xhigh', ROWS, MODEL, true)
    expect(plan.kind).toBe('declare')
    if (plan.kind !== 'declare') return
    expect(declaredEfforts(plan.models[0])!.xhigh).toBe('xhigh')
    expect(declaredEfforts(plan.models[0])!.high).toBe('high')
  })

  it('refuses when the document does not describe the provider route', () => {
    const plan = planDeclaration('xhigh', undefined, MODEL, true)
    expect(plan.kind).toBe('refuse')
    if (plan.kind !== 'refuse') return
    expect(plan.reason).toContain(MODEL)
  })

  it('refuses a route that declares no models at all', () => {
    // A route serving the installed catalog: there is no row to extend, and the
    // catalog's per-level wire spellings are not readable from here.
    const plan = planDeclaration('xhigh', [], MODEL, true)
    expect(plan.kind).toBe('refuse')
    if (plan.kind !== 'refuse') return
    expect(plan.reason).toContain('reasoningEfforts')
  })

  it('refuses a row that declares no reasoningEfforts while the Host reports levels, and says why', () => {
    // The catalog-base path, and the one R28 had to refuse: the levels this model
    // offers are the installed catalog's, so their spellings are the catalog's.
    const plan = planDeclaration('xhigh', ROWS, 'inherits', true)
    expect(plan.kind).toBe('refuse')
    if (plan.kind !== 'refuse') return
    expect(plan.reason).toContain('inherits')
    expect(plan.reason).toContain('reasoningEfforts')
    expect(plan.reason).toContain('xhigh')
  })

  it('refuses a row whose reasoningEfforts is false', () => {
    expect(planDeclaration('xhigh', ROWS, 'no-reasoning', true).kind).toBe('refuse')
  })
})

/**
 * The rule is the CONJUNCTION of two conditions — the row declares nothing AND
 * the Host reports nothing — so each combination is covered on its own. Only the
 * second row of this table may write a declaration the model never had.
 *
 * | the row's `reasoningEfforts` | the Host reports | outcome |
 * | --- | --- | --- |
 * | a dict | levels | extended |
 * | absent | nothing | declared |
 * | absent | levels (a catalog base) | refused |
 * | a dict | nothing | extended |
 */
describe('planDeclaration — no declaration AND nothing reported', () => {
  it('declares off plus the picked level when the row declares nothing and the Host reports nothing', () => {
    const plan = planDeclaration('high', ROWS, 'inherits', false)
    expect(plan.kind).toBe('declare')
    if (plan.kind !== 'declare') return
    expect(plan.first).toBe(true)
    expect(declaredEfforts(plan.models[2])).toEqual({ off: null, high: 'high' })
  })

  it('leaves every other row exactly as it was', () => {
    const plan = planDeclaration('high', ROWS, 'inherits', false)
    if (plan.kind !== 'declare') throw new Error('expected a declaration')
    expect(plan.models[0]).toEqual(ROWS[0])
    expect(plan.models[1]).toEqual(ROWS[1])
    expect(plan.models[3]).toEqual(ROWS[3])
  })

  it('still refuses when the Host reports levels, so a catalog base is never overwritten', () => {
    // The third row of the table, and the boundary that makes the new path safe:
    // a model whose levels come from an installed catalog REPORTS them, so it
    // never reaches the declaration path and its spellings are never restated.
    const plan = planDeclaration('high', ROWS, 'inherits', true)
    expect(plan.kind).toBe('refuse')
    if (plan.kind !== 'refuse') return
    expect(plan.reason).toContain('catalog')
  })

  it('extends a dict rather than replacing it, even when the Host reports nothing', () => {
    // The fourth row of the table: the row's own declaration is the authority on
    // its spellings, so a level joins it and nothing is dropped.
    const plan = planDeclaration('xhigh', ROWS, MODEL, false)
    expect(plan.kind).toBe('declare')
    if (plan.kind !== 'declare') return
    expect(plan.first).toBe(false)
    expect(declaredEfforts(plan.models[0])).toEqual({
      off: null, low: 'low', medium: 'medium', high: 'high', xhigh: 'xhigh',
    })
  })

  it('refuses off as a first declaration, because a declaration of off alone is refused', () => {
    // `resolveModelReasoning` refuses a declaration that offers no level beyond
    // `off` (`llm-pi-ai/src/catalog.ts:355-357`), and that resolution is the
    // namespace's write-time `validate` (`llm-pi-ai/src/index.ts:284-288`), so
    // writing `{ off: null }` would be refused after a pointless round trip.
    const plan = planDeclaration('off', ROWS, 'inherits', false)
    expect(plan.kind).toBe('refuse')
    if (plan.kind !== 'refuse') return
    expect(plan.reason).toContain('off')
  })

  it('refuses a row whose reasoningEfforts is false, even when nothing is reported', () => {
    // `false` is a declaration an author made on purpose — "this model does not
    // reason" — not an absent field, so the first-declaration path must not
    // overwrite it.
    const plan = planDeclaration('high', ROWS, 'no-reasoning', false)
    expect(plan.kind).toBe('refuse')
    if (plan.kind !== 'refuse') return
    expect(plan.reason).toContain('false')
  })

  it('refuses a non-dict declaration a hand edit can hold, even when nothing is reported', () => {
    const rows: ModelRow[] = [{ id: 'm', reasoningEfforts: ['high'] } as unknown as ModelRow]
    expect(planDeclaration('high', rows, 'm', false).kind).toBe('refuse')
  })

  it('refuses a route the document does not describe, even when nothing is reported', () => {
    expect(planDeclaration('high', undefined, 'm', false).kind).toBe('refuse')
  })

  it('refuses a route with no row for this model, even when nothing is reported', () => {
    // The route serves the installed catalog and carries no declaration for this
    // model, so there is no row to write into and no `models` array to name.
    expect(planDeclaration('high', [], 'm', false).kind).toBe('refuse')
  })

  it('declares a first declaration for every declarable level', () => {
    for (const level of DECLARABLE_LEVELS) {
      const plan = planDeclaration(level, ROWS, 'inherits', false)
      expect(plan.kind).toBe('declare')
      if (plan.kind !== 'declare') continue
      expect(plan.first).toBe(true)
      expect(declaredEfforts(plan.models[2])).toEqual({ off: null, [level]: level })
    }
  })

  it('never mutates the rows it was given', () => {
    planDeclaration('high', ROWS, 'inherits', false)
    expect('reasoningEfforts' in ROWS[2]).toBe(false)
  })
})
