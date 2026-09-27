/**
 * Read-modify-write for one model row's reasoning-effort declaration, and the
 * decision the composer's Custom row makes with it.
 *
 * A row's `reasoningEfforts` dict IS the model's whole offer: resolution maps
 * every level the dict does not name to unsupported
 * (`llm-pi-ai/src/catalog.ts:359-368`), and there is no spelling that restores a
 * key to "unset" (`llm-pi-ai/README.md:86`). So adding a level means *extending*
 * that dict — every level it already declares keeps both its presence and its
 * wire spelling, and every other field of the row, and every other row, survives
 * untouched.
 *
 * The one thing this module must never do is invent a wire spelling. A row that
 * declares no dict is served by the installed catalog, whose per-level wire
 * spellings only pi-ai knows and which are NOT the level names — the shipped
 * catalog maps `minimal -> "low"`, `high -> "HIGH"`, `low -> "high"` and
 * `off -> "none"` across its providers. Restating those levels from here would
 * silently change what goes on the wire, and declaring only the new level would
 * silently drop the levels the user still has. Both are refused instead, and the
 * refusal says which of the two situations the model is in.
 */
import { isThinkingLevel, THINKING_LEVEL_NAMES, type ThinkingLevel } from './effort.js'
import type { ModelRow } from './vision-setting.js'

/**
 * The levels a row declares for itself, or undefined when it declares none.
 *
 * `false` is a declaration too — "this model does not reason" — and it is not a
 * dict this module may extend. So is an array or a string, which a hand-edited
 * document can hold where the schema expects a dict.
 * @param row - one model entry of a provider profile.
 * @returns the row's own level→wire dict, or undefined when it declares none.
 */
export function declaredEfforts(row: ModelRow): Record<string, string | null> | undefined {
  const declared = row.reasoningEfforts
  if (typeof declared !== 'object' || declared === null || Array.isArray(declared)) return undefined
  return declared as Record<string, string | null>
}

/**
 * Extend one row's declaration with a level, keeping every level it already
 * declares and every other field of the row.
 *
 * The wire value for an added level is the level name itself, which is how a
 * profile author spells it by hand (`"xhigh": "xhigh"`). `off` is the one level
 * whose value may be null — the declaration for "supported, send no parameter"
 * (`llm-pi-ai/src/catalog.ts:306-309`).
 *
 * A row that declares no dict is returned unchanged: see the module note. A row
 * that already declares the level is also returned with an equal declaration,
 * so re-adding an offered level cannot corrupt it.
 * @param models - the provider's model rows.
 * @param modelId - the row to change.
 * @param level - the level to add.
 * @returns a new array; neither the input array nor any row is mutated.
 */
export function addEffort(models: readonly ModelRow[], modelId: string, level: ThinkingLevel): ModelRow[] {
  return models.map(row => {
    if (row.id !== modelId) return row
    const declared = declaredEfforts(row)
    if (declared === undefined) return row
    return { ...row, reasoningEfforts: { ...declared, [level]: level === 'off' ? null : level } }
  })
}

/**
 * What the Custom row does with a value that was just typed, before any read.
 *
 * `read` is the one outcome that needs the settings document: the value is a
 * level the schema accepts but the model does not offer, so the decision depends
 * on whether the model's row declares a dict to extend.
 */
export type TypedEffortPlan =
  | { kind: 'select'; effort: string }
  | { kind: 'read'; level: ThinkingLevel }
  | { kind: 'refuse'; reason: string }

/**
 * Decide what a typed value means against the levels the model currently offers.
 *
 * A level the model already offers is selected with no write at all: it is
 * already declared, so there is nothing to add and no reason to touch the
 * document. A value outside the seven level names is refused here — in the menu,
 * where it was typed — rather than accepted and rejected by the Host later.
 * @param typed - the trimmed text from the Custom row.
 * @param offered - the level ids the model's `reasoning.efforts` publishes.
 * @returns the plan, never a bare string.
 */
export function planTypedEffort(typed: string, offered: readonly string[]): TypedEffortPlan {
  if (!isThinkingLevel(typed)) {
    return {
      kind: 'refuse',
      reason: `"${typed}" không phải tên mức suy luận hợp lệ. Chỉ nhận: ${THINKING_LEVEL_NAMES}.`,
    }
  }
  if (offered.includes(typed)) return { kind: 'select', effort: typed }
  return { kind: 'read', level: typed }
}

/** What the Custom row does once the model's own declaration has been read. */
export type DeclarationPlan =
  | { kind: 'declare'; models: ModelRow[] }
  | { kind: 'refuse'; reason: string }

/**
 * Decide whether a level can be added to the model's declaration, and produce
 * the provider's `models` array to write when it can.
 * @param level - the level to add, already known to be in the vocabulary.
 * @param models - the provider's declared rows, or undefined when the document
 * does not describe the provider route at all.
 * @param modelId - the row to change.
 * @returns the rows to write, or the reason the level cannot be added.
 */
export function planDeclaration(
  level: ThinkingLevel,
  models: readonly ModelRow[] | undefined,
  modelId: string,
): DeclarationPlan {
  if (models === undefined) {
    return {
      kind: 'refuse',
      reason: `Không tìm thấy provider của model "${modelId}" trong cấu hình nên không thêm được mức "${level}".`,
    }
  }
  const row = models.find(candidate => candidate.id === modelId)
  if (row === undefined) {
    return {
      kind: 'refuse',
      reason: `Model "${modelId}" không có dòng khai báo trong cấu hình (route này phục vụ catalog cài sẵn),`
        + ` nên không thêm được mức "${level}". Khai báo model kèm reasoningEfforts trong Settings rồi thêm lại.`,
    }
  }
  if (declaredEfforts(row) === undefined) {
    return {
      kind: 'refuse',
      reason: `Model "${modelId}" không khai báo reasoningEfforts: các mức hiện có đến từ catalog cài sẵn và`
        + ' cách viết trên đường truyền của chúng chỉ catalog biết, nên thêm một mức sẽ phải khai báo lại'
        + ` chúng. Khai báo reasoningEfforts cho model này trong Settings rồi thêm mức "${level}" lại.`,
    }
  }
  return { kind: 'declare', models: addEffort(models, modelId, level) }
}
