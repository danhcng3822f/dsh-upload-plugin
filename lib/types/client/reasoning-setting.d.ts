/**
 * Read-modify-write for one model row's reasoning-effort declaration, and the
 * decision the composer's effort menu makes with it.
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
 * declares no dict while the Host *reports* levels is served by the installed
 * catalog, whose per-level wire spellings only pi-ai knows and which are NOT the
 * level names — the shipped catalog maps `minimal -> "low"`, `high -> "HIGH"`,
 * `low -> "high"` and `off -> "none"` across its providers. Restating those
 * levels from here would silently change what goes on the wire, and declaring
 * only the new level would silently drop the levels the user still has. Both are
 * refused instead, and the refusal says which of the two situations the model is
 * in.
 *
 * A row that declares nothing while the Host reports NOTHING is the one
 * undeclared case that is safe to write, and it is why the decision needs both
 * facts at once: there is no catalog vocabulary in play for that model — the
 * Host reported none — so a fresh declaration destroys nothing and preserves
 * nothing. See {@link planDeclaration}.
 */
import { type DeclarableLevel, type ThinkingLevel } from './effort.js';
import type { ModelRow } from './vision-setting.js';
/**
 * The levels a row declares for itself, or undefined when it declares none.
 *
 * `false` is a declaration too — "this model does not reason" — and it is not a
 * dict this module may extend. So is an array or a string, which a hand-edited
 * document can hold where the schema expects a dict. To tell any of those apart
 * from a field that is not there at all, use {@link hasEffortDeclaration}.
 * @param row - one model entry of a provider profile.
 * @returns the row's own level→wire dict, or undefined when it declares none.
 */
export declare function declaredEfforts(row: ModelRow): Record<string, string | null> | undefined;
/**
 * Whether the row carries a `reasoningEfforts` value of ANY kind.
 *
 * This is not the same question as {@link declaredEfforts}, and the difference
 * is the whole of the first-declaration rule: `false` — "this model does not
 * reason" — is a declaration an author made on purpose, and overwriting it with
 * levels would contradict it, while a field that is not there at all is the one
 * state a first declaration may be written into.
 *
 * The distinction is readable from the settings document: the value
 * `settings.describe` returns is the namespace's *resolved* section
 * (`settings/settings/src/index.ts:492-496`), and the profile schema keeps an
 * absent field distinguishable from `false`
 * (`llm-pi-ai/src/config.ts:217-220`, asserted in
 * `llm-pi-ai/tests/config.spec.ts:27-33`).
 * @param row - one model entry of a provider profile.
 * @returns whether the row declares `reasoningEfforts` at all.
 */
export declare function hasEffortDeclaration(row: ModelRow): boolean;
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
export declare function addEffort(models: readonly ModelRow[], modelId: string, level: ThinkingLevel): ModelRow[];
/**
 * Write a row's FIRST declaration: `off`, plus the one level the user picked.
 *
 * Nothing else is declared, and that is the point. A level the user did not ask
 * for may not exist on the provider, and offering it is the failure this whole
 * design avoids; `off` is the one companion that is always safe, and it is what
 * makes "not thinking" expressible (`llm-pi-ai/src/catalog.ts:306-309`). The
 * level name is its own wire value, which is what a profile author spells by
 * hand, and every other field of the row survives.
 *
 * `off` cannot be the picked level — see {@link DeclarableLevel} — so the result
 * always offers a level beyond `off`, which is what resolution requires.
 * @param models - the provider's model rows.
 * @param modelId - the row to declare for.
 * @param level - the level to declare, already known to be declarable alone.
 * @returns a new array; neither the input array nor any row is mutated.
 */
export declare function declareFirstEffort(models: readonly ModelRow[], modelId: string, level: DeclarableLevel): ModelRow[];
/**
 * What the Custom row does with a value that was just typed, before any read.
 *
 * `read` is the one outcome that needs the settings document: the value is a
 * level the schema accepts but the model does not offer, so the decision depends
 * on whether the model's row declares a dict to extend.
 */
export type TypedEffortPlan = {
    kind: 'select';
    effort: string;
} | {
    kind: 'read';
    level: ThinkingLevel;
} | {
    kind: 'refuse';
    reason: string;
};
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
export declare function planTypedEffort(typed: string, offered: readonly string[]): TypedEffortPlan;
/** What the menu does once the model's own declaration has been read. */
export type DeclarationPlan = {
    kind: 'declare';
    models: ModelRow[];
    /**
     * True when the row declared nothing and this write is the declaration it
     * never had, rather than an extension of one it already had. The menu says
     * which of the two happened.
     */
    first: boolean;
} | {
    kind: 'refuse';
    reason: string;
};
/**
 * Decide whether a level can be written into the model's declaration, and
 * produce the provider's `models` array to write when it can.
 *
 * Both facts the decision turns on are parameters, because they are read from
 * two different sources and only their CONJUNCTION is safe:
 *
 * | the row's `reasoningEfforts` | the Host reports | outcome |
 * | --- | --- | --- |
 * | a dict | levels | extended — every level it declares keeps its spelling |
 * | absent | **nothing** | **declared** — `off` plus the level, nothing else |
 * | absent | levels (a catalog base) | refused — the spellings are the catalog's |
 * | present, not a dict | either | refused — `false` is a declaration too |
 *
 * A row that declares nothing while the Host reports levels is served by the
 * installed catalog: adding one level would mean restating the others, and their
 * wire spellings are the catalog's, not the level names. A row that declares
 * nothing while the Host reports NOTHING has no vocabulary to preserve — there is
 * no catalog spelling in play for it, because the Host reported no levels at all
 * — so a fresh declaration destroys nothing, which is exactly the edit the user
 * makes by hand today.
 * @param level - the level to write, already known to be in the vocabulary.
 * @param models - the provider's declared rows, or undefined when the document
 * does not describe the provider route at all.
 * @param modelId - the row to change.
 * @param hostReportsLevels - whether the Host publishes any level for this model:
 * the other half of the conjunction above, and the fact that keeps a
 * catalog-served model out of the declaration path.
 * @returns the rows to write, or the reason the level cannot be written.
 */
export declare function planDeclaration(level: ThinkingLevel, models: readonly ModelRow[] | undefined, modelId: string, hostReportsLevels: boolean): DeclarationPlan;
