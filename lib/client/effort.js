/**
 * Reasoning-effort menu construction, and the vocabulary a Custom value is
 * checked against.
 *
 * The vocabulary is the Host's, per model: `reasoning.efforts` is what the model
 * declares, so the menu can never offer a level the Host would reject. A Custom
 * row lets the user name a value the catalog does not list — and because the
 * model's declaration IS that catalog, naming one means extending the
 * declaration, which is what {@link THINKING_LEVELS} bounds.
 *
 * There are two menus, and which one applies is decided by one conjunction —
 * whether the Host reports any level AND whether the model's settings row
 * declares any. When the Host reports levels, {@link effortChoices} builds the
 * menu from them. When it reports nothing, the control has no vocabulary to
 * build from; {@link firstDeclarationChoices} stands in only for the state where
 * the row declares nothing either, so there is nothing to preserve.
 */
/** Menu key of the free-text row. */
export const CUSTOM_EFFORT_KEY = 'custom';
/**
 * pi-ai's canonical thinking levels, in pi-ai's escalation order — the ONLY keys
 * a model's `reasoningEfforts` may declare.
 *
 * Copied from the harness's own drift gate (`llm-pi-ai/src/catalog.ts:69-77`),
 * which the profile schema validates the declaration's keys against
 * (`llm-pi-ai/src/config.ts:203-206`). The Host publishes a model's *declared*
 * levels but never this list, so a typed Custom value has to be checked against
 * a copy held here — the same posture `platform-modules.d.ts` takes for every
 * other harness contract this plugin cannot import. A pi-ai upgrade that changes
 * the set makes this copy stale; the notice the user sees is generated from it
 * rather than restated, so the two cannot disagree with each other.
 */
export const THINKING_LEVELS = ['off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'];
/**
 * Whether a typed value names a level the declaration schema accepts.
 *
 * A key outside these seven is rejected at the schema, so an arbitrary string —
 * a token budget, a provider-specific spelling — cannot be declared at all. It
 * has to be refused where it is typed instead of accepted and refused later.
 * @param value - the trimmed text the user typed into the Custom row.
 * @returns whether the value is one of the seven level names.
 */
export function isThinkingLevel(value) {
    return THINKING_LEVELS.includes(value);
}
/** The accepted levels, spelled for a notice. */
export const THINKING_LEVEL_NAMES = THINKING_LEVELS.join(', ');
/**
 * The levels a first declaration may name, in pi-ai's escalation order.
 *
 * Derived from {@link THINKING_LEVELS} rather than restated, so the two cannot
 * drift: a pi-ai upgrade that adds or removes a level moves this list with it.
 */
export const DECLARABLE_LEVELS = THINKING_LEVELS.filter((level) => level !== 'off');
/**
 * Whether a value names a level a first declaration may contain.
 * @param value - the value to test.
 * @returns whether the value is one of the six declarable level names.
 */
export function isDeclarableLevel(value) {
    return DECLARABLE_LEVELS.includes(value);
}
/**
 * The label the Host's own directory gives a level.
 *
 * Mirrors the naming `reasoningInfo` applies to every level it reports
 * (`llm-pi-ai/src/adapter.ts:169`), so a level reads the same in the
 * first-declaration menu and in the menu the Host's report produces afterwards.
 * @param level - the level to spell.
 * @returns the level name with its first letter capitalized.
 */
export function thinkingLevelLabel(level) {
    return `${level.charAt(0).toUpperCase()}${level.slice(1)}`;
}
/**
 * Whether the model publishes any level at all.
 *
 * The Host builds a model's `reasoning.efforts` from the levels resolution
 * supports, and leaves `reasoning` out entirely when there are none
 * (`llm-pi-ai/src/adapter.ts:159-174`). So "reports nothing" is the missing list
 * or an empty one, and it is one half of the conjunction that decides whether a
 * missing declaration may be written; the settings row's own state is the other
 * half (`../reasoning-setting.js`). Both are needed: a model whose levels come
 * from the installed catalog reports them, and must never be touched.
 * @param reasoning - the resolved model's reasoning share, as the directory publishes it.
 * @returns whether the model names at least one level.
 */
export function reportsEfforts(reasoning) {
    return reasoning !== undefined && reasoning.efforts.length > 0;
}
/**
 * Build the effort menu for one model.
 * @param reasoning - the model's declared reasoning metadata; nothing reported = no effort control.
 * @param current - the session's chosen effort, when it has one.
 */
export function effortChoices(reasoning, current) {
    if (!reportsEfforts(reasoning))
        return [];
    const effective = current ?? reasoning.defaultEffort;
    const rows = reasoning.efforts.map(effort => ({
        key: `effort:${effort.id}`,
        effort: effort.id,
        label: effort.name,
        ...effort.description === undefined ? {} : { description: effort.description },
        selected: effort.id === effective,
    }));
    rows.push({ key: CUSTOM_EFFORT_KEY, label: 'Custom…', selected: false, custom: true });
    return rows;
}
/**
 * Build the menu for a model that reports no level AND declares none.
 *
 * This is the one state where a level can be declared without restating
 * anything: the Host reported no vocabulary at all, so there is no catalog
 * spelling in play for this model, and the row's own declaration is absent
 * rather than a dict whose other levels would have to be repeated. The level
 * names are therefore the whole offer, and picking one writes the declaration
 * that the model's row never had — the same act the user performs by hand today.
 *
 * The offer is {@link DECLARABLE_LEVELS} rather than all seven: `off` cannot
 * stand alone in a declaration, so it is not a level this menu can act on. It
 * joins the menu as an ordinary row the moment one of these is declared.
 *
 * No row is selected: nothing is in effect on a model the Host reports no levels
 * for, whatever the session last asked for. There is no Custom… row either —
 * Custom… exists to *extend* a declaration, and every level it could name is
 * already a row here.
 * @returns one row per declarable level, in pi-ai's escalation order.
 */
export function firstDeclarationChoices() {
    return DECLARABLE_LEVELS.map(level => ({
        key: `effort:${level}`,
        effort: level,
        label: thinkingLevelLabel(level),
        selected: false,
    }));
}
/** The label the trigger shows for the effective effort. */
export function effortLabel(reasoning, current) {
    if (reasoning === undefined)
        return undefined;
    const effective = current ?? reasoning.defaultEffort;
    if (effective === undefined)
        return undefined;
    return reasoning.efforts.find(e => e.id === effective)?.name ?? effective;
}
